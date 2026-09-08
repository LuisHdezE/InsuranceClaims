import { existsSync, readFileSync } from 'node:fs';

const expectedVersion = '0.2.0';
const baselineVersion = '0.1.0';

const packageFiles = [
  'package.json',
  'apps/api/package.json',
  'apps/web/package.json',
  'apps/mcp/package.json',
  'apps/legacy-simulator/package.json',
  'packages/domain/package.json',
  'packages/application/package.json',
  'packages/infrastructure/package.json',
];

function fail(message) {
  console.error(`RELEASE FORMALIZATION 0.2.0: FAIL — ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  assert(existsSync(path), `missing required file: ${path}`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

const packages = new Map();
const internalPackageNames = new Set();

for (const file of packageFiles) {
  const document = readJson(file);
  packages.set(file, document);
  assert(document.version === expectedVersion, `${file} version must be ${expectedVersion}; found ${document.version}`);
  if (document.name) internalPackageNames.add(document.name);
}

for (const [file, document] of packages) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependencyName, dependencyVersion] of Object.entries(document[section] ?? {})) {
      if (internalPackageNames.has(dependencyName)) {
        assert(
          dependencyVersion === expectedVersion,
          `${file} ${section}.${dependencyName} must be ${expectedVersion}; found ${dependencyVersion}`,
        );
      }
    }
  }
}

const lock = readJson('package-lock.json');
assert(lock.version === expectedVersion, `package-lock.json version must be ${expectedVersion}; found ${lock.version}`);
assert(lock.lockfileVersion === 3, `package-lock.json lockfileVersion must remain 3; found ${lock.lockfileVersion}`);
assert(lock.packages?.['']?.version === expectedVersion, `package-lock root package version must be ${expectedVersion}`);

for (const file of packageFiles.slice(1)) {
  const workspacePath = file.replace(/\/package\.json$/, '');
  assert(
    lock.packages?.[workspacePath]?.version === expectedVersion,
    `package-lock workspace ${workspacePath} version must be ${expectedVersion}; found ${lock.packages?.[workspacePath]?.version}`,
  );
}

const review = readJson('documentation/claims-operations/review/generated/claims-operations-increment-review.json');
assert(review.review_type === 'claims_operations_experience_increment', 'unexpected Claims Operations review type');
assert(review.candidate_version === expectedVersion, `increment review candidate must be ${expectedVersion}`);
assert(review.baseline_version === baselineVersion, `increment review baseline must be ${baselineVersion}`);
assert(review.summary?.machine_review_ready === true, 'increment review must remain machine-review ready');
assert(review.summary?.human_review_required === true, 'increment review must retain its original human-review requirement');
assert(review.summary?.screenshot_count === 12, `increment review must retain 12 screenshots; found ${review.summary?.screenshot_count}`);
assert(review.summary?.historical_mvp_evidence_preserved === true, 'increment review must preserve historical MVP evidence');
assert(review.journey?.claim_status_after_task_completion === 'RECEIVED', 'task completion must not mutate Claim lifecycle');
assert(review.journey?.claim_status_after_explicit_transition === 'UNDER_REVIEW', 'explicit Claim transition result must remain UNDER_REVIEW');
assert(review.journey?.public_tracking_after_transition === 'UNDER_REVIEW', 'public tracking must reflect the explicit transition');
assert(review.journey?.evidence_pending_before === 1 && review.journey?.evidence_pending_after === 0, 'Evidence Attention reviewed journey changed unexpectedly');
assert(review.journey?.tasks_open_before === 2 && review.journey?.tasks_open_after === 1, 'ClaimTask reviewed journey changed unexpectedly');

const apiRevision = readJson('documentation/api/post-mvp/API_CONTRACT_REVISION_R2.json');
assert(apiRevision.contract_revision === 'api-v1-r2', 'release must remain bound to api-v1-r2');
assert(apiRevision.previous_revision === 'api-v1-r1', 'api-v1-r2 must retain api-v1-r1 as immutable predecessor');
assert(apiRevision.blueprint_version === '0.5.2', 'api-v1-r2 must remain governed by Blueprint 0.5.2');
assert(apiRevision.composition?.strategy === 'immutable_base_plus_additions_no_overrides', 'api-v1-r2 composition strategy changed unexpectedly');
assert(apiRevision.composition?.base_operation_count === 10, 'api-v1-r2 base operation count must remain 10');
assert(apiRevision.composition?.additive_operation_count === 5, 'api-v1-r2 additive operation count must remain 5');
assert(apiRevision.composition?.effective_operation_count === 15, 'api-v1-r2 effective operation count must remain 15');

const apiImpact = readJson('.blueprint/api-impact/API-IMPACT-001.json');
assert(apiImpact.change_id === 'API-IMPACT-001', 'release must remain bound to API-IMPACT-001');
assert(apiImpact.previous_revision === 'api-v1-r1' && apiImpact.new_revision === 'api-v1-r2', 'API impact revision linkage changed unexpectedly');
assert(apiImpact.classification === 'platform_cross_cutting', 'API impact classification must remain platform_cross_cutting');
assert(apiImpact.revalidation_policy === 'platform', 'API impact revalidation policy must remain platform');
assert(apiImpact.preserve_unrelated_evidence === true, 'API impact must preserve unrelated accepted evidence');
assert(apiImpact.changed_operation_ids?.length === 5, 'API impact must retain five changed operations');

for (const documentPath of [
  'documentation/release/CLAIMS_OPERATIONS_RELEASE_0.2.0.md',
  'documentation/portfolio/RELEASE_NOTES_v0.2.0.md',
]) {
  assert(existsSync(documentPath), `missing release document: ${documentPath}`);
}

if (!process.exitCode) {
  console.log('RELEASE FORMALIZATION 0.2.0: PASS');
  console.log(`Validated ${packageFiles.length} package manifests, lockfile metadata, Claims Operations review, api-v1-r2 and API-IMPACT-001.`);
}
