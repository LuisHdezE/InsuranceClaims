import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const expectedVersion = '0.3.0';
const baselineVersion = '0.2.0';
const formalizationBaseline = '47e1745ad5cbe65c9a1b54dcae236bad7205d92b';
const formalizationMerge = '014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9';
const publicationMerge = '8425dcab54c3998f9580a7e29773550f1e8bce8f';
const fullProductClosureMerge = '54f791707d6a4e2f9425f57d0a18e20e139fb518';
const previousReleaseCommit = '9265417849f398f5d1efa56b7cd8ff365b950dbb';
const previousReleaseTag = 'v0.2.0';
const releaseTag = 'v0.3.0';
const expectedReleaseTagObject = '20c9d933e89854229259819ccbbb71b1a72a08fc';
const expectedReleaseId = '388080952';
const expectedPublicationRun = '34792695296';
const expectedReleaseName = 'Insurance Claims Legacy Modernization — R3 Full Product v0.3.0';
const expectedPublishedAt = '2026-09-14T00:27:06Z';

const workflowPath = '.github/workflows/release-formalization-0.3.0.yml';
const lineagePath = 'documentation/release/R3_RELEASE_PUBLICATION_LINEAGE_RECONCILIATION.md';
const releaseFormalizationDocPath = 'documentation/release/R3_RELEASE_FORMALIZATION_0.3.0.md';
const releaseNotesPath = 'documentation/portfolio/RELEASE_NOTES_v0.3.0.md';
const publicationGatePath = 'documentation/portfolio/R3_RELEASE_PUBLICATION_GATE_0.3.0.md';
const releaseBodyPath = 'documentation/portfolio/GITHUB_RELEASE_BODY_v0.3.0.md';
const closureManifestPath = 'documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.json';

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

const exactFormalizationPaths = [
  '.github/workflows/release-formalization-0.2.0.yml',
  '.github/workflows/release-formalization-0.3.0.yml',
  'README.md',
  'apps/api/package.json',
  'apps/legacy-simulator/package.json',
  'apps/mcp/package.json',
  'apps/web/package.json',
  'documentation/portfolio/RELEASE_NOTES_v0.3.0.md',
  'documentation/release/R3_RELEASE_FORMALIZATION_0.3.0.md',
  'package-lock.json',
  'package.json',
  'packages/application/package.json',
  'packages/domain/package.json',
  'packages/infrastructure/package.json',
  'scripts/validate-r3-full-product-closure.mjs',
  'scripts/validate-release-formalization-0.3.0.mjs',
].sort();

const exactPublicationGatePaths = [
  '.github/workflows/release-formalization-0.3.0.yml',
  'documentation/portfolio/GITHUB_RELEASE_BODY_v0.3.0.md',
  'documentation/portfolio/R3_RELEASE_PUBLICATION_GATE_0.3.0.md',
  'scripts/validate-release-formalization-0.3.0.mjs',
].sort();

function fail(message) {
  throw new Error(`[r3-release-formalization-0.3.0] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim();
}

function readText(path) {
  assert(existsSync(path), `missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function readCommitText(commit, path) {
  return execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8' });
}

function readCommitJson(commit, path) {
  return JSON.parse(readCommitText(commit, path));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeManifest(document, normalizedVersion, internalPackageNames) {
  const normalized = clone(document);
  normalized.version = normalizedVersion;
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencyName of Object.keys(normalized[section] ?? {})) {
      if (internalPackageNames.has(dependencyName)) normalized[section][dependencyName] = normalizedVersion;
    }
  }
  return normalized;
}

function normalizeLock(document, normalizedVersion, internalPackageNames) {
  const normalized = clone(document);
  normalized.version = normalizedVersion;
  if (normalized.packages?.['']) normalized.packages[''].version = normalizedVersion;
  for (const file of packageFiles.slice(1)) {
    const workspacePath = file.replace(/\/package\.json$/, '');
    const workspace = normalized.packages?.[workspacePath];
    if (!workspace) continue;
    workspace.version = normalizedVersion;
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dependencyName of Object.keys(workspace[section] ?? {})) {
        if (internalPackageNames.has(dependencyName)) workspace[section][dependencyName] = normalizedVersion;
      }
    }
  }
  return normalized;
}

