import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const HISTORICAL_ACCEPTED_BASELINE = 'ba7f519f36567b142604e213f50e13de4732348d';
const HISTORICAL_APPROVED_CANDIDATE = '05bb93081248c02ecfb93b7b77477bd4862d3281';
const CURRENT_GOVERNED_BASELINE = 'db9d8092d9ed34be283bef0b1908aa7c7a6c8ab9';
const R3_RELEASE_COMMIT = '014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9';
const FRESH_VFR_REVIEWED_COMMIT = 'a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a';
const RELEASE_EVIDENCE = 'EVD-RELEASE-GATE-001';
const APPROVAL_EVIDENCE = 'EVD-RELEASE-GATE-APPROVAL-001';
const APPROVAL_FILE = 'documentation/release/RELEASE_GATE_APPROVAL.md';
const LINEAGE_FILE = 'documentation/release/RELEASE_GATE_LINEAGE_RECONCILIATION.md';
const OPERATIONS_EVIDENCE = 'EVD-OPERATIONS-OBSERVABILITY-001';
const OPERATIONS_EVIDENCE_FILE = 'documentation/operations/OPERATIONS_OBSERVABILITY_EVIDENCE.md';

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
function isAncestor(ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function assertStatusPass(status, check) {
  const pattern = new RegExp(`^  ${escape(check)}:\\n    status: PASS\\n`, 'm');
  assert(pattern.test(status), `${check} must remain PASS`);
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

  const approval = read(APPROVAL_FILE);
  assert(approval.includes(`Accepted baseline: \`${HISTORICAL_ACCEPTED_BASELINE}\``), 'historical Release Gate accepted baseline changed');
  assert(approval.includes(`Approved release candidate: \`${HISTORICAL_APPROVED_CANDIDATE}\``), 'historical Release Gate approved candidate changed');
  assert(approval.includes('Approved at: `2026-09-07T05:09:00-03:00`'), 'historical Release Gate approval time changed');
  assert(approval.includes('Approver: Luis Hernández'), 'historical Release Gate approver changed');
}

const operationsComplete = /\n  operations:\n    status: COMPLETE\n    progress: 100\n/.test(status);
const operationsCheck = /\n  operations\.observability:\n    status: PASS\n    verification: evidence\n/.test(status);
const operationsArtifact = status.includes(`- id: ${OPERATIONS_EVIDENCE}\n    type: operations_observability_evidence\n    value: ${OPERATIONS_EVIDENCE_FILE}`);

if (gateReady) {
  assert(!operationsComplete, 'Operations cannot start before Release Gate PASS');
  assert(!operationsCheck, 'operations.observability cannot PASS before Release Gate PASS');
  assert(!operationsArtifact, 'Operations evidence cannot be registered before Release Gate PASS');
} else if (operationsComplete) {
  assert(operationsCheck, 'completed Operations requires operations.observability PASS');
  assert(operationsArtifact, 'completed Operations requires registered observability evidence');
  assert(fs.existsSync(OPERATIONS_EVIDENCE_FILE), 'completed Operations requires observability evidence file');
  assert(!/^  operations_gate:/m.test(status), 'Blueprint 0.5.2 defines no separate Operations gate');
  assert(!/^  - gate: operations/m.test(status), 'Blueprint 0.5.2 defines no scoped Operations gate');
} else {
  assert(!operationsCheck, 'operations.observability should not be recorded before Operations begins');
  assert(!operationsArtifact, 'Operations artifact should not be registered before Operations begins');
}

for (const temporary of [
  '.github/workflows/reconcile-release-gate-ready.yml',
  '.github/workflows/reconcile-release-gate-approval.yml',
  '.github/workflows/reconcile-operations-state.yml',
]) {
  assert(!fs.existsSync(temporary), `temporary workflow still present: ${temporary}`);
}

// Preserve the historical Release Gate exactly, but recognize the separately
// governed product evolution that followed it. Both API impact records are
// required to be resolved and the affected consumer surface must remain
// explicitly revalidated.
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

assert(/api_impacts:[\s\S]*?- id: API-IMPACT-001[\s\S]*?status: RESOLVED[\s\S]*?- id: API-IMPACT-002[\s\S]*?status: RESOLVED/.test(status), 'R1->R2->R3 API impacts must remain RESOLVED');
assertStatusPass(status, 'api.change_impact_analysis');
assertStatusPass(status, 'api.affected_consumer_revalidation');

const lineage = read(LINEAGE_FILE);
for (const marker of [
  HISTORICAL_ACCEPTED_BASELINE,
  HISTORICAL_APPROVED_CANDIDATE,
  CURRENT_GOVERNED_BASELINE,
  R3_RELEASE_COMMIT,
  FRESH_VFR_REVIEWED_COMMIT,
  'API-IMPACT-001',
  'API-IMPACT-002',
  'v0.3.0',
  'Apruebo VFR fresco PR #132',
]) {
  assert(lineage.includes(marker), `Release Gate lineage reconciliation missing marker: ${marker}`);
}

const publicationGate = read('documentation/portfolio/R3_RELEASE_PUBLICATION_GATE_0.3.0.md');
assert(publicationGate.includes(`Release commit: \`${R3_RELEASE_COMMIT}\``), 'R3 publication gate release commit drifted');
assert(publicationGate.includes('Annotated tag: `v0.3.0`'), 'R3 publication gate tag identity drifted');

const freshVfr = read('documentation/visual-functional-review/VFR_APPROVAL_RECONCILIATION.md');
assert(freshVfr.includes(`Browser-tested product/review commit: \`${FRESH_VFR_REVIEWED_COMMIT}\``), 'fresh VFR reviewed commit drifted');
assert(freshVfr.includes('Explicit approval statement: `Apruebo VFR fresco PR #132`'), 'fresh VFR human approval binding missing');

assert(isAncestor(HISTORICAL_ACCEPTED_BASELINE, HISTORICAL_APPROVED_CANDIDATE), 'historical accepted baseline must remain ancestor of the approved Release Gate candidate');
assert(isAncestor(HISTORICAL_APPROVED_CANDIDATE, R3_RELEASE_COMMIT), 'R3 release must descend from the historical approved Release Gate candidate');
assert(isAncestor(R3_RELEASE_COMMIT, CURRENT_GOVERNED_BASELINE), 'current governed lineage checkpoint must descend from the published R3 release');
assert(isAncestor(FRESH_VFR_REVIEWED_COMMIT, CURRENT_GOVERNED_BASELINE), 'current governed lineage checkpoint must include the fresh VFR-reviewed product');
assert(isAncestor(CURRENT_GOVERNED_BASELINE, 'HEAD'), 'current governed lineage checkpoint must be an ancestor of HEAD');

// From the current governed checkpoint onward, product/API/runtime drift is
// again fail-closed. Only governance/evidence maintenance for the release,
// Operations and technical-closure lanes may advance without moving the
// product checkpoint.
const changed = execFileSync('git', ['diff', '--name-only', `${CURRENT_GOVERNED_BASELINE}...HEAD`], { encoding: 'utf8' })
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const allowedExact = new Set([
  'documentation/release/RELEASE_GATE_LINEAGE_RECONCILIATION.md',
  'scripts/validate-release-gate-ready.mjs',
  '.github/workflows/release-gate-ready.yml',
  '.blueprint/status.yaml',
  'README.md',
  'qa/operations-observability.mjs',
  'scripts/validate-operations-state.mjs',
  '.github/workflows/operations-observability.yml',
  '.github/workflows/operations-state.yml',
  'scripts/validate-r3-full-product-closure.mjs',
  '.github/workflows/r3-full-product-technical-closure.yml',
]);
const allowedGovernancePrefixes = [
  'documentation/release/',
  'documentation/operations/',
  'documentation/product-closure/r3/',
  'documentation/portfolio/',
  'documentation/blueprint-observations/',
  'documentation/visual-functional-review/',
];

for (const path of changed) {
  const governanceAllowed = allowedExact.has(path)
    || allowedGovernancePrefixes.some((prefix) => path.startsWith(prefix));
  assert(governanceAllowed, `product/API/runtime drift detected after governed lineage checkpoint: ${path}`);
}

console.log(JSON.stringify({
  event: gateApproved ? 'RELEASE_GATE_PASS_WITH_GOVERNED_EVOLUTION' : 'RELEASE_GATE_READY',
  historicalAcceptedBaseline: HISTORICAL_ACCEPTED_BASELINE,
  historicalApprovedCandidate: HISTORICAL_APPROVED_CANDIDATE,
  governedLineageCheckpoint: CURRENT_GOVERNED_BASELINE,
  r3ReleaseCommit: R3_RELEASE_COMMIT,
  releaseChecks,
  slices: expectedSlices.map(([identity]) => identity),
  humanReleaseDecision: gateApproved ? 'HISTORICALLY_APPROVED' : 'PENDING',
  resolvedApiImpacts: ['API-IMPACT-001', 'API-IMPACT-002'],
  postCheckpointProductDrift: false,
  downstreamOperations: operationsComplete ? 'COMPLETE' : 'NOT_STARTED',
}, null, 2));
