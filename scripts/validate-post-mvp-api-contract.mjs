import fs from 'node:fs';
import crypto from 'node:crypto';

const files = {
  bundle: '.runtime/openapi-v1-r2-additions.bundle.json',
  baseInventory: 'documentation/api/API_ENDPOINT_INVENTORY.json',
  additionsInventory: 'documentation/api/post-mvp/API_ENDPOINT_INVENTORY_R2_ADDITIONS.json',
  manifest: 'documentation/api/post-mvp/API_CONTRACT_REVISION_R2.json',
  impact: '.blueprint/api-impact/API-IMPACT-001.json',
  evidence: 'documentation/api/post-mvp/evidence-r2.json',
};

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sameSet(left, right) {
  const a = sorted(new Set(left));
  const b = sorted(new Set(right));
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function gitBlobSha1(path) {
  const bytes = fs.readFileSync(path);
  const header = Buffer.from(`blob ${bytes.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function openApiOperations(doc) {
  const result = [];
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
  for (const [path, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!methods.has(method.toLowerCase())) continue;
      result.push({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId,
        permission: operation['x-permission-intent'] ?? null,
        rateLimit: operation['x-rate-limit'] ?? null,
        responses: operation.responses ?? {},
      });
    }
  }
  return result;
}

const bundle = readJson(files.bundle);
const baseInventory = readJson(files.baseInventory);
const additionsInventory = readJson(files.additionsInventory);
const manifest = readJson(files.manifest);
const impact = readJson(files.impact);
const evidence = readJson(files.evidence);

assert(baseInventory.contract_revision === 'api-v1-r1', 'Historical base inventory must remain api-v1-r1.');
assert(manifest.previous_revision === 'api-v1-r1', 'R2 manifest previous_revision must be api-v1-r1.');
assert(manifest.contract_revision === 'api-v1-r2', 'R2 manifest must declare api-v1-r2.');
assert(additionsInventory.effective_revision === 'api-v1-r2', 'Additions inventory effective revision mismatch.');
assert(additionsInventory.previous_revision === 'api-v1-r1', 'Additions inventory previous revision mismatch.');

assert(
  gitBlobSha1(manifest.composition.base_openapi) === manifest.composition.base_openapi_git_blob_sha1,
  'Historical openapi.yaml drifted from the immutable r1 pin.',
);
assert(
  gitBlobSha1(manifest.composition.base_inventory) === manifest.composition.base_inventory_git_blob_sha1,
  'Historical API_ENDPOINT_INVENTORY.json drifted from the immutable r1 pin.',
);

const baseOps = baseInventory.operations ?? [];
const additionOps = additionsInventory.operations ?? [];
const bundleOps = openApiOperations(bundle);

assert(baseOps.length === manifest.composition.base_operation_count, 'Unexpected r1 operation count.');
assert(additionOps.length === manifest.composition.additive_operation_count, 'Unexpected r2 additive operation count.');
assert(
  baseOps.length + additionOps.length === manifest.composition.effective_operation_count,
  'Effective r2 operation count mismatch.',
);

const baseIds = baseOps.map((item) => item.operationId);
const additionIds = additionOps.map((item) => item.operationId);
const bundleIds = bundleOps.map((item) => item.operationId);
assert(baseIds.every(Boolean), 'Every r1 operation must have an operationId.');
assert(additionIds.every(Boolean), 'Every r2 additive operation must have an operationId.');
assert(bundleIds.every(Boolean), 'Every OpenAPI r2 additive operation must have an operationId.');
assert(new Set(baseIds).size === baseIds.length, 'Duplicate r1 operationId detected.');
assert(new Set(additionIds).size === additionIds.length, 'Duplicate r2 additive operationId detected.');
assert(!additionIds.some((id) => baseIds.includes(id)), 'R2 additions must not override an r1 operationId.');
assert(sameSet(additionIds, bundleIds), 'OpenAPI r2 operationIds differ from the additive inventory.');

const basePairs = new Set(baseOps.map((item) => `${item.method.toUpperCase()} ${item.path}`));
for (const item of additionOps) {
  assert(!basePairs.has(`${item.method.toUpperCase()} ${item.path}`), `R2 overrides r1 route ${item.method} ${item.path}.`);
}

for (const inventoryOp of additionOps) {
  const contractOp = bundleOps.find(
    (candidate) =>
      candidate.operationId === inventoryOp.operationId &&
      candidate.method === inventoryOp.method.toUpperCase() &&
      candidate.path === inventoryOp.path,
  );
  assert(contractOp, `OpenAPI operation missing for ${inventoryOp.operationId}.`);
  assert(contractOp.permission === inventoryOp.permission, `Permission drift for ${inventoryOp.operationId}.`);
  assert(contractOp.rateLimit === inventoryOp.rate_limit, `Rate-limit drift for ${inventoryOp.operationId}.`);
  assert(
    Object.hasOwn(contractOp.responses, String(inventoryOp.success_status)),
    `Success status ${inventoryOp.success_status} missing for ${inventoryOp.operationId}.`,
  );
}

assert(impact.schema_version === '0.5.0', 'api-impact schema_version must be 0.5.0.');
assert(impact.change_id === 'API-IMPACT-001', 'Unexpected api-impact change_id.');
assert(impact.previous_revision === manifest.previous_revision, 'api-impact previous revision mismatch.');
assert(impact.new_revision === manifest.contract_revision, 'api-impact new revision mismatch.');
assert(impact.classification === 'platform_cross_cutting', 'R2 impact must be platform_cross_cutting.');
assert(impact.revalidation_policy === 'platform', 'Platform-cross-cutting impact must revalidate the platform.');
assert(impact.preserve_unrelated_evidence === true, 'api-impact must preserve unrelated evidence.');
assert(sameSet(impact.changed_operation_ids, additionIds), 'api-impact changed_operation_ids must equal r2 additions.');

const affected = impact.affected_slices ?? [];
assert(
  affected.some((slice) => slice.id === 'claims-backoffice' && slice.platform === 'web'),
  'api-impact must identify the claims-backoffice web slice.',
);

const evidenceIds = new Set((evidence.evidence ?? []).map((item) => item.id));
for (const evidenceId of impact.evidence_ids ?? []) {
  assert(evidenceIds.has(evidenceId), `api-impact references missing evidence ${evidenceId}.`);
}

assert(
  manifest.blueprint_api_impact.canonical_schema_version === '0.5.0',
  'Manifest must pin the canonical api-impact schema version.',
);
assert(
  manifest.blueprint_api_impact.canonical_schema_git_blob_sha1 === 'bf3d0c3bcb0e42648a6eedbc39f6a6968531fbc0',
  'Unexpected Blueprint api-impact schema pin.',
);

console.log(JSON.stringify({
  event: 'POST_MVP_API_CONTRACT_R2_PASS',
  previousRevision: manifest.previous_revision,
  revision: manifest.contract_revision,
  baseOperations: baseOps.length,
  additiveOperations: additionOps.length,
  effectiveOperations: baseOps.length + additionOps.length,
  changedOperationIds: sorted(additionIds),
  impactClassification: impact.classification,
  revalidationPolicy: impact.revalidation_policy,
  preservedHistoricalContract: true,
}));
