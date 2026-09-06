import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (message) => {
  console.error(`INTERFACE_INVENTORY_FAIL: ${message}`);
  process.exitCode = 1;
};

const inventory = readJson('.blueprint/ui/interface-inventory.json');
const baseline = readJson('.blueprint/ui/interface-scope-baseline.json');
const api = readJson('documentation/api/API_ENDPOINT_INVENTORY.json');

if (inventory.schema_version !== '0.5.0') fail('schema_version must be 0.5.0');
if (inventory.project !== 'LuisHdezE/InsuranceClaims') fail('unexpected project');
if (inventory.mode !== 'greenfield') fail('mode must be greenfield');
if (inventory.maturity !== 'EXECUTABLE_INVENTORY') fail('maturity must be EXECUTABLE_INVENTORY');
if (inventory.reconciled_from !== '.blueprint/ui/interface-scope-baseline.json') fail('reconciled_from must point to the approved scope baseline');
if (inventory.baseline_revision !== baseline.baseline_revision) fail('baseline_revision drift');

const baselineIds = baseline.items.map((item) => item.id).sort();
const inventoryIds = inventory.items.map((item) => item.id).sort();
if (JSON.stringify(baselineIds) !== JSON.stringify(inventoryIds)) {
  fail(`inventory IDs must exactly reconcile baseline IDs: baseline=${baselineIds.join(',')} inventory=${inventoryIds.join(',')}`);
}
if (inventory.items.length !== 10) fail(`expected exactly 10 committed interfaces, got ${inventory.items.length}`);
if (inventory.items.some((item) => item.platform !== 'web')) fail('this consumer has web=true/android=false; inventory must contain only web items');
if (inventory.items.some((item) => !/^WEB-\d{3}$/.test(item.id))) fail('all inventory IDs must be WEB-###');

const itemById = new Map(inventory.items.map((item) => [item.id, item]));
const baselineById = new Map(baseline.items.map((item) => [item.id, item]));
const canonicalOps = new Map(api.operations.map((op) => [op.operationId, op]));
const operationIds = new Set(canonicalOps.keys());
const canonicalPermissions = new Set(Object.keys(api.permission_matrix));
const allowedSlices = new Set(['digital-claim-intake', 'claims-backoffice', 'customer-claim-tracking']);
const allowedStates = new Set(['default','loading','empty','filtered_empty','success','error','offline','401','403','404','409','422','429']);
const allowedActionKinds = new Set(['navigate','read','create','update','delete','transition','download','print','local','proposed']);
const routes = new Set();

