import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = 'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.json';
const expectedBaseline = 'cbace18fc1b00dcd6c17aca79dc12bb668cbd9a9';
const expectedReferencePostUiHead = '24817b7d36a23cc184a0615da9fb8a4e251ab2e2';

const expectedApi = {
  operations: 90,
  paths: 76,
  families: 16,
  inheritedOperations: 15,
  newOperations: 75,
  changedExistingOperations: 7,
  backendTestsBaseline: 91,
};

const expectedSurfaces = [
  'Public Claim Intake',
  'Public Claim Tracking',
  'Operator Login',
  'Staff Workspace',
  'Operations Dashboard',
  'Claims Workspace',
  'Claim Detail',
  'Tasks',
  'Customer Directory',
  'Customer 360',
  'Policy Directory',
  'Policy 360',
  'Renewals',
  'Collections',
  'Analytics',
  'Pipeline Administration',
  'Automation Administration',
  'Communication Template Administration',
  'Custom Field Administration',
  'Guidance Administration',
  'Governed Imports',
  'Recovery Operations / Dead Letters',
];

const expectedExclusions = [
  'Authenticated Customer Portal',
  'Operator Communications UI',
  'Standalone Bulk Actions UI',
];

const expectedSuccessWorkflows = [
  'API Implementation',
  'API QA',
  'Integration QA - Web Slices',
  'OpenAPI Validation',
  'OpenAPI Post-MVP R2',
  'Postman Contract',
  'CI QA Hardening',
  'Release Gate Evidence',
  'Claims Operations Release Formalization 0.2.0',
  'R3 Final Closure',
  'Functional Slice - Digital Claim Intake Web',
  'Functional Slice - Customer Claim Tracking Web',
  'Functional Slice - Claims Backoffice Web',
  'Interface Inventory',
  'Design System',
  'Operations Observability Evidence',
  'R3 Full Product Technical Closure',
];

const expectedSentinels = [
  'Release Gate Ready State',
  'Operations State',
  'Visual Functional Review Ready - Web',
];

const expectedEvidence = {
  apiClosure: 'documentation/api-implementation/r3/FINAL_CLOSURE_INCREMENT_22.md',
  uiReconciliation: 'documentation/ui-reference/r3/task12-full-system-reconciliation-note.md',
  operatorShellRegression: 'apps/web/src/components/OperatorShell.test.tsx',
  staffWorkspaceRegression: 'apps/web/src/pages/StaffWorkspacePage.test.tsx',
  apiQaWorkflow: '.github/workflows/api-qa.yml',
  webIntegrationWorkflow: '.github/workflows/integration-qa-web.yml',
  apiClosureWorkflow: '.github/workflows/r3-final-closure.yml',
};

const expectedAllowlist = [
  '.github/workflows/r3-full-product-technical-closure.yml',
  'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.json',
  'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.md',
  'package.json',
  'scripts/validate-r3-full-product-closure.mjs',
];

