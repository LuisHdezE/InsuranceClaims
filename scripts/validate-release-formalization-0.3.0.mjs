import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const expectedVersion = '0.3.0';
const baselineVersion = '0.2.0';
const formalizationBaseline = '47e1745ad5cbe65c9a1b54dcae236bad7205d92b';
const fullProductClosureMerge = '54f791707d6a4e2f9425f57d0a18e20e139fb518';
const previousReleaseCommit = '9265417849f398f5d1efa56b7cd8ff365b950dbb';
const previousReleaseTag = 'v0.2.0';
const candidateReleaseTag = 'v0.3.0';

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

function fail(message) {
  throw new Error(`[r3-release-formalization-0.3.0] ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(path) {
  assert(existsSync(path), `missing required file: ${path}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readText(path) {
  assert(existsSync(path), `missing required file: ${path}`);
  return readFileSync(path, 'utf8');
}

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim();
}

function readBaselineJson(path) {
  return JSON.parse(git(['show', `${formalizationBaseline}:${path}`]));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeManifest(document, normalizedVersion, internalPackageNames) {
  const normalized = clone(document);
  normalized.version = normalizedVersion;
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const dependencyName of Object.keys(normalized[section] ?? {})) {
      if (internalPackageNames.has(dependencyName)) {
        normalized[section][dependencyName] = normalizedVersion;
      }
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
        if (internalPackageNames.has(dependencyName)) {
          workspace[section][dependencyName] = normalizedVersion;
        }
      }
    }
  }
  return normalized;
}

