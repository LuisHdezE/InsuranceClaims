import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ACCEPTED_BASELINE = 'ba7f519f36567b142604e213f50e13de4732348d';
const RELEASE_EVIDENCE = 'EVD-RELEASE-GATE-001';
const APPROVAL_EVIDENCE = 'EVD-RELEASE-GATE-APPROVAL-001';
const APPROVAL_FILE = 'documentation/release/RELEASE_GATE_APPROVAL.md';

function fail(message) {
  throw new Error(`Release Gate state validation failed: ${message}`);
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
function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const expectedSlices = [
  ['digital-claim-intake/web', '.blueprint/functional-slices/digital-claim-intake.web.json'],
  ['customer-claim-tracking/web', '.blueprint/functional-slices/customer-claim-tracking.web.json'],
  ['claims-backoffice/web', '.blueprint/functional-slices/claims-backoffice.web.json'],
];
for (const [identity, path] of expectedSlices) {
  const slice = json(path);
  assert(`${slice.id}/${slice.platform}` === identity, `${identity} identity drifted`);
  assert(slice.lifecycle_status === 'ACCEPTED', `${identity} must remain ACCEPTED`);
  assert(slice.blocker === null, `${identity} cannot carry a blocker`);
  assert(slice.definition_of_done?.status === 'PASS', `${identity} DoD must remain PASS`);
  assert(slice.visual_functional_review?.status === 'PASS', `${identity} V&F must remain PASS`);
  assert(slice.visual_functional_review?.human_complete === true, `${identity} V&F human review must remain complete`);
  assert(slice.integration_qa?.status === 'PASS', `${identity} Integration QA must remain PASS`);
  assert(slice.human_acceptance?.status === 'APPROVED', `${identity} Human Acceptance must remain APPROVED`);
}

const status = read('.blueprint/status.yaml');
const releaseChecks = [
  'release.functional_slices_accepted',
  'release.security_accepted',
  'release.documentation',
  'release.backup_restore',
];
for (const check of releaseChecks) {
  const pattern = new RegExp(`^  ${escape(check)}:\\n    status: PASS\\n    verification: evidence\\n`, 'm');
  assert(pattern.test(status), `${check} must be PASS with evidence verification`);
}

const phaseReady = /\n  release_gate:\n    status: READY_FOR_REVIEW\n    progress: 80\n/.test(status);
const phaseApproved = /\n  release_gate:\n    status: COMPLETE\n    progress: 100\n/.test(status);
assert(phaseReady || phaseApproved, 'release_gate phase must be READY_FOR_REVIEW/80 or COMPLETE/100');

const gateReady = /\n  release_gate:\n    status: READY_FOR_REVIEW\n    evaluated_at: '[^']+'\n/.test(status);
const gateApproved = /\n  release_gate:\n    status: PASS\n    evaluated_at: '[^']+'\n/.test(status);
assert(gateReady || gateApproved, 'project release_gate must be READY_FOR_REVIEW or PASS');
assert(phaseReady === gateReady, 'release phase/gate candidate states must agree');
assert(phaseApproved === gateApproved, 'release phase/gate approved states must agree');

assert(status.includes(`evidence_ids: [${RELEASE_EVIDENCE}]`) || status.includes(RELEASE_EVIDENCE), 'Release Gate evidence binding missing');
assert(status.includes(`- id: ${RELEASE_EVIDENCE}\n    type: release_gate_evidence\n    value: documentation/release/RELEASE_GATE_EVIDENCE.md`), 'Release Gate artifact registry entry missing');

const evidence = read('documentation/release/RELEASE_GATE_EVIDENCE.md');
assert(evidence.includes('Successful run: `34077824586`'), 'Release Gate evidence must bind the successful machine run');
assert(evidence.includes('Machine-tested candidate: `22ae0618cf865a8c940a2c9c3c243a1830cd4d97`'), 'Release Gate evidence must bind the machine-tested candidate');
assert(evidence.includes('release.backup_restore=PASS'), 'Release Gate evidence must record backup/restore PASS');
assert(evidence.includes('0 production vulnerabilities'), 'Release Gate evidence must record production dependency audit result');

if (gateReady) {
  assert(evidence.includes('Human gate decision: PENDING'), 'candidate evidence must preserve pending human decision');
  assert(!fs.existsSync(APPROVAL_FILE), 'approval document must not exist before human Release Gate approval');
  assert(!status.includes(APPROVAL_EVIDENCE), 'approval evidence must not be registered before human approval');
} else {
  assert(fs.existsSync(APPROVAL_FILE), 'approved Release Gate requires manual approval document');
  assert(status.includes(`- id: ${APPROVAL_EVIDENCE}\n    type: manual_approval\n    value: ${APPROVAL_FILE}`), 'approved Release Gate approval artifact missing');
  assert(status.includes(APPROVAL_EVIDENCE), 'approved gate must bind manual approval evidence');
}

for (const forbidden of [
  /^  operations_maintenance:/m,
  /^  operations:/m,
  /^  - gate: operations/m,
]) {
  assert(!forbidden.test(status), 'Operations & Maintenance must not be auto-started by Release Gate');
}

for (const temporary of [
  '.github/workflows/reconcile-release-gate-ready.yml',
  '.github/workflows/reconcile-release-gate-approval.yml',
]) {
  assert(!fs.existsSync(temporary), `temporary workflow still present: ${temporary}`);
}

const changed = execFileSync('git', ['diff', '--name-only', `${ACCEPTED_BASELINE}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);
const allowedExact = new Set([
  '.blueprint/status.yaml',
  'README.md',
  'qa/release-backup-restore.sh',
  'scripts/validate-release-evidence.mjs',
  'scripts/validate-release-gate-ready.mjs',
  '.github/workflows/release-gate-evidence.yml',
  '.github/workflows/release-gate-ready.yml',
]);
for (const path of changed) {
  const allowed = allowedExact.has(path) || path.startsWith('documentation/release/');
  assert(allowed, `non-release/product drift detected since accepted baseline: ${path}`);
}

console.log(JSON.stringify({
  event: gateApproved ? 'RELEASE_GATE_PASS' : 'RELEASE_GATE_READY',
  acceptedBaseline: ACCEPTED_BASELINE,
  releaseChecks,
  slices: expectedSlices.map(([identity]) => identity),
  humanReleaseDecision: gateApproved ? 'APPROVED' : 'PENDING',
  productDrift: false,
}, null, 2));
