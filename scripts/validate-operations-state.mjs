import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const HISTORICAL_RELEASE_BASELINE = '49c52a380e3a5c40ec1c1ee72e5c114b5607019f';
const HISTORICAL_OPERATIONS_CANDIDATE = '2a10afc8e1b99d8e656ea5511c334235df444e69';
const HISTORICAL_OPERATIONS_MERGE = 'b450204d8fbed14660dde90a900c21211875e5d7';
const CURRENT_GOVERNED_BASELINE = 'b2f089476559795f30a3c0eec2b05fd0ac32531f';
const R3_RELEASE_COMMIT = '014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9';
const FRESH_VFR_REVIEWED_COMMIT = 'a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a';
const EVIDENCE_ID = 'EVD-OPERATIONS-OBSERVABILITY-001';
const EVIDENCE_FILE = 'documentation/operations/OPERATIONS_OBSERVABILITY_EVIDENCE.md';
const RUNBOOK_FILE = 'documentation/operations/OPERATIONS_RUNBOOK.md';
const LINEAGE_FILE = 'documentation/operations/OPERATIONS_LINEAGE_RECONCILIATION.md';
const RELEASE_LINEAGE_FILE = 'documentation/release/RELEASE_GATE_LINEAGE_RECONCILIATION.md';
const MACHINE_RUN = '34102498663';
const MACHINE_COMMIT = '175dd7ed599954c48487193489c4c842662e955a';
const ARTIFACT_DIGEST = 'sha256:c97e5a298cc74c4cf87da169be5c33cdee39fb031853f247fade4baaedbeec3e';

function fail(message) {
  throw new Error(`Operations state validation failed: ${message}`);
}
function assert(condition, message) {
  if (!condition) fail(message);
}
function read(path) {
  assert(fs.existsSync(path), `missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function json(path) {
  return JSON.parse(read(path));
}
function isAncestor(ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function assertStatusPass(status, check) {
  const escaped = check.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^  ${escaped}:\\n    status: PASS\\n`, 'm');
  assert(pattern.test(status), `${check} must remain PASS`);
}

const project = read('.blueprint/project.yaml');
assert(project.includes('version: 0.5.2'), 'consumer must remain pinned to Blueprint 0.5.2');

const status = read('.blueprint/status.yaml');
assert(/\n  release_gate:\n    status: COMPLETE\n    progress: 100\n/.test(status), 'Release Gate phase must remain COMPLETE / 100 before Operations');
assert(/\n  release_gate:\n    status: PASS\n    evaluated_at: '[^']+'\n/.test(status), 'project Release Gate must remain PASS');
assert(/\n  operations:\n    status: COMPLETE\n    progress: 100\n/.test(status), 'Operations phase must be COMPLETE / 100');
assert(/\n  operations\.observability:\n    status: PASS\n    verification: evidence\n/.test(status), 'operations.observability must be PASS with evidence verification');
assert(status.includes(`evidence_ids: [${EVIDENCE_ID}]`), 'operations.observability evidence binding missing');
assert(status.includes(`- id: ${EVIDENCE_ID}\n    type: operations_observability_evidence\n    value: ${EVIDENCE_FILE}`), 'Operations artifact registry entry missing');

assert(!/^  operations_gate:/m.test(status), 'Blueprint 0.5.2 defines no operations gate');
assert(!/^  - gate: operations/m.test(status), 'Blueprint 0.5.2 defines no scoped operations gate');

// The original Operations evidence remains immutable and independently
// verifiable. This reconciliation does not rewrite the 2026-09-07 proof.
const evidence = read(EVIDENCE_FILE);
for (const marker of [
  `Successful workflow run: \`${MACHINE_RUN}\``,
  `Machine-tested commit: \`${MACHINE_COMMIT}\``,
  `Artifact digest: \`${ARTIFACT_DIGEST}\``,
  '`operations.observability`',
  'Result: `PASS`',
  'does **not** claim FAR production monitoring infrastructure',
]) {
  assert(evidence.includes(marker), `operations evidence missing marker: ${marker}`);
}

const runbook = read(RUNBOOK_FILE);
for (const marker of [
  'GET /health/live',
  'GET /health/ready',
  'X-Request-Id',
  'UNHANDLED_API_ERROR',
  'Incident triage sequence',
  'Maintenance boundary',
]) {
  assert(runbook.includes(marker), `operations runbook missing marker: ${marker}`);
}

for (const path of [
  'qa/operations-observability.mjs',
  '.github/workflows/operations-observability.yml',
  '.github/workflows/operations-state.yml',
]) {
  assert(fs.existsSync(path), `required Operations executable missing: ${path}`);
}
assert(!fs.existsSync('.github/workflows/reconcile-operations-state.yml'), 'one-time Operations reconciler must be removed');

// Later API/product evolution must be explicitly governed rather than silently
// inherited by the historical Operations proof.
const impact1 = json('.blueprint/api-impact/API-IMPACT-001.json');
assert(impact1.change_id === 'API-IMPACT-001', 'API-IMPACT-001 identity drifted');
assert(impact1.previous_revision === 'api-v1-r1' && impact1.new_revision === 'api-v1-r2', 'API-IMPACT-001 revision chain drifted');
assert(impact1.classification === 'platform_cross_cutting', 'API-IMPACT-001 classification drifted');
assert(impact1.revalidation_policy === 'platform', 'API-IMPACT-001 revalidation policy drifted');