function assertJsonEquivalent(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} contains drift beyond approved release identity metadata`);
}

try {
  execFileSync('git', ['merge-base', '--is-ancestor', formalizationBaseline, 'HEAD'], { stdio: 'pipe' });
} catch {
  fail(`HEAD must descend from formalization baseline ${formalizationBaseline}`);
}

try {
  execFileSync('git', ['merge-base', '--is-ancestor', fullProductClosureMerge, 'HEAD'], { stdio: 'pipe' });
} catch {
  fail(`HEAD must descend from R3 Full Product Technical Closure merge ${fullProductClosureMerge}`);
}

const packages = new Map();
const baselinePackages = new Map();
const internalPackageNames = new Set();

for (const file of packageFiles) {
  const candidate = readJson(file);
  const baseline = readBaselineJson(file);
  packages.set(file, candidate);
  baselinePackages.set(file, baseline);
  assert(candidate.version === expectedVersion, `${file} version must be ${expectedVersion}; found ${candidate.version}`);
  assert(baseline.version === baselineVersion, `${file} baseline version must be ${baselineVersion}; found ${baseline.version}`);
  if (candidate.name) internalPackageNames.add(candidate.name);
}

for (const [file, candidate] of packages) {
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependencyName, dependencyVersion] of Object.entries(candidate[section] ?? {})) {
      if (internalPackageNames.has(dependencyName)) {
        assert(
          dependencyVersion === expectedVersion,
          `${file} ${section}.${dependencyName} must be ${expectedVersion}; found ${dependencyVersion}`,
        );
      }
    }
  }

  const normalizedCandidate = normalizeManifest(candidate, baselineVersion, internalPackageNames);
  assertJsonEquivalent(normalizedCandidate, baselinePackages.get(file), file);
}

const lock = readJson('package-lock.json');
const baselineLock = readBaselineJson('package-lock.json');
assert(lock.version === expectedVersion, `package-lock.json version must be ${expectedVersion}; found ${lock.version}`);
assert(lock.lockfileVersion === 3, `package-lock.json lockfileVersion must remain 3; found ${lock.lockfileVersion}`);
assert(lock.packages?.['']?.version === expectedVersion, `package-lock root package version must be ${expectedVersion}`);

for (const file of packageFiles.slice(1)) {
  const workspacePath = file.replace(/\/package\.json$/, '');
  const workspace = lock.packages?.[workspacePath];
  assert(workspace?.version === expectedVersion, `package-lock workspace ${workspacePath} version must be ${expectedVersion}; found ${workspace?.version}`);
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [dependencyName, dependencyVersion] of Object.entries(workspace?.[section] ?? {})) {
      if (internalPackageNames.has(dependencyName)) {
        assert(
          dependencyVersion === expectedVersion,
          `package-lock ${workspacePath} ${section}.${dependencyName} must be ${expectedVersion}; found ${dependencyVersion}`,
        );
      }
    }
  }
}

const normalizedLock = normalizeLock(lock, baselineVersion, internalPackageNames);
assertJsonEquivalent(normalizedLock, baselineLock, 'package-lock.json');

const closure = readJson('documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.json');
assert(closure.contractRevision === 'api-v1-r3', 'release must remain bound to api-v1-r3');
assert(closure.blueprintConsumerVersion === '0.5.2', 'Blueprint consumer must remain 0.5.2');
assert(closure.deliveryMode === 'GREENFIELD', 'delivery mode must remain GREENFIELD');
assert(closure.legacyCoexistence === 'SIMULATED', 'legacy coexistence must remain SIMULATED');
assert(closure.api?.operations === 90, `R3 operation count must remain 90; found ${closure.api?.operations}`);
assert(closure.api?.paths === 76, `R3 path count must remain 76; found ${closure.api?.paths}`);
assert(closure.api?.families === 16, `R3 family count must remain 16; found ${closure.api?.families}`);
assert(closure.webSurfaces?.length === 22, `R3 productized web surfaces must remain 22; found ${closure.webSurfaces?.length}`);
assert(closure.deliberateExclusions?.length === 3, `R3 deliberate exclusions must remain 3; found ${closure.deliberateExclusions?.length}`);

const releaseDoc = readText('documentation/release/R3_RELEASE_FORMALIZATION_0.3.0.md');
for (const marker of [
  'CANDIDATE / HUMAN MERGE DECISION PENDING',
  'Publication status: `NOT_STARTED`',
  formalizationBaseline,
  'v0.3.0',
  'v0.2.0',
  'Gate A',
  'Gate B',
]) {
  assert(releaseDoc.includes(marker), `release formalization document missing marker: ${marker}`);
}

const releaseNotes = readText('documentation/portfolio/RELEASE_NOTES_v0.3.0.md');
for (const marker of [
  'Formalization status: `CANDIDATE / HUMAN MERGE DECISION PENDING`',
  'Publication status: `NOT_STARTED`',
  '90',
  '76',
  '16',
  '22',
  'v0.3.0',
]) {
  assert(releaseNotes.includes(marker), `release notes missing marker: ${marker}`);
}

const readme = readText('README.md');
for (const marker of [
  'Latest published release',
  'v0.2.0',
  'v0.3.0',
  'formalization candidate',
  'api-v1-r3',
  '90 operations',
]) {
  assert(readme.toLowerCase().includes(marker.toLowerCase()), `README missing release marker: ${marker}`);
}

const previousTagCommit = git(['rev-parse', `${previousReleaseTag}^{commit}`]);
assert(previousTagCommit === previousReleaseCommit, `${previousReleaseTag} must remain pinned to ${previousReleaseCommit}; found ${previousTagCommit}`);

let candidateTagExists = true;
try {
  execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/tags/${candidateReleaseTag}`], { stdio: 'ignore' });
} catch {
  candidateTagExists = false;
}
assert(candidateTagExists === false, `${candidateReleaseTag} must not exist before the separate publication gate`);

const changed = git(['diff', '--name-only', `${formalizationBaseline}...HEAD`]);
const changedPaths = changed ? changed.split(/\r?\n/u).filter(Boolean).sort() : [];
assert(changedPaths.length === exactFormalizationPaths.length, `formalization changed-file count must be ${exactFormalizationPaths.length}; found ${changedPaths.length}: ${changedPaths.join(', ')}`);
for (let index = 0; index < exactFormalizationPaths.length; index += 1) {
  assert(changedPaths[index] === exactFormalizationPaths[index], `formalization path drift at index ${index}: expected ${exactFormalizationPaths[index]}, found ${changedPaths[index]}`);
}

console.log('R3 RELEASE FORMALIZATION 0.3.0: PASS');
console.log(`Formalization baseline: ${formalizationBaseline}`);
console.log(`Candidate version: ${expectedVersion}`);
console.log(`Previous published tag preserved: ${previousReleaseTag} -> ${previousReleaseCommit}`);
console.log(`Candidate tag publication state: ${candidateReleaseTag} ABSENT as required`);
console.log(`Validated package manifests: ${packageFiles.length}`);
console.log(`Exact formalization paths: ${changedPaths.length}`);
console.log(`R3 API: ${closure.api.operations} operations / ${closure.api.paths} paths / ${closure.api.families} families`);
console.log(`R3 productized web surfaces: ${closure.webSurfaces.length}`);
