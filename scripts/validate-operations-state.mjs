import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const RELEASE_BASELINE = '49c52a380e3a5c40ec1c1ee72e5c114b5607019f';
const EVIDENCE_ID = 'EVD-OPERATIONS-OBSERVABILITY-001';
const EVIDENCE_FILE = 'documentation/operations/OPERATIONS_OBSERVABILITY_EVIDENCE.md';
const RUNBOOK_FILE = 'documentation/operations/OPERATIONS_RUNBOOK.md';
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

const changed = execFileSync('git', ['diff', '--name-only', `${RELEASE_BASELINE}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const allowedExact = new Set([
  '.blueprint/status.yaml',
  'qa/operations-observability.mjs',
  'scripts/validate-operations-state.mjs',
  'scripts/validate-release-gate-ready.mjs',
  '.github/workflows/operations-observability.yml',
  '.github/workflows/operations-state.yml',
]);
for (const path of changed) {
  const allowed = allowedExact.has(path) || path.startsWith('documentation/operations/');
  assert(allowed, `product/API drift detected after Release Gate merge: ${path}`);
}

console.log(JSON.stringify({
  event: 'OPERATIONS_OBSERVABILITY_PASS',
  blueprint: '0.5.2',
  releaseBaseline: RELEASE_BASELINE,
  check: 'operations.observability',
  machineRun: MACHINE_RUN,
  machineCommit: MACHINE_COMMIT,
  productDrift: false,
  separateOperationsGate: false,
}, null, 2));
