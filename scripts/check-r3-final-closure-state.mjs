import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const baseline = '4908dda3988f96f3ace747d68dd117a8766b8f3a';
const tempRoot = resolve('.runtime/r3-final-closure-zero-drift');
const materializer = resolve('scripts/materialize-r3-final-closure-status.mjs');

function gitShow(path) {
  return execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' });
}

await rm(tempRoot, { recursive: true, force: true });
await mkdir(resolve(tempRoot, '.blueprint'), { recursive: true });

try {
  await Promise.all([
    writeFile(resolve(tempRoot, '.blueprint/status.yaml'), gitShow('.blueprint/status.yaml'), 'utf8'),
    writeFile(resolve(tempRoot, '.blueprint/project.yaml'), gitShow('.blueprint/project.yaml'), 'utf8'),
  ]);

  execFileSync(process.execPath, [materializer], {
    cwd: tempRoot,
    stdio: 'inherit',
  });

  const [expectedStatus, expectedProject, actualStatus, actualProject] = await Promise.all([
    readFile(resolve(tempRoot, '.blueprint/status.yaml'), 'utf8'),
    readFile(resolve(tempRoot, '.blueprint/project.yaml'), 'utf8'),
    readFile('.blueprint/status.yaml', 'utf8'),
    readFile('.blueprint/project.yaml', 'utf8'),
  ]);

  assert.equal(actualStatus, expectedStatus, '.blueprint/status.yaml drifted from deterministic R3 closure materialization');
  assert.equal(actualProject, expectedProject, '.blueprint/project.yaml drifted from deterministic R3 closure materialization');
  console.log(`R3 final closure zero-drift PASS from baseline ${baseline}.`);
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
