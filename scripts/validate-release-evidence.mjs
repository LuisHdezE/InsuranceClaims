import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(`Release Gate evidence validation failed: ${message}`);
}
function read(path) {
  assert(fs.existsSync(path), `missing ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function json(path) {
  return JSON.parse(read(path));
}

const slices = [
  ['digital-claim-intake/web', '.blueprint/functional-slices/digital-claim-intake.web.json', 'EVD-HUMAN-ACCEPTANCE-INTAKE-WEB-001'],
  ['customer-claim-tracking/web', '.blueprint/functional-slices/customer-claim-tracking.web.json', 'EVD-HUMAN-ACCEPTANCE-TRACKING-WEB-001'],
  ['claims-backoffice/web', '.blueprint/functional-slices/claims-backoffice.web.json', 'EVD-HUMAN-ACCEPTANCE-BACKOFFICE-WEB-001'],
];

for (const [identity, path, acceptanceEvidence] of slices) {
  const slice = json(path);
  assert(`${slice.id}/${slice.platform}` === identity, `${identity} identity drifted`);
  assert(slice.lifecycle_status === 'ACCEPTED', `${identity} must be ACCEPTED`);
  assert(slice.blocker === null, `${identity} cannot carry a blocker`);
  assert(slice.definition_of_done?.status === 'PASS', `${identity} functional DoD must remain PASS`);
  assert(slice.visual_functional_review?.status === 'PASS', `${identity} V&F must remain PASS`);
  assert(slice.visual_functional_review?.human_complete === true, `${identity} V&F human review must remain complete`);
  assert(slice.integration_qa?.status === 'PASS', `${identity} Integration QA must remain PASS`);
  assert(slice.human_acceptance?.status === 'APPROVED', `${identity} Human Acceptance must remain APPROVED`);
  assert(slice.human_acceptance?.evidence_ids?.includes(acceptanceEvidence), `${identity} missing Human Acceptance evidence`);
  assert(slice.evidence_ids?.includes(acceptanceEvidence), `${identity} top-level acceptance evidence missing`);
}

const status = read('.blueprint/status.yaml');
for (const [check, expected] of [
  ['architecture.security_model', 'PASS'],
  ['architecture.threat_model', 'PASS'],
  ['api.security_qa', 'PASS'],
  ['qa.security', 'PASS'],
  ['review.api_permission_fidelity', 'PASS'],
  ['review.human_complete', 'PASS'],
]) {
  const block = new RegExp(`^  ${check.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:\\n    status: ${expected}\\n`, 'm');
  assert(block.test(status), `${check} must remain ${expected}`);
}

const project = read('.blueprint/project.yaml');
assert(project.includes('version: 0.5.2'), 'project must remain pinned to Blueprint 0.5.2');
assert(project.includes('database: postgresql'), 'PostgreSQL must remain the declared database');
assert(project.includes('legacy_simulator: true'), 'simulated legacy capability must remain explicit');

const readme = read('README.md');
for (const marker of ['Release candidate scope', 'Install and verify', 'Release documentation', 'simulated legacy']) {
  assert(readme.toLowerCase().includes(marker.toLowerCase()), `README missing release marker: ${marker}`);
}

for (const path of [
  'documentation/release/RELEASE_READINESS.md',
  'documentation/release/RELEASE_GATE_EVIDENCE.md',
  'documentation/security/SECURITY_THREAT_MODEL.md',
  'documentation/architecture/ARCHITECTURE.md',
  'documentation/data/DATA_ARCHITECTURE.md',
  'documentation/audit/AUDIT_MODEL.md',
  'documentation/api/API_CONTRACT.md',
  'openapi.yaml',
  'postman/InsuranceClaims.postman_collection.json',
  'documentation/integration-qa/INTEGRATION_QA_WEB_SYSTEM_EVIDENCE.md',
  'documentation/human-acceptance/DIGITAL_CLAIM_INTAKE_WEB_APPROVAL.md',
  'documentation/human-acceptance/CUSTOMER_CLAIM_TRACKING_WEB_APPROVAL.md',
  'documentation/human-acceptance/CLAIMS_BACKOFFICE_WEB_APPROVAL.md',
  'qa/release-backup-restore.sh',
]) {
  assert(fs.existsSync(path), `required release artifact missing: ${path}`);
}

const dataArchitecture = read('documentation/data/DATA_ARCHITECTURE.md');
assert(dataArchitecture.includes('## 13. Backup/restore posture'), 'approved data architecture backup/restore posture missing');
assert(dataArchitecture.includes('pg_dump') && dataArchitecture.includes('pg_restore'), 'data architecture must preserve pg_dump/pg_restore release option');

const releaseGuide = read('documentation/release/RELEASE_READINESS.md');
for (const check of [
  'release.functional_slices_accepted',
  'release.security_accepted',
  'release.documentation',
  'release.backup_restore',
]) {
  assert(releaseGuide.includes(check), `release guide missing ${check}`);
}
assert(releaseGuide.includes('CANDIDATE / HUMAN DECISION PENDING'), 'release guide must not imply human approval');
assert(releaseGuide.includes('does **not** claim production RPO/RTO'), 'release guide must bound recoverability claims');

const evidence = read('documentation/release/RELEASE_GATE_EVIDENCE.md');
assert(evidence.includes('Human gate decision: PENDING'), 'release evidence must preserve pending human gate decision');
assert(evidence.includes('Machine success does not equal human Release Gate approval'), 'release evidence must prohibit implicit approval');

console.log(JSON.stringify({
  event: 'RELEASE_EVIDENCE_READY',
  blueprint: '0.5.2',
  slices: slices.map(([id]) => id),
  requiredChecks: [
    'release.functional_slices_accepted',
    'release.security_accepted',
    'release.documentation',
    'release.backup_restore',
  ],
  humanReleaseDecision: 'PENDING',
}, null, 2));
