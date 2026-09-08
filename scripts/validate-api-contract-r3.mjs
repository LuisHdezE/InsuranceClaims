import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const fail = (message) => {
  console.error(`API CONTRACT R3: FAIL — ${message}`);
  process.exit(1);
};
const assert = (condition, message) => {
  if (!condition) fail(message);
};

const inventoryPath = 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json';
const impactPath = '.blueprint/api-impact/API-IMPACT-002.json';
const contractPath = 'documentation/api/r3/API_CONTRACT_R3.md';
const reviewPath = 'documentation/api/r3/API_CONTRACT_R3_REVIEW.md';

const inventory = readJson(inventoryPath);
const impact = readJson(impactPath);
const contract = readFileSync(contractPath, 'utf8');
const review = readFileSync(reviewPath, 'utf8');

assert(inventory.contract_revision === 'api-v1-r3', 'contract revision must be api-v1-r3');
assert(inventory.previous_revision === 'api-v1-r2', 'previous revision must be api-v1-r2');
assert(inventory.blueprint_version === '0.5.2', 'Blueprint consumer baseline must be 0.5.2');
assert(inventory.effective_operation_count === 90, 'effective operation count must be 90');
assert(inventory.inherited_operation_count === 15, 'inherited operation count must be 15');
assert(inventory.new_operation_count === 75, 'new operation count must be 75');
assert(inventory.changed_existing_operation_count === 7, 'changed existing operation count must be 7');
assert(Array.isArray(inventory.families), 'families must be an array');
assert(Array.isArray(inventory.operation_tuple_fields), 'operation tuple field legend is required');
assert(inventory.operation_tuple_fields.length === 12, 'operation tuple shape must contain 12 fields');

const operations = inventory.families.flatMap((family) => {
  assert(typeof family.id === 'string' && family.id.length > 0, 'every family requires an id');
  assert(Array.isArray(family.operations), `family ${family.id} must contain operations`);
  return family.operations;
});

assert(operations.length === 90, `inventory contains ${operations.length} operations instead of 90`);

const operationIds = operations.map((operation) => operation[0]);
assert(new Set(operationIds).size === 90, 'operationId values must be unique');

for (const operation of operations) {
  assert(Array.isArray(operation) && operation.length === 12, `invalid tuple shape for ${operation?.[0] ?? 'unknown operation'}`);
  const [operationId, method, path, authentication, , , successContract, requirements, useCases] = operation;
  assert(typeof operationId === 'string' && operationId.length > 0, 'operationId is required');
  assert(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method), `unsupported method for ${operationId}`);
  assert(typeof path === 'string' && (path.startsWith('/api/v1/') || path.startsWith('/health/')), `invalid path for ${operationId}`);
  assert(typeof authentication === 'string' && authentication.length > 0, `authentication context missing for ${operationId}`);
  assert(typeof successContract === 'string' && /^2\d\d:/.test(successContract), `success contract missing for ${operationId}`);
  assert(Array.isArray(requirements) && requirements.length > 0, `requirements missing for ${operationId}`);
  assert(Array.isArray(useCases) && useCases.length > 0, `use cases missing for ${operationId}`);
}

const requiredHistoricalIds = [
  'verifyPolicyVehicle','createClaim','trackClaim','authenticateOperator','listClaims','getClaimDetail',
  'downloadClaimEvidence','transitionClaimStatus','getLiveness','getReadiness','listTasks','listClaimTasks',
  'completeClaimTask','getClaimTimeline','getClaimEvidenceAttention'
];
for (const id of requiredHistoricalIds) assert(operationIds.includes(id), `historical operationId ${id} must be preserved`);

const coveredRequirements = new Set(operations.flatMap((operation) => operation[7]));
for (let number = 20; number <= 52; number += 1) {
  const requirement = `FR-${String(number).padStart(3, '0')}`;
  assert(coveredRequirements.has(requirement), `${requirement} has no API traceability`);
}

assert(inventory.auth_contract?.staff?.lifetime_seconds === 900, 'staff JWT lifetime must be 900 seconds');
assert(inventory.auth_contract?.customer?.lifetime_seconds === 1800, 'customer JWT lifetime must be 1800 seconds');
assert(inventory.auth_contract?.integration?.clock_skew_seconds === 300, 'integration clock skew must be 300 seconds');
assert(inventory.pagination?.max_page_size === 100, 'page size max must be 100');

assert(impact.schema_version === '0.5.0', 'API impact schema_version must be 0.5.0');
assert(impact.change_id === 'API-IMPACT-002', 'API impact id must be API-IMPACT-002');
assert(impact.previous_revision === 'api-v1-r2' && impact.new_revision === 'api-v1-r3', 'API impact revision chain is invalid');
assert(impact.classification === 'platform_cross_cutting', 'R3 impact must be platform_cross_cutting');
assert(impact.revalidation_policy === 'platform', 'platform_cross_cutting requires platform revalidation');
assert(impact.preserve_unrelated_evidence === true, 'unrelated accepted evidence must be preserved');
assert(Array.isArray(impact.changed_operation_ids) && impact.changed_operation_ids.length === 82, 'impact must list 7 refined + 75 new operationIds');
assert(new Set(impact.changed_operation_ids).size === 82, 'impact changed_operation_ids must be unique');
for (const id of impact.changed_operation_ids) assert(operationIds.includes(id), `impact references unknown operationId ${id}`);
assert(Array.isArray(impact.evidence_ids) && impact.evidence_ids.length >= 1, 'impact evidence_ids are required by schema');
for (const id of impact.evidence_ids) assert(/^EVD-[A-Z0-9][A-Z0-9._-]*$/.test(id), `invalid evidence id ${id}`);

for (const marker of [
  '**90 REST operations**',
  'AUTHENTICATION_CONTEXT_MISMATCH',
  'X-Event-Signature',
  'API-IMPACT-002',
  'API Implementation',
  'OpenAPI Formalization & Validation'
]) assert(contract.includes(marker), `contract marker missing: ${marker}`);

for (const check of [
  'api.scope_defined','api.endpoint_inventory','api.auth_contract','api.permission_matrix',
  'api.audit_event_mapping','api.idempotency_matrix','api.contract_traceability','api.change_impact_analysis'
]) assert(review.includes(check), `review mapping missing Blueprint check ${check}`);

console.log('API CONTRACT R3: PASS');
console.log(`operations=${operations.length}; inherited=15; new=75; impact=${impact.changed_operation_ids.length}; FR-020..FR-052=covered`);