function assertJsonEquivalent(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} contains drift beyond approved release identity metadata`);
}

function changedPaths(base, head) {
  const output = git(['diff', '--name-only', `${base}...${head}`]);
  return output ? output.split(/\r?\n/u).filter(Boolean).sort() : [];
}

function assertExactPaths(actual, expected, label) {
  assert(actual.length === expected.length, `${label} changed-file count must be ${expected.length}; found ${actual.length}: ${actual.join(', ')}`);
  expected.forEach((path, index) => {
    assert(actual[index] === path, `${label} path drift at index ${index}: expected ${path}, found ${actual[index]}`);
  });
}

function isAncestor(ancestor, descendant = 'HEAD') {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function assertCurrentMatchesHistorical(path, commit, label) {
  assert(readText(path) === readCommitText(commit, path), `${label} changed after its accepted historical release checkpoint: ${path}`);
}

// Preserve the historical release chain. Current main may evolve, but these accepted commits must remain ancestors.
for (const ancestor of [formalizationBaseline, fullProductClosureMerge, formalizationMerge, publicationMerge]) {
  assert(isAncestor(ancestor), `HEAD must descend from approved ancestor ${ancestor}`);
}
assert(isAncestor(fullProductClosureMerge, formalizationMerge), 'release formalization must descend from the approved R3 full-product closure');
assert(isAncestor(formalizationMerge, publicationMerge), 'publication gate must descend from the approved release formalization');

// Freeze the exact historical changed-file boundaries rather than comparing release-day paths to current HEAD.
assertExactPaths(changedPaths(formalizationBaseline, formalizationMerge), exactFormalizationPaths, 'historical formalization');
assertExactPaths(changedPaths(formalizationMerge, publicationMerge), exactPublicationGatePaths, 'historical publication gate');

// Validate package/version identity at the immutable release commit, not against the later evolved current product tree.
const releasePackages = new Map();
const baselinePackages = new Map();
const internalPackageNames = new Set();

for (const file of packageFiles) {
  const released = readCommitJson(formalizationMerge, file);
  const baseline = readCommitJson(formalizationBaseline, file);
  releasePackages.set(file, released);
  baselinePackages.set(file, baseline);
  assert(released.version === expectedVersion, `${file} release version must be ${expectedVersion}; found ${released.version}`);
  assert(baseline.version === baselineVersion, `${file} baseline version must be ${baselineVersion}; found ${baseline.version}`);
  if (released.name) internalPackageNames.add(released.name);
}

for (const [file, released] of releasePackages) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependencyName, dependencyVersion] of Object.entries(released[section] ?? {})) {
      if (internalPackageNames.has(dependencyName)) {
        assert(dependencyVersion === expectedVersion, `${file} ${section}.${dependencyName} must be ${expectedVersion}; found ${dependencyVersion}`);
      }
    }
  }
  assertJsonEquivalent(normalizeManifest(released, baselineVersion, internalPackageNames), baselinePackages.get(file), `${file} at release commit`);
}

const releaseLock = readCommitJson(formalizationMerge, 'package-lock.json');
const baselineLock = readCommitJson(formalizationBaseline, 'package-lock.json');
assert(releaseLock.version === expectedVersion, `release package-lock.json version must be ${expectedVersion}; found ${releaseLock.version}`);
assert(releaseLock.lockfileVersion === 3, `release package-lock.json lockfileVersion must remain 3; found ${releaseLock.lockfileVersion}`);
assert(releaseLock.packages?.['']?.version === expectedVersion, `release package-lock root package version must be ${expectedVersion}`);

for (const file of packageFiles.slice(1)) {
  const workspacePath = file.replace(/\/package\.json$/, '');
  const workspace = releaseLock.packages?.[workspacePath];
  assert(workspace?.version === expectedVersion, `release package-lock workspace ${workspacePath} version must be ${expectedVersion}; found ${workspace?.version}`);
}
assertJsonEquivalent(normalizeLock(releaseLock, baselineVersion, internalPackageNames), baselineLock, 'package-lock.json at release commit');

// Preserve the historical R3 release identity at the immutable release commit.
const closure = readCommitJson(formalizationMerge, closureManifestPath);
assert(closure.contractRevision === 'api-v1-r3', 'release must remain bound to api-v1-r3');
assert(closure.blueprintConsumerVersion === '0.5.2', 'Blueprint consumer must remain 0.5.2');
assert(closure.deliveryMode === 'GREENFIELD', 'delivery mode must remain GREENFIELD');
assert(closure.legacyCoexistence === 'SIMULATED', 'legacy coexistence must remain SIMULATED');
assert(closure.api?.operations === 90, `R3 operation count must remain 90; found ${closure.api?.operations}`);
assert(closure.api?.paths === 76, `R3 path count must remain 76; found ${closure.api?.paths}`);
assert(closure.api?.families === 16, `R3 family count must remain 16; found ${closure.api?.families}`);
assert(closure.webSurfaces?.length === 22, `R3 productized web surfaces must remain 22; found ${closure.webSurfaces?.length}`);

// Release evidence documents are historical records and must remain byte-stable.
assertCurrentMatchesHistorical(releaseFormalizationDocPath, formalizationMerge, 'release formalization evidence');
assertCurrentMatchesHistorical(releaseNotesPath, formalizationMerge, 'release notes evidence');
assertCurrentMatchesHistorical(publicationGatePath, publicationMerge, 'publication gate evidence');
assertCurrentMatchesHistorical(releaseBodyPath, publicationMerge, 'GitHub Release body evidence');

const releaseDoc = readText(releaseFormalizationDocPath);
for (const marker of ['v0.3.0', 'v0.2.0', 'Gate A', 'Gate B', formalizationBaseline]) {
  assert(releaseDoc.includes(marker), `release formalization document missing marker: ${marker}`);
}

const publicationGate = readText(publicationGatePath);
for (const marker of ['READY_FOR_HUMAN_GATE_B', formalizationMerge, 'v0.3.0', 'annotated', '90', '76', '16', '22']) {
  assert(publicationGate.includes(marker), `publication gate document missing marker: ${marker}`);
}

const releaseBody = readText(releaseBodyPath);
for (const marker of ['R3 Full Product v0.3.0', formalizationMerge, 'api-v1-r3', '90', '76', '16', '22', 'Caso técnico no oficial']) {
  assert(releaseBody.includes(marker), `GitHub release body missing marker: ${marker}`);
}

// The local checkout must see the immutable annotated release tags.
const previousTagCommit = git(['rev-parse', `${previousReleaseTag}^{commit}`]);
assert(previousTagCommit === previousReleaseCommit, `${previousReleaseTag} must remain pinned to ${previousReleaseCommit}; found ${previousTagCommit}`);

const releaseTagObject = git(['rev-parse', `refs/tags/${releaseTag}`]);
assert(releaseTagObject === expectedReleaseTagObject, `${releaseTag} tag object drift: expected ${expectedReleaseTagObject}, found ${releaseTagObject}`);
assert(git(['cat-file', '-t', releaseTagObject]) === 'tag', `${releaseTag} must remain an annotated tag object`);
const releaseTagCommit = git(['rev-parse', `${releaseTag}^{commit}`]);
assert(releaseTagCommit === formalizationMerge, `${releaseTag} must peel to ${formalizationMerge}; found ${releaseTagCommit}`);

// The current workflow must be verification-only. Publication side effects are historical and must not be replayable.
const workflow = readText(workflowPath);
for (const marker of [
  'name: R3 Release Formalization 0.3.0',
  'Verify remote v0.3.0 publication integrity',
  'R3_RELEASE_PUBLICATION_INTEGRITY_0_3_0_PASS',
]) {
  assert(workflow.includes(marker), `current release workflow missing post-publication marker: ${marker}`);
}
for (const forbidden of ['publish-release:', 'contents: write', 'Create annotated tag and GitHub Release']) {
  assert(!workflow.includes(forbidden), `current release workflow must not retain publication side effect: ${forbidden}`);
}

const lineage = readText(lineagePath);
for (const marker of [
  formalizationBaseline,
  formalizationMerge,
  publicationMerge,
  expectedReleaseTagObject,
  expectedReleaseId,
  expectedPublicationRun,
  expectedReleaseName,
  expectedPublishedAt,
  releaseTag,
  'Gate A',
  'Gate B',
]) {
  assert(lineage.includes(marker), `release publication lineage reconciliation missing marker: ${marker}`);
}

console.log('R3 RELEASE FORMALIZATION / PUBLICATION INTEGRITY 0.3.0: PASS');
console.log(`Formalization baseline: ${formalizationBaseline}`);
console.log(`Immutable release commit: ${formalizationMerge}`);
console.log(`Publication-gate merge: ${publicationMerge}`);
console.log(`Historical formalization files: ${exactFormalizationPaths.length}`);
console.log(`Historical publication-gate files: ${exactPublicationGatePaths.length}`);
console.log(`Published tag: ${releaseTag} -> ${releaseTagCommit}`);
console.log(`Annotated tag object: ${releaseTagObject}`);
console.log(`Expected GitHub Release ID: ${expectedReleaseId}`);
console.log(`Publication workflow run: ${expectedPublicationRun}`);
console.log(`R3 API: ${closure.api.operations} operations / ${closure.api.paths} paths / ${closure.api.families} families`);
console.log(`R3 productized web surfaces: ${closure.webSurfaces.length}`);
console.log('Publication side effects: NONE');
