import fs from 'node:fs';

function fail(message) {
  throw new Error(`Integration QA state validation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  assert(fs.existsSync(path), `missing ${path}`);
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const expectedSlices = {
  'digital-claim-intake/web': {
    file: '.blueprint/functional-slices/digital-claim-intake.web.json',
    evidence: 'EVD-INTEGRATION-QA-INTAKE-WEB-001',
    approvalEvidence: 'EVD-INTEGRATION-QA-INTAKE-WEB-APPROVAL-001',
    approvalFile: 'documentation/integration-qa/DIGITAL_CLAIM_INTAKE_WEB_APPROVAL.md',
    idempotency: 'PASS',
  },
  'customer-claim-tracking/web': {
    file: '.blueprint/functional-slices/customer-claim-tracking.web.json',
    evidence: 'EVD-INTEGRATION-QA-TRACKING-WEB-001',
    approvalEvidence: 'EVD-INTEGRATION-QA-TRACKING-WEB-APPROVAL-001',
    approvalFile: 'documentation/integration-qa/CUSTOMER_CLAIM_TRACKING_WEB_APPROVAL.md',
    idempotency: 'N/A',
  },
  'claims-backoffice/web': {
    file: '.blueprint/functional-slices/claims-backoffice.web.json',
    evidence: 'EVD-INTEGRATION-QA-BACKOFFICE-WEB-001',
    approvalEvidence: 'EVD-INTEGRATION-QA-BACKOFFICE-WEB-APPROVAL-001',
    approvalFile: 'documentation/integration-qa/CLAIMS_BACKOFFICE_WEB_APPROVAL.md',
    idempotency: 'N/A',
  },
};

const mandatoryChecks = [
  'qa.functional',
  'qa.real_api_transport',
  'qa.integration',
  'qa.security',
  'qa.responsive',
  'qa.accessibility',
  'qa.e2e',
];

const systemEvidence = 'EVD-INTEGRATION-QA-WEB-SYSTEM-001';

function validateSummary(summary, expectedReviewedSha = null) {
  assert(summary.schema_version === '0.5.0', 'summary schema_version must be 0.5.0');
  assert(summary.gate === 'integration_qa_pass', 'summary gate must be integration_qa_pass');
  assert(summary.scope === 'interface_slice_platform', 'summary scope must be interface_slice_platform');
  assert(summary.platform === 'web', 'summary platform must be web');
  assert(summary.next_status === 'READY_FOR_REVIEW', 'machine summary must stop at READY_FOR_REVIEW and never infer human approval');
  assert(summary.human_acceptance_started === false, 'Human Acceptance must not be started by Integration QA');
  assert(summary.release_gate_started === false, 'Release Gate must not be started by Integration QA');
  if (expectedReviewedSha) {
    assert(summary.reviewed_commit === expectedReviewedSha, `runtime reviewed_commit ${summary.reviewed_commit} does not match ${expectedReviewedSha}`);
  }

  const sliceIds = Object.keys(summary.slices ?? {}).sort();
  assert(JSON.stringify(sliceIds) === JSON.stringify(Object.keys(expectedSlices).sort()), 'summary slice set drifted');

  for (const [sliceId, config] of Object.entries(expectedSlices)) {
    const checks = summary.slices[sliceId];
    for (const check of mandatoryChecks) {
      assert(checks?.[check] === 'PASS', `${sliceId} ${check} must be PASS`);
    }
    assert(checks?.['qa.idempotency'] === config.idempotency, `${sliceId} qa.idempotency must be ${config.idempotency}`);
    assert(checks?.['qa.offline'] === 'PASS', `${sliceId} qa.offline must be PASS`);
  }
}

const committedSummary = readJson('documentation/integration-qa/generated/integration-qa-summary.json');
validateSummary(committedSummary);
assert(committedSummary.workflow?.result === 'SUCCESS', 'committed machine-evidence workflow must be SUCCESS');
assert(committedSummary.runtime?.database === 'PostgreSQL 18', 'committed runtime must identify PostgreSQL 18');
assert(committedSummary.runtime?.legacy_dependency === 'separate simulated HTTP legacy service', 'legacy dependency boundary drifted');
assert((committedSummary.runtime?.production_dependency_audit?.high ?? -1) === 0, 'committed production dependency audit high must be 0');
assert((committedSummary.runtime?.production_dependency_audit?.critical ?? -1) === 0, 'committed production dependency audit critical must be 0');

if (fs.existsSync('.runtime/integration-qa-summary.json')) {
  const runtimeSummary = readJson('.runtime/integration-qa-summary.json');
  validateSummary(runtimeSummary, process.env.GITHUB_SHA || null);
}

const offline = readJson('documentation/integration-qa/generated/integration-offline-browser.json');
assert(offline.review_type === 'integration_qa_offline', 'offline evidence review_type drifted');
for (const sliceId of Object.keys(expectedSlices)) {
  assert(offline.slices?.[sliceId]?.['qa.offline'] === 'PASS', `${sliceId} committed offline evidence must be PASS`);
}

const integrationStates = [];
for (const [sliceId, config] of Object.entries(expectedSlices)) {
  const slice = readJson(config.file);
  assert(`${slice.id}/${slice.platform}` === sliceId, `${config.file} identity drifted`);
  assert(['FUNCTIONAL', 'ACCEPTED'].includes(slice.lifecycle_status), `${sliceId} lifecycle must be FUNCTIONAL or ACCEPTED after Integration QA`);
  assert(slice.blocker === null, `${sliceId} must not carry an Integration QA blocker`);
  assert(slice.visual_functional_review?.status === 'PASS', `${sliceId} Visual & Functional Review must remain PASS`);
  assert(['READY_FOR_REVIEW', 'PASS'].includes(slice.integration_qa?.status), `${sliceId} integration_qa must be READY_FOR_REVIEW or PASS`);
  integrationStates.push(slice.integration_qa.status);
  assert(slice.integration_qa?.evidence_ids?.includes(systemEvidence), `${sliceId} missing system Integration QA evidence`);
  assert(slice.integration_qa?.evidence_ids?.includes(config.evidence), `${sliceId} missing scoped Integration QA evidence`);
  assert(slice.evidence_ids?.includes(systemEvidence), `${sliceId} top-level evidence missing system Integration QA evidence`);
  assert(slice.evidence_ids?.includes(config.evidence), `${sliceId} top-level evidence missing scoped Integration QA evidence`);
  assert(['PENDING', 'APPROVED'].includes(slice.human_acceptance?.status), `${sliceId} Human Acceptance must be PENDING or APPROVED`);
  if (slice.lifecycle_status === 'FUNCTIONAL') {
    assert(slice.human_acceptance.status === 'PENDING', `${sliceId} FUNCTIONAL lifecycle requires pending Human Acceptance`);
  } else {
    assert(slice.human_acceptance.status === 'APPROVED', `${sliceId} ACCEPTED lifecycle requires approved Human Acceptance`);
    assert((slice.human_acceptance.evidence_ids ?? []).length > 0, `${sliceId} ACCEPTED lifecycle requires Human Acceptance evidence`);
  }
}

const allReady = integrationStates.every((status) => status === 'READY_FOR_REVIEW');
const allApproved = integrationStates.every((status) => status === 'PASS');
assert(allReady || allApproved, 'all three scoped Integration QA states must advance together');

const status = fs.readFileSync('.blueprint/status.yaml', 'utf8');
if (allApproved) {
  assert(/\n  integration_qa:\n    status: COMPLETE\n    progress: 100\n/.test(status), 'approved global Integration QA phase must be COMPLETE at 100%');
} else {
  assert(/\n  integration_qa:\n    status: READY_FOR_REVIEW\n    progress: 89\n/.test(status), 'pre-approval global Integration QA phase must be READY_FOR_REVIEW at 89%');
}

for (const check of [...mandatoryChecks, 'qa.idempotency', 'qa.offline']) {
  const pattern = new RegExp(`^  ${escapeRegExp(check)}:\\n    status: PASS\\n`, 'm');
  assert(pattern.test(status), `global ${check} must be PASS`);
}

const scopedGateMatches = [...status.matchAll(/^  - gate: integration_qa_pass$/gm)];
assert(scopedGateMatches.length === 3, `expected exactly 3 Integration QA scoped gates, found ${scopedGateMatches.length}`);
for (const [sliceId, config] of Object.entries(expectedSlices)) {
  const [scopeId, platform] = sliceId.split('/');
  const expectedGateState = allApproved ? 'PASS' : 'READY_FOR_REVIEW';
  const gatePattern = new RegExp(
    `  - gate: integration_qa_pass\\n    scope: interface_slice_platform\\n    scope_id: ${escapeRegExp(scopeId)}\\n    platform: ${escapeRegExp(platform)}\\n    status: ${expectedGateState}\\n`,
  );
  assert(gatePattern.test(status), `${sliceId} scoped Integration QA gate must be ${expectedGateState}`);
  assert(status.includes(`- id: ${config.evidence}\n    type: integration_qa_evidence`), `${config.evidence} missing from artifact registry`);
  if (allApproved) {
    assert(fs.existsSync(config.approvalFile), `missing approval document ${config.approvalFile}`);
    assert(status.includes(`- id: ${config.approvalEvidence}\n    type: manual_approval`), `${config.approvalEvidence} missing from artifact registry`);
    const slice = readJson(config.file);
    assert(slice.integration_qa?.evidence_ids?.includes(config.approvalEvidence), `${sliceId} integration_qa missing approval evidence`);
    assert(slice.evidence_ids?.includes(config.approvalEvidence), `${sliceId} top-level evidence missing approval evidence`);
  }
}
assert(status.includes(`- id: ${systemEvidence}\n    type: integration_qa_system_evidence`), 'system Integration QA evidence missing from artifact registry');
assert(!/^  human_acceptance:/m.test(status), 'global Human Acceptance phase must not be started here');
assert(!/^  release_gate:/m.test(status), 'global Release Gate phase must not be started here');

const evidenceFiles = [
  'documentation/integration-qa/INTEGRATION_QA_WEB_SYSTEM_EVIDENCE.md',
  'documentation/integration-qa/DIGITAL_CLAIM_INTAKE_WEB_EVIDENCE.md',
  'documentation/integration-qa/CUSTOMER_CLAIM_TRACKING_WEB_EVIDENCE.md',
  'documentation/integration-qa/CLAIMS_BACKOFFICE_WEB_EVIDENCE.md',
];
for (const file of evidenceFiles) assert(fs.existsSync(file), `missing evidence document ${file}`);

console.log(`Integration QA state validation PASS (${allApproved ? 'APPROVED' : 'READY_FOR_REVIEW'})`);
console.log(`Validated slices: ${Object.keys(expectedSlices).join(', ')}`);
