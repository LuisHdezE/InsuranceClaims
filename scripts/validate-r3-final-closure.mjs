import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const paths = {
  status: '.blueprint/status.yaml',
  project: '.blueprint/project.yaml',
  inventory: 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json',
  impact1: '.blueprint/api-impact/API-IMPACT-001.json',
  impact2: '.blueprint/api-impact/API-IMPACT-002.json',
  openapi: 'openapi.yaml',
  postman: 'postman/InsuranceClaims.postman_collection.json',
  closure: 'documentation/api-implementation/r3/FINAL_CLOSURE_INCREMENT_22.md',
};

const [status, project, inventory, impact1, impact2, openapi, postman, closure] = await Promise.all([
  readFile(paths.status, 'utf8'),
  readFile(paths.project, 'utf8'),
  readFile(paths.inventory, 'utf8').then(JSON.parse),
  readFile(paths.impact1, 'utf8').then(JSON.parse),
  readFile(paths.impact2, 'utf8').then(JSON.parse),
  readFile(paths.openapi, 'utf8').then(JSON.parse),
  readFile(paths.postman, 'utf8').then(JSON.parse),
  readFile(paths.closure, 'utf8'),
]);

function statusEntry(key) {
  const marker = `  ${key}:\n`;
  const start = status.indexOf(marker);
  assert.notEqual(start, -1, `Missing status entry ${key}`);
  const bodyStart = start + marker.length;
  const next = status.slice(bodyStart).search(/^  [a-z0-9_.-]+:\n/m);
  return status.slice(start, next === -1 ? status.length : bodyStart + next);
}

function requirePass(key) {
  const block = statusEntry(key);
  assert.match(block, /\n    status: PASS\n/, `${key} must be PASS`);
  return block;
}

assert.match(project, /blueprint:\n  version: 0\.5\.2\n  mode: greenfield\n/);
assert.match(status, /^blueprint_version: 0\.5\.2$/m);
assert.match(status, /^updated_at: '2026-09-10T01:13:03-03:00'$/m);
assert.match(project, /^  api_impacts_root: \.blueprint\/api-impact$/m);
assert.doesNotMatch(project, /api_impacts_root: \.blueprint\/api-impacts/);

assert.equal(inventory.contract_revision, 'api-v1-r3');
assert.equal(inventory.previous_revision, 'api-v1-r2');
assert.equal(inventory.blueprint_version, '0.5.2');
assert.equal(inventory.mode, 'greenfield');
assert.equal(inventory.legacy_coexistence, 'SIMULATED');
assert.equal(inventory.effective_operation_count, 90);
assert.equal(inventory.inherited_operation_count, 15);
assert.equal(inventory.new_operation_count, 75);
assert.equal(inventory.changed_existing_operation_count, 7);
assert.equal(inventory.families.length, 16);
const tuples = inventory.families.flatMap((family) => family.operations);
assert.equal(tuples.length, 90);
assert.equal(new Set(tuples.map((tuple) => `${tuple[1]} ${tuple[2]}`)).size, 90);
assert.equal(new Set(tuples.map((tuple) => tuple[2])).size, 76);
assert.equal(new Set(tuples.map((tuple) => tuple[0])).size, 90);

assert.equal(impact1.previous_revision, 'api-v1-r1');
assert.equal(impact1.new_revision, 'api-v1-r2');
assert.equal(impact1.classification, 'platform_cross_cutting');
assert.equal(impact1.revalidation_policy, 'platform');
assert.equal(impact1.preserve_unrelated_evidence, true);
assert.equal(impact2.previous_revision, 'api-v1-r2');
assert.equal(impact2.new_revision, 'api-v1-r3');
assert.equal(impact2.classification, 'platform_cross_cutting');
assert.equal(impact2.revalidation_policy, 'platform');
assert.equal(impact2.preserve_unrelated_evidence, true);

for (const key of [
  'api.scope_defined',
  'api.endpoint_inventory',
  'api.auth_contract',
  'api.permission_matrix',
  'api.audit_event_mapping',
  'api.idempotency_matrix',
  'api.contract_traceability',
  'api.change_impact_analysis',
  'api.endpoints_implemented',
  'api.auth_authorization',
  'api.audit_logging',
  'api.backend_tests',
  'api.architecture_implementation_conformance',
  'api.openapi',
  'api.openapi_validation',
  'api.postman_collection',
  'api.postman_environment',
  'api.postman_coverage',
  'api.qa_positive',
  'api.qa_negative',
  'api.contract_validation',
  'api.security_qa',
  'api.audit_qa',
  'api.affected_consumer_revalidation',
]) requirePass(key);