for (const item of inventory.items) {
  const sourceBaseline = baselineById.get(item.id);
  if (!sourceBaseline) fail(`${item.id}: missing baseline item`);
  if (item.source_classification !== 'PROPOSED') fail(`${item.id}: Greenfield inventory item must remain PROPOSED`);
  if (!['PROPOSED', 'MISSING'].includes(item.implementation_status)) fail(`${item.id}: invalid implementation_status for PROPOSED item`);
  if (!Array.isArray(item.requirements) || item.requirements.length === 0) fail(`${item.id}: requirements must be linked`);
  if (!Array.isArray(item.states) || item.states.length === 0) fail(`${item.id}: at least one state required`);
  for (const state of item.states) if (!allowedStates.has(state)) fail(`${item.id}: unsupported state ${state}`);
  if (!item.navigation || typeof item.navigation.route !== 'string') fail(`${item.id}: route required`);
  if (routes.has(item.navigation.route)) fail(`${item.id}: duplicate route ${item.navigation.route}`);
  routes.add(item.navigation.route);
  if (item.navigation.route !== sourceBaseline.navigation.route) fail(`${item.id}: route drift from approved baseline`);
  if (!item.responsive) fail(`${item.id}: responsive intent required`);
  if (!Array.isArray(item.accessibility) || item.accessibility.length === 0) fail(`${item.id}: accessibility intent required`);
  if (!Array.isArray(item.unresolved_api_needs) || item.unresolved_api_needs.length !== 0) fail(`${item.id}: unresolved API needs remain after API Gate`);

  const baselineReqs = new Set(sourceBaseline.requirements ?? []);
  for (const requirement of baselineReqs) {
    if (!item.requirements.includes(requirement)) fail(`${item.id}: lost baseline requirement ${requirement}`);
  }
  const baselinePermissions = [...(sourceBaseline.permissions ?? [])].sort();
  const inventoryPermissions = [...(item.permissions ?? [])].sort();
  if (JSON.stringify(baselinePermissions) !== JSON.stringify(inventoryPermissions)) {
    fail(`${item.id}: permission intent drift from baseline`);
  }
  for (const permission of item.permissions ?? []) {
    if (!canonicalPermissions.has(permission)) fail(`${item.id}: unknown permission ${permission}`);
  }

  for (const dependency of item.dependencies ?? []) {
    if (!itemById.has(dependency)) fail(`${item.id}: dependency ${dependency} does not exist`);
    if (dependency === item.id) fail(`${item.id}: self dependency is not allowed`);
  }
  for (const destination of item.navigation.destinations ?? []) {
    if (!itemById.has(destination)) fail(`${item.id}: destination ${destination} does not exist`);
  }
  if (item.slice_id && !allowedSlices.has(item.slice_id)) fail(`${item.id}: unapproved slice ${item.slice_id}`);

  const linkedOps = new Set();
  for (const datum of item.data ?? []) {
    const ops = datum.operation_ids ?? [];
    if (datum.source === 'api' && ops.length === 0) fail(`${item.id}: API datum ${datum.name} must bind canonical operationId(s)`);
    for (const opId of ops) {
      linkedOps.add(opId);
      if (!operationIds.has(opId)) fail(`${item.id}: datum ${datum.name} references unknown operationId ${opId}`);
    }
  }
  for (const action of item.actions ?? []) {
    if (!allowedActionKinds.has(action.kind)) fail(`${item.id}: action ${action.name} has unsupported kind ${action.kind}`);
    const ops = action.operation_ids ?? [];
    for (const opId of ops) {
      linkedOps.add(opId);
      const op = canonicalOps.get(opId);
      if (!op) {
        fail(`${item.id}: action ${action.name} references unknown operationId ${opId}`);
        continue;
      }
      if ((op.permission ?? null) !== (action.permission ?? null)) {
        fail(`${item.id}: action ${action.name} permission ${action.permission ?? 'null'} does not match ${opId} permission ${op.permission ?? 'null'}`);
      }
    }
    if (['create','read','update','delete','transition','download'].includes(action.kind) && ops.length === 0 && action.kind !== 'local') {
      if (!['Open claim detail'].includes(action.name)) fail(`${item.id}: executable action ${action.name} must bind an operationId or be explicitly local/navigation`);
    }
  }

  for (const op of api.operations) {
    if ((op.interfaces ?? []).includes(item.id) && !linkedOps.has(op.operationId)) {
      fail(`${item.id}: API inventory maps ${op.operationId} to this interface but executable inventory does not bind it`);
    }
  }
}

const reconciliation = inventory.baseline_reconciliation ?? [];
if (reconciliation.length !== baselineIds.length) fail('baseline_reconciliation must cover every baseline interface exactly once');
const reconciledIds = new Set();
for (const entry of reconciliation) {
  if (reconciledIds.has(entry.baseline_id)) fail(`duplicate reconciliation entry ${entry.baseline_id}`);
  reconciledIds.add(entry.baseline_id);
  if (!baselineById.has(entry.baseline_id)) fail(`unknown reconciliation baseline ID ${entry.baseline_id}`);
  if (entry.disposition !== 'COMMITTED') fail(`${entry.baseline_id}: scope reduction requires explicit reviewed reason; current MVP keeps all 10 committed`);
}

const visualOps = new Set();
for (const item of inventory.items) {
  for (const datum of item.data ?? []) for (const op of datum.operation_ids ?? []) visualOps.add(op);
  for (const action of item.actions ?? []) for (const op of action.operation_ids ?? []) visualOps.add(op);
}
if (visualOps.has('getLiveness') || visualOps.has('getReadiness') || visualOps.has('MCP:get_claim_status')) {
  fail('operational health and MCP identities must not be invented as web interfaces');
}

const sliceCoverage = new Map();
for (const item of inventory.items) {
  if (!item.slice_id) continue;
  sliceCoverage.set(item.slice_id, [...(sliceCoverage.get(item.slice_id) ?? []), item.id]);
}
for (const slice of allowedSlices) if (!sliceCoverage.has(slice)) fail(`approved slice ${slice} has no inventory items`);

if (!process.exitCode) {
  console.log(JSON.stringify({
    event: 'INTERFACE_INVENTORY_PASS',
    interfaces: inventory.items.length,
    baseline_reconciled: reconciliation.length,
    web_interfaces: inventory.items.filter((item) => item.platform === 'web').length,
    android_interfaces: inventory.items.filter((item) => item.platform === 'android').length,
    linked_operations: [...visualOps].sort(),
    slices: Object.fromEntries([...sliceCoverage.entries()].sort()),
  }, null, 2));
}