function fail(message) {
  throw new Error(`[r3-full-product-closure] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertExactArray(actual, expected, label) {
  assert(Array.isArray(actual), `${label} must be an array`);
  assert(actual.length === expected.length, `${label} length drift: expected ${expected.length}, got ${actual.length}`);
  expected.forEach((value, index) => {
    assert(actual[index] === value, `${label}[${index}] drift: expected ${JSON.stringify(value)}, got ${JSON.stringify(actual[index])}`);
  });
}

async function readText(path) {
  return readFile(resolve(root, path), 'utf8');
}

const manifest = JSON.parse(await readText(manifestPath));

assert(manifest.schemaVersion === 1, 'schemaVersion must remain 1');
assert(manifest.status === 'CANDIDATE', 'manifest status must remain CANDIDATE until the human-gated merge');
assert(manifest.productBaseline === expectedBaseline, `product baseline must be ${expectedBaseline}`);
assert(manifest.referencePostUiHead === expectedReferencePostUiHead, `post-UI reference head must be ${expectedReferencePostUiHead}`);
assert(manifest.blueprintConsumerVersion === '0.5.2', 'Blueprint consumer version must remain 0.5.2');
assert(manifest.deliveryMode === 'GREENFIELD', 'delivery mode must remain GREENFIELD');
assert(manifest.legacyCoexistence === 'SIMULATED', 'legacy coexistence must remain SIMULATED');
assert(manifest.contractRevision === 'api-v1-r3', 'contract revision must remain api-v1-r3');

for (const [key, value] of Object.entries(expectedApi)) {
  assert(manifest.api?.[key] === value, `api.${key} drift: expected ${value}, got ${manifest.api?.[key]}`);
}

assertExactArray(manifest.webSurfaces, expectedSurfaces, 'webSurfaces');
assertExactArray(manifest.deliberateExclusions, expectedExclusions, 'deliberateExclusions');
assertExactArray(manifest.requiredSuccessWorkflows, expectedSuccessWorkflows, 'requiredSuccessWorkflows');
assertExactArray(manifest.allowedHistoricalSentinelFailures, expectedSentinels, 'allowedHistoricalSentinelFailures');
assertExactArray(manifest.closureChangeAllowlist, expectedAllowlist, 'closureChangeAllowlist');

for (const [key, path] of Object.entries(expectedEvidence)) {
  assert(manifest.evidence?.[key] === path, `evidence.${key} drift: expected ${path}, got ${manifest.evidence?.[key]}`);
  await readText(path);
}

const apiClosure = await readText(expectedEvidence.apiClosure);
assert(apiClosure.includes('**Effective REST operations:** 90'), 'inherited API closure no longer records 90 operations');
assert(apiClosure.includes('**Effective REST paths:** 76'), 'inherited API closure no longer records 76 paths');
assert(apiClosure.includes('**Operation families:** 16'), 'inherited API closure no longer records 16 families');

const uiReconciliation = await readText(expectedEvidence.uiReconciliation);
for (const token of [
  'Full-system R3 reconciliation note',
  'The reconciliation is presentation-focused',
  'Staff Workspace',
  'No new routes',
  'desktop/mobile visual review',
]) {
  assert(uiReconciliation.toLowerCase().includes(token.toLowerCase()), `UI reconciliation evidence no longer proves: ${token}`);
}

const operatorShellRegression = await readText(expectedEvidence.operatorShellRegression);
for (const token of ['PLATFORM_ADMIN', 'Siniestros', 'Tareas']) {
  assert(operatorShellRegression.includes(token), `OperatorShell regression evidence no longer contains ${token}`);
}

const staffWorkspaceRegression = await readText(expectedEvidence.staffWorkspaceRegression);
for (const token of ['PLATFORM_ADMIN', 'CLAIMS_SUPERVISOR', 'CLAIMS_OPERATOR', 'Sin superusuario implícito']) {
  assert(staffWorkspaceRegression.includes(token), `StaffWorkspace regression evidence no longer contains ${token}`);
}

const workflowExpectations = [
  [expectedEvidence.apiQaWorkflow, 'name: API QA'],
  [expectedEvidence.webIntegrationWorkflow, 'name: Integration QA - Web Slices'],
  [expectedEvidence.apiClosureWorkflow, 'name: R3 Final Closure'],
  ['.github/workflows/r3-full-product-technical-closure.yml', 'name: R3 Full Product Technical Closure'],
];

for (const [path, marker] of workflowExpectations) {
  const workflow = await readText(path);
  assert(workflow.includes(marker), `${path} must retain workflow marker ${marker}`);
}

try {
  execFileSync('git', ['merge-base', '--is-ancestor', expectedBaseline, 'HEAD'], { stdio: 'pipe' });
} catch {
  fail(`HEAD must descend from accepted product baseline ${expectedBaseline}`);
}

const changedOutput = execFileSync('git', ['diff', '--name-only', `${expectedBaseline}...HEAD`], { encoding: 'utf8' }).trim();
const changedPaths = changedOutput ? changedOutput.split(/\r?\n/u).filter(Boolean) : [];
assert(changedPaths.length > 0, 'closure candidate must contain closure evidence changes');

for (const path of changedPaths) {
  assert(expectedAllowlist.includes(path), `product drift detected outside closure allowlist: ${path}`);
}

for (const path of expectedAllowlist) {
  await readText(path);
}

console.log('R3 FULL PRODUCT TECHNICAL CLOSURE CONTRACT: PASS');
console.log(`Product baseline: ${expectedBaseline}`);
console.log(`Closure-only changed files: ${changedPaths.length}`);
console.log(`R3 API: ${manifest.api.operations} operations / ${manifest.api.paths} paths / ${manifest.api.families} families`);
console.log(`Productized web surfaces: ${manifest.webSurfaces.length}`);
console.log(`Required success workflows: ${manifest.requiredSuccessWorkflows.length}`);
console.log(`Deliberate exclusions preserved: ${manifest.deliberateExclusions.length}`);
console.log(`Allowed historical sentinel failures: ${manifest.allowedHistoricalSentinelFailures.length}`);
