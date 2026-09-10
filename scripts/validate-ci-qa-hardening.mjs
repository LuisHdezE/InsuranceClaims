import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const prOnlyExactHead = [
  '.github/workflows/api-implementation.yml',
  '.github/workflows/api-qa.yml',
  '.github/workflows/openapi-validation.yml',
  '.github/workflows/openapi-post-mvp-validation.yml',
  '.github/workflows/postman-contract.yml',
  '.github/workflows/client-architecture.yml',
  '.github/workflows/design-system.yml',
  '.github/workflows/interface-inventory.yml',
  '.github/workflows/functional-slice-digital-claim-intake-web.yml',
  '.github/workflows/functional-slice-customer-claim-tracking-web.yml',
  '.github/workflows/functional-slice-claims-backoffice-web.yml',
];

const mixedEventExactHead = [
  '.github/workflows/integration-qa-web.yml',
  '.github/workflows/release-gate-evidence.yml',
  '.github/workflows/release-formalization-0.2.0.yml',
  '.github/workflows/operations-observability.yml',
];

const expensiveRuntimeWorkflows = [
  '.github/workflows/api-qa.yml',
  '.github/workflows/integration-qa-web.yml',
  '.github/workflows/release-gate-evidence.yml',
];

const dependencyAuditWorkflows = [
  '.github/workflows/api-qa.yml',
  '.github/workflows/integration-qa-web.yml',
  '.github/workflows/release-gate-evidence.yml',
];

const failures = [];
const checks = [];
const texts = new Map();

async function text(path) {
  if (!texts.has(path)) texts.set(path, await readFile(path, 'utf8'));
  return texts.get(path);
}

function pass(id, detail) {
  checks.push({ id, status: 'PASS', detail });
}

function fail(id, detail) {
  checks.push({ id, status: 'FAIL', detail });
  failures.push(`${id}: ${detail}`);
}

for (const path of [...prOnlyExactHead, ...mixedEventExactHead]) {
  const content = await text(path);
  if (!content.includes('permissions:\n  contents: read')) {
    fail('ci.read_only_permissions', `${path} must declare contents: read`);
  } else if (content.includes('contents: write')) {
    fail('ci.read_only_permissions', `${path} must not grant contents: write`);
  } else {
    pass('ci.read_only_permissions', path);
  }

  if (!content.includes('timeout-minutes:')) {
    fail('ci.bounded_runtime', `${path} must define timeout-minutes`);
  } else {
    pass('ci.bounded_runtime', path);
  }
}

for (const path of prOnlyExactHead) {
  const content = await text(path);
  const expected = 'ref: ${{ github.event.pull_request.head.sha }}';
  if (!content.includes(expected)) fail('ci.exact_pr_head', `${path} must checkout pull_request.head.sha`);
  else pass('ci.exact_pr_head', path);
}

for (const path of mixedEventExactHead) {
  const content = await text(path);
  const expected = 'ref: ${{ github.event.pull_request.head.sha || github.sha }}';
  if (!content.includes(expected)) fail('ci.exact_pr_head_with_event_fallback', `${path} must checkout PR head with github.sha fallback`);
  else pass('ci.exact_pr_head_with_event_fallback', path);
}

for (const path of expensiveRuntimeWorkflows) {
  const content = await text(path);
  if (!content.includes('concurrency:') || !content.includes('cancel-in-progress: true')) {
    fail('ci.cancel_stale_runtime_runs', `${path} must cancel obsolete runs`);
  } else {
    pass('ci.cancel_stale_runtime_runs', path);
  }
}

for (const path of dependencyAuditWorkflows) {
  const content = await text(path);
  if (!content.includes('scripts/classify-production-audit.mjs')) {
    fail('qa.fail_closed_dependency_audit', `${path} must use the shared production audit classifier`);
  } else if (!content.includes('npm audit --omit=dev --json')) {
    fail('qa.fail_closed_dependency_audit', `${path} must collect npm audit --omit=dev --json evidence`);
  } else {
    pass('qa.fail_closed_dependency_audit', path);
  }
}

const releaseEvidence = await text('.github/workflows/release-gate-evidence.yml');
if (!releaseEvidence.includes('candidate_sha=$(git rev-parse HEAD)')) {
  fail('release.exact_candidate_sha', 'Release Gate Evidence must report git rev-parse HEAD');
} else {
  pass('release.exact_candidate_sha', '.github/workflows/release-gate-evidence.yml');
}

for (const path of ['.github/workflows/api-qa.yml', '.github/workflows/integration-qa-web.yml']) {
  const content = await text(path);
  if (!content.includes('npm ci')) fail('qa.locked_install', `${path} must use npm ci`);
  else pass('qa.locked_install', path);
}

let candidateSha = null;
try {
  candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Static validation remains useful outside a Git worktree.
}

const summary = {
  schemaVersion: '1.0',
  gate: 'ci_qa_hardening',
  candidateSha,
  checkedWorkflows: [...new Set([...prOnlyExactHead, ...mixedEventExactHead])].sort(),
  checks,
  decision: failures.length ? 'BLOCK' : 'PASS',
};

await mkdir('.runtime', { recursive: true });
await writeFile('.runtime/ci-qa-hardening-summary.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

if (failures.length) {
  console.error('CI/QA hardening validation FAILED');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`CI/QA hardening validation PASS: ${summary.checkedWorkflows.length} governed workflows.`);
