import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = 'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.json';
const lineagePath = 'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_LINEAGE_RECONCILIATION.md';
const releaseLineagePath = 'documentation/release/RELEASE_GATE_LINEAGE_RECONCILIATION.md';
const operationsLineagePath = 'documentation/operations/OPERATIONS_LINEAGE_RECONCILIATION.md';
const demoReadinessPath = 'documentation/deployment/DEMO_DEPLOYMENT_READINESS.md';

const expectedBaseline = 'cbace18fc1b00dcd6c17aca79dc12bb668cbd9a9';
const expectedClosureCandidate = 'c5a3f7a88f9de4383214d9c1516862c79f1cc2c8';
const expectedClosureMerge = '54f791707d6a4e2f9425f57d0a18e20e139fb518';
const expectedReferencePostUiHead = '24817b7d36a23cc184a0615da9fb8a4e251ab2e2';
const r3ReleaseCommit = '014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9';
const demoReadinessMerge = 'de64afb68dfd2ab2fc3e48f266d25c9fcb8ccd6f';
const demoEnvCommit = '2e9707016506cfbd14bb14f54f79d2694a12f07c';
const freshVfrReviewedCommit = 'a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a';
const freshVfrMerge = 'db9d8092d9ed34be283bef0b1908aa7c7a6c8ab9';
const releaseLineageMerge = 'b2f089476559795f30a3c0eec2b05fd0ac32531f';
const currentGovernedCheckpoint = 'ac555d064cf8a9a68fe4c10e04ec625396f94a6b';

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

const expectedClosureAllowlist = [
  '.github/workflows/r3-full-product-technical-closure.yml',
  'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.json',
  'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.md',
  'package.json',
  'scripts/validate-r3-full-product-closure.mjs',
];

const postCheckpointGovernancePaths = new Set([
  'documentation/release/RELEASE_GATE_LINEAGE_RECONCILIATION.md',
  'scripts/validate-release-gate-ready.mjs',
  'documentation/release/R3_RELEASE_PUBLICATION_LINEAGE_RECONCILIATION.md',
  'scripts/validate-release-formalization-0.3.0.mjs',
  '.github/workflows/release-formalization-0.3.0.yml',
  'documentation/operations/OPERATIONS_LINEAGE_RECONCILIATION.md',
  'scripts/validate-operations-state.mjs',
  lineagePath,
  'scripts/validate-r3-full-product-closure.mjs',
]);

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

function changedPaths(base, head) {
  const output = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' }).trim();
  return output ? output.split(/\r?\n/u).filter(Boolean) : [];
}