const impact2 = json('.blueprint/api-impact/API-IMPACT-002.json');
assert(impact2.change_id === 'API-IMPACT-002', 'API-IMPACT-002 identity drifted');
assert(impact2.previous_revision === 'api-v1-r2' && impact2.new_revision === 'api-v1-r3', 'API-IMPACT-002 revision chain drifted');
assert(impact2.classification === 'platform_cross_cutting', 'API-IMPACT-002 classification drifted');
assert(impact2.revalidation_policy === 'platform', 'API-IMPACT-002 revalidation policy drifted');

assert(/- id: API-IMPACT-001[\s\S]*?status: RESOLVED/.test(status), 'API-IMPACT-001 must remain RESOLVED');
assert(/- id: API-IMPACT-002[\s\S]*?status: RESOLVED/.test(status), 'API-IMPACT-002 must remain RESOLVED');
assertStatusPass(status, 'api.change_impact_analysis');
assertStatusPass(status, 'api.affected_consumer_revalidation');

const releaseLineage = read(RELEASE_LINEAGE_FILE);
for (const marker of [
  'ba7f519f36567b142604e213f50e13de4732348d',
  '05bb93081248c02ecfb93b7b77477bd4862d3281',
  'db9d8092d9ed34be283bef0b1908aa7c7a6c8ab9',
  R3_RELEASE_COMMIT,
  'API-IMPACT-001',
  'API-IMPACT-002',
  'v0.3.0',
]) {
  assert(releaseLineage.includes(marker), `Release Gate lineage missing marker required by Operations: ${marker}`);
}

const lineage = read(LINEAGE_FILE);
for (const marker of [
  HISTORICAL_RELEASE_BASELINE,
  HISTORICAL_OPERATIONS_CANDIDATE,
  HISTORICAL_OPERATIONS_MERGE,
  CURRENT_GOVERNED_BASELINE,
  R3_RELEASE_COMMIT,
  FRESH_VFR_REVIEWED_COMMIT,
  MACHINE_COMMIT,
  MACHINE_RUN,
  '34119017625',
  '35482185068',
  'API-IMPACT-001',
  'API-IMPACT-002',
  'v0.3.0',
]) {
  assert(lineage.includes(marker), `Operations lineage reconciliation missing marker: ${marker}`);
}

assert(isAncestor(HISTORICAL_RELEASE_BASELINE, HISTORICAL_OPERATIONS_CANDIDATE), 'historical Release baseline must remain ancestor of Operations candidate');
assert(isAncestor(HISTORICAL_OPERATIONS_CANDIDATE, HISTORICAL_OPERATIONS_MERGE), 'historical Operations candidate must remain ancestor of Operations merge');
assert(isAncestor(HISTORICAL_OPERATIONS_MERGE, R3_RELEASE_COMMIT), 'R3 release must descend from the historical Operations completion');
assert(isAncestor(R3_RELEASE_COMMIT, CURRENT_GOVERNED_BASELINE), 'current Operations lineage checkpoint must descend from the R3 release');
assert(isAncestor(FRESH_VFR_REVIEWED_COMMIT, CURRENT_GOVERNED_BASELINE), 'current Operations lineage checkpoint must include the fresh VFR-reviewed product');
assert(isAncestor(CURRENT_GOVERNED_BASELINE, 'HEAD'), 'current Operations lineage checkpoint must be an ancestor of HEAD');

// From the reconciled checkpoint onward, product/API/runtime drift is again
// fail-closed. Governance-only maintenance for Release-related sentinels,
// Operations and the separate R3 technical-closure lane may advance without
// being misclassified as product drift.
const changed = execFileSync('git', ['diff', '--name-only', `${CURRENT_GOVERNED_BASELINE}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const allowedExact = new Set([
  '.blueprint/status.yaml',
  'README.md',
  'qa/operations-observability.mjs',
  'scripts/validate-operations-state.mjs',
  'scripts/validate-release-gate-ready.mjs',
  'scripts/validate-release-formalization-0.3.0.mjs',
  'scripts/validate-r3-full-product-closure.mjs',
  '.github/workflows/operations-observability.yml',
  '.github/workflows/operations-state.yml',
  '.github/workflows/release-gate-ready.yml',
  '.github/workflows/release-formalization-0.3.0.yml',
  '.github/workflows/r3-full-product-technical-closure.yml',
]);
const allowedGovernancePrefixes = [
  'documentation/operations/',
  'documentation/release/',
  'documentation/product-closure/r3/',
  'documentation/portfolio/',
  'documentation/blueprint-observations/',
  'documentation/visual-functional-review/',
];

for (const path of changed) {
  const governanceAllowed = allowedExact.has(path)
    || allowedGovernancePrefixes.some((prefix) => path.startsWith(prefix));
  assert(governanceAllowed, `product/API/runtime drift detected after governed Operations checkpoint: ${path}`);
}

console.log(JSON.stringify({
  event: 'OPERATIONS_OBSERVABILITY_PASS_WITH_GOVERNED_EVOLUTION',
  blueprint: '0.5.2',
  historicalReleaseBaseline: HISTORICAL_RELEASE_BASELINE,
  historicalOperationsCandidate: HISTORICAL_OPERATIONS_CANDIDATE,
  historicalOperationsMerge: HISTORICAL_OPERATIONS_MERGE,
  governedLineageCheckpoint: CURRENT_GOVERNED_BASELINE,
  r3ReleaseCommit: R3_RELEASE_COMMIT,
  check: 'operations.observability',
  historicalMachineRun: MACHINE_RUN,
  historicalMachineCommit: MACHINE_COMMIT,
  resolvedApiImpacts: ['API-IMPACT-001', 'API-IMPACT-002'],
  postCheckpointProductDrift: false,
  separateOperationsGate: false,
}, null, 2));
