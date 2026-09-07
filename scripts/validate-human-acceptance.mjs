import fs from 'node:fs';

function fail(message) {
  throw new Error(`Human Acceptance validation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  assert(fs.existsSync(path), `missing ${path}`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const acceptedBaseline = '11fceafa27b710d60c54b327488787460e36cdc1';
const approvalTimestamp = '2026-09-06T23:15:34-03:00';
const approvalPhrase = 'Apruebo Human Acceptance digital-claim-intake/web, customer-claim-tracking/web y claims-backoffice/web';

const slices = {
  'digital-claim-intake/web': {
    file: '.blueprint/functional-slices/digital-claim-intake.web.json',
    evidence: 'EVD-HUMAN-ACCEPTANCE-INTAKE-WEB-001',
    approvalFile: 'documentation/human-acceptance/DIGITAL_CLAIM_INTAKE_WEB_APPROVAL.md',
  },
  'customer-claim-tracking/web': {
    file: '.blueprint/functional-slices/customer-claim-tracking.web.json',
    evidence: 'EVD-HUMAN-ACCEPTANCE-TRACKING-WEB-001',
    approvalFile: 'documentation/human-acceptance/CUSTOMER_CLAIM_TRACKING_WEB_APPROVAL.md',
  },
  'claims-backoffice/web': {
    file: '.blueprint/functional-slices/claims-backoffice.web.json',
    evidence: 'EVD-HUMAN-ACCEPTANCE-BACKOFFICE-WEB-001',
    approvalFile: 'documentation/human-acceptance/CLAIMS_BACKOFFICE_WEB_APPROVAL.md',
  },
};

for (const [sliceId, config] of Object.entries(slices)) {
  const slice = readJson(config.file);
  assert(`${slice.id}/${slice.platform}` === sliceId, `${sliceId} identity drifted`);
  assert(slice.schema_version === '0.5.0', `${sliceId} schema_version must remain 0.5.0`);
  assert(slice.lifecycle_status === 'ACCEPTED', `${sliceId} lifecycle must be ACCEPTED`);
  assert(slice.blocker === null, `${sliceId} must have no unresolved BLOCKED_BY_API overlay`);
  assert(slice.definition_of_done?.status === 'PASS', `${sliceId} Functional DoD must remain PASS`);
  assert(slice.visual_functional_review?.status === 'PASS', `${sliceId} VFR must remain PASS`);
  assert(slice.visual_functional_review?.human_complete === true, `${sliceId} VFR human review must remain complete`);
  assert(slice.integration_qa?.status === 'PASS', `${sliceId} Integration QA must remain PASS`);
  assert(slice.human_acceptance?.status === 'APPROVED', `${sliceId} Human Acceptance must be APPROVED`);
  assert(JSON.stringify(slice.human_acceptance?.evidence_ids) === JSON.stringify([config.evidence]), `${sliceId} Human Acceptance evidence binding drifted`);
  assert(slice.evidence_ids?.includes(config.evidence), `${sliceId} top-level evidence must include Human Acceptance evidence`);

  assert(fs.existsSync(config.approvalFile), `missing ${config.approvalFile}`);
  const approval = fs.readFileSync(config.approvalFile, 'utf8');
  assert(approval.includes(`Evidence ID: \`${config.evidence}\``), `${sliceId} approval document evidence id drifted`);
  assert(approval.includes(`Accepted baseline commit: \`${acceptedBaseline}\``), `${sliceId} approval baseline drifted`);
  assert(approval.includes(`Approved at: \`${approvalTimestamp}\``), `${sliceId} approval timestamp drifted`);
  assert(approval.includes('Approver: Luis Hernández'), `${sliceId} approval document must identify the human approver`);
  assert(approval.includes(approvalPhrase), `${sliceId} approval document must preserve the explicit decision phrase`);
  assert(approval.includes('does **not** authorize merge'), `${sliceId} approval document must preserve merge separation`);
}

const status = fs.readFileSync('.blueprint/status.yaml', 'utf8');
assert(status.startsWith('blueprint_version: 0.5.2\n'), 'consumer Blueprint version must remain 0.5.2');
const updatedAt = status.match(/^updated_at: '([^']+)'$/m)?.[1];
assert(updatedAt, 'status updated_at must remain present');
assert(Date.parse(updatedAt) >= Date.parse(approvalTimestamp), 'status updated_at cannot predate the Human Acceptance decision');
assert(status.includes('digital-claim-intake/web, customer-claim-tracking/web and claims-backoffice/web are all ACCEPTED'), 'functional slice checkpoint must record all three accepted slices');
assert(/\n  integration_qa:\n    status: COMPLETE\n    progress: 100\n/.test(status), 'Integration QA must remain COMPLETE / 100%');

for (const config of Object.values(slices)) {
  assert(status.includes(`- id: ${config.evidence}\n    type: manual_approval\n    value: ${config.approvalFile}`), `${config.evidence} must be registered as manual_approval`);
}

const releaseGateOccurrences = [...status.matchAll(/^  release_gate:$/gm)].length;
assert([0, 2].includes(releaseGateOccurrences), `Release Gate must be absent or represented by phase+project gate, found ${releaseGateOccurrences}`);
if (releaseGateOccurrences === 2) {
  const phaseStarted = /\n  release_gate:\n    status: READY_FOR_REVIEW\n    progress: 80\n/.test(status);
  const phaseComplete = /\n  release_gate:\n    status: COMPLETE\n    progress: 100\n/.test(status);
  const projectReady = /\n  release_gate:\n    status: READY_FOR_REVIEW\n    evaluated_at: '[^']+'\n/.test(status);
  const projectPass = /\n  release_gate:\n    status: PASS\n    evaluated_at: '[^']+'\n/.test(status);
  assert((phaseStarted && projectReady) || (phaseComplete && projectPass), 'downstream Release Gate phase/project state must progress coherently');
  for (const check of [
    'release.functional_slices_accepted',
    'release.security_accepted',
    'release.documentation',
    'release.backup_restore',
  ]) {
    assert(new RegExp(`^  ${check.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:\\n    status: PASS\\n`, 'm').test(status), `${check} must be PASS once Release Gate starts`);
  }
}

for (const temporaryWorkflow of [
  '.github/workflows/human-acceptance-reconcile.yml',
  '.github/workflows/human-acceptance-guardrails-patch.yml',
]) {
  assert(!fs.existsSync(temporaryWorkflow), `temporary workflow still present: ${temporaryWorkflow}`);
}

console.log(JSON.stringify({
  event: 'HUMAN_ACCEPTANCE_VALID',
  blueprint: '0.5.2',
  acceptedBaseline,
  approvedAt: approvalTimestamp,
  slices: Object.keys(slices),
  lifecycle: 'ACCEPTED',
  releaseGateStarted: releaseGateOccurrences === 2,
}, null, 2));