function isAncestor(ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function readText(path) {
  return readFile(resolve(root, path), 'utf8');
}

const manifest = JSON.parse(await readText(manifestPath));

// Preserve the original PR #90 closure record exactly as historical evidence.
assert(manifest.schemaVersion === 1, 'schemaVersion must remain 1');
assert(manifest.status === 'CANDIDATE', 'historical closure manifest must remain the merged candidate record');
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
assertExactArray(manifest.closureChangeAllowlist, expectedClosureAllowlist, 'closureChangeAllowlist');

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

// The historical closure boundary itself must still be exactly the five files approved by PR #90.
assert(isAncestor(expectedBaseline, expectedClosureCandidate), 'historical product baseline must remain ancestor of the closure candidate');
assert(isAncestor(expectedClosureCandidate, expectedClosureMerge), 'historical closure candidate must remain ancestor of the approved closure merge');
assert(isAncestor(expectedClosureMerge, 'HEAD'), `HEAD must descend from approved full-product closure merge ${expectedClosureMerge}`);

const historicalClosurePaths = changedPaths(expectedBaseline, expectedClosureMerge);
assert(historicalClosurePaths.length === expectedClosureAllowlist.length, `historical closure boundary drift: expected ${expectedClosureAllowlist.length} files, got ${historicalClosurePaths.length}`);
for (const path of historicalClosurePaths) {
  assert(expectedClosureAllowlist.includes(path), `historical closure merge contains unexpected path: ${path}`);
}
for (const path of expectedClosureAllowlist) {
  assert(historicalClosurePaths.includes(path), `historical closure merge is missing approved path: ${path}`);
  await readText(path);
}

// Later evolution is accepted only because its lineage is explicit and its current product was freshly revalidated.
const lineage = await readText(lineagePath);
for (const marker of [
  expectedBaseline,
  expectedClosureCandidate,
  expectedClosureMerge,
  r3ReleaseCommit,
  demoReadinessMerge,
  demoEnvCommit,
  freshVfrReviewedCommit,
  freshVfrMerge,
  releaseLineageMerge,
  currentGovernedCheckpoint,
  'v0.3.0',
  '101/101 PASS',
  '128/128 PASS',
  '90/90 PASS',
  'Apruebo VFR fresco PR #132',
]) {
  assert(lineage.includes(marker), `R3 closure lineage reconciliation missing marker: ${marker}`);
}

const releaseLineage = await readText(releaseLineagePath);
for (const marker of [r3ReleaseCommit, freshVfrReviewedCommit, freshVfrMerge, 'API-IMPACT-001', 'API-IMPACT-002']) {
  assert(releaseLineage.includes(marker), `Release Gate lineage missing marker required by R3 closure: ${marker}`);
}

const operationsLineage = await readText(operationsLineagePath);
for (const marker of [r3ReleaseCommit, freshVfrReviewedCommit, releaseLineageMerge, 'API-IMPACT-001', 'API-IMPACT-002']) {
  assert(operationsLineage.includes(marker), `Operations lineage missing marker required by R3 closure: ${marker}`);
}

const demoReadiness = await readText(demoReadinessPath);
for (const marker of ['DEMO_MODE', 'PostgreSQL 18', 'CORS', 'VITE_API_BASE_URL']) {
  assert(demoReadiness.includes(marker), `demo deployment readiness evidence missing marker: ${marker}`);
}

const envExample = await readText('.env.example');
for (const marker of [
  'DEMO_MODE=false',
  'CUSTOMER_JWT_SECRET=',
  'CORS_ALLOWED_ORIGINS=',
  'VITE_API_BASE_URL=',
  'IMPORT_SOURCE_STORAGE_DIR=',
  'DEMO_DB_INIT_CONFIRM=',
  'DEMO_SEED_CONFIRM=',
]) {
  assert(envExample.includes(marker), `.env.example no longer contains governed demo/runtime marker: ${marker}`);
}

assert(isAncestor(expectedClosureMerge, r3ReleaseCommit), 'published R3 release must descend from the historical full-product closure');
assert(isAncestor(r3ReleaseCommit, demoReadinessMerge), 'demo readiness must descend from the published R3 release');
assert(isAncestor(demoReadinessMerge, freshVfrReviewedCommit), 'fresh VFR product must descend from demo readiness evolution');
assert(isAncestor(freshVfrReviewedCommit, freshVfrMerge), 'fresh VFR merge must contain the browser-reviewed product');
assert(isAncestor(freshVfrMerge, releaseLineageMerge), 'Release Gate reconciliation must descend from fresh VFR');
assert(isAncestor(releaseLineageMerge, currentGovernedCheckpoint), 'Operations reconciliation must descend from Release Gate reconciliation');
assert(isAncestor(currentGovernedCheckpoint, 'HEAD'), 'HEAD must descend from the current governed R3 closure checkpoint');

// Fail closed after the reconciled checkpoint. Governance maintenance for the four release/operations/closure clocks is allowed;
// product/API/runtime changes are not silently admitted.
const postCheckpointPaths = changedPaths(currentGovernedCheckpoint, 'HEAD');
for (const path of postCheckpointPaths) {
  assert(postCheckpointGovernancePaths.has(path), `product/API/runtime drift detected after reconciled full-product closure checkpoint: ${path}`);
}

console.log('R3 FULL PRODUCT TECHNICAL CLOSURE: PASS WITH GOVERNED EVOLUTION');
console.log(`Historical product baseline: ${expectedBaseline}`);
console.log(`Historical closure merge: ${expectedClosureMerge}`);
console.log(`Current governed checkpoint: ${currentGovernedCheckpoint}`);
console.log(`Historical closure files preserved: ${historicalClosurePaths.length}`);
console.log(`Post-checkpoint governance-only files: ${postCheckpointPaths.length}`);
console.log(`Post-checkpoint product drift: ${postCheckpointPaths.some((path) => !postCheckpointGovernancePaths.has(path))}`);
console.log(`R3 API: ${manifest.api.operations} operations / ${manifest.api.paths} paths / ${manifest.api.families} families`);
console.log(`Productized web surfaces: ${manifest.webSurfaces.length}`);
console.log(`Required success workflows: ${manifest.requiredSuccessWorkflows.length}`);
console.log(`Deliberate exclusions preserved: ${manifest.deliberateExclusions.length}`);
console.log(`Historical sentinel policy preserved: ${manifest.allowedHistoricalSentinelFailures.length}`);