assert.doesNotMatch(statusEntry('api.change_impact_analysis'), /status: N\/A/);
assert.doesNotMatch(statusEntry('api.affected_consumer_revalidation'), /status: N\/A/);
assert.match(statusEntry('api.endpoints_implemented'), /90 frozen R3 REST operations/);
assert.match(statusEntry('api.openapi'), /90-operation api-v1-r3/);
assert.match(statusEntry('api.postman_coverage'), /90\/90 R3 REST request coverage/);

for (const stale of [
  'Initial business REST scope is eight operations plus two operational health routes',
  'All eight approved REST business operations, two health routes',
  'formalizes all ten approved REST operations',
  'contains exactly the ten approved REST operations',
  'Exact static validation proves 10/10 REST request coverage',
  'Initial API baseline with no accepted executable client consumers',
]) assert.ok(!status.includes(stale), `Stale R1 status text remains: ${stale}`);

for (const [id, artifact] of [
  ['API-IMPACT-001', '.blueprint/api-impact/API-IMPACT-001.json'],
  ['API-IMPACT-002', '.blueprint/api-impact/API-IMPACT-002.json'],
]) {
  const pattern = new RegExp(`  - id: ${id}\\n    artifact: ${artifact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n    status: RESOLVED`);
  assert.match(status, pattern, `${id} must be RESOLVED in status`);
}

const expectedEvidence = [
  ['EVD-API-R2-IMPACT-001', '.blueprint/api-impact/API-IMPACT-001.json'],
  ['EVD-API-R3-CONTRACT-001', 'documentation/api/r3/API_CONTRACT_R3.md'],
  ['EVD-API-R3-INVENTORY-001', 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json'],
  ['EVD-API-R3-IMPACT-001', '.blueprint/api-impact/API-IMPACT-002.json'],
  ['EVD-API-R3-IMPLEMENTATION-001', 'documentation/api-implementation/r3/API_IMPLEMENTATION_RECONCILIATION_INCREMENT_18.md'],
  ['EVD-API-R3-OPENAPI-001', 'openapi.yaml'],
  ['EVD-API-R3-POSTMAN-001', 'postman/InsuranceClaims.postman_collection.json'],
  ['EVD-API-R3-CI-QA-001', 'documentation/api-implementation/r3/CI_QA_HARDENING_INCREMENT_21.md'],
  ['EVD-API-R3-CLOSURE-001', 'documentation/api-implementation/r3/FINAL_CLOSURE_INCREMENT_22.md'],
];
for (const [id, artifact] of expectedEvidence) {
  assert.ok(status.includes(`  - id: ${id}\n`), `Missing evidence registry id ${id}`);
  assert.ok(status.includes(`    value: ${artifact}\n`), `Missing evidence path ${artifact}`);
  await access(artifact);
}

assert.equal(openapi.info?.version, 'api-v1-r3');
assert.equal(openapi.info?.['x-contract-revision'], 'api-v1-r3');
assert.equal(openapi.info?.['x-effective-operation-count'], 90);
assert.equal(Object.keys(openapi.paths ?? {}).length, 76);
assert.ok(!JSON.stringify(openapi).includes('MCP:get_claim_status'));

const requests = [];
function walk(items = []) {
  for (const item of items) {
    if (item.request) requests.push(item);
    if (item.item) walk(item.item);
  }
}
walk(postman.item);
assert.equal(requests.length, 90);
assert.equal(new Set(requests.map((item) => item.name)).size, 90);

assert.match(status, /  api_gate:\n    status: PASS\n    evaluated_at: '2026-09-05T22:51:09-03:00'/);
assert.match(status, /The historical initial project API Gate remains approved/);
assert.match(closure, /\*\*Status:\*\* (IN_PROGRESS|READY_FOR_REVIEW)/);
assert.match(closure, /\*\*Contract revision:\*\* `api-v1-r3`/);
assert.match(closure, /\*\*Effective REST operations:\*\* 90/);
for (let pr = 35; pr <= 58; pr += 1) assert.ok(closure.includes(`PR #${pr}`), `Closure chain is missing PR #${pr}`);
assert.match(closure, /does not introduce new product behavior/);
assert.match(closure, /no merge, tag, release or publication is authorized/i);

console.log('R3 final closure semantic validation PASS');
console.log('Validated effective contract: 90 operations / 76 paths / 16 families.');
console.log('Validated API impacts: API-IMPACT-001 RESOLVED, API-IMPACT-002 RESOLVED.');
console.log('Historical initial API Gate timestamp remains preserved.');
