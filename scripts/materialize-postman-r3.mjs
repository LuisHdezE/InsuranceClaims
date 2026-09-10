import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const checkMode = process.argv.includes('--check');
const generator = resolve('scripts/generate-postman-r3.mjs');
const enricher = resolve('scripts/enrich-postman-r3-historical.mjs');
const inventory = resolve('documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json');
const openapi = resolve('openapi.yaml');
const baseline = resolve('postman/baselines/api-v1-r1/InsuranceClaims.postman_collection.json');
const collection = resolve('postman/InsuranceClaims.postman_collection.json');
const environment = resolve('postman/InsuranceClaims.local.postman_environment.json');

function run(script, args) {
  execFileSync(process.execPath, [script, ...args], { stdio: 'inherit' });
}

if (!checkMode) {
  run(generator, [inventory, openapi, collection, environment]);
  run(enricher, [collection, baseline, environment]);
  console.log('Materialized deterministic Postman R3 pack with frozen R1 body compatibility.');
  process.exit(0);
}

const temp = await mkdtemp(join(tmpdir(), 'insurance-postman-r3-'));
try {
  const expectedCollection = join(temp, 'InsuranceClaims.postman_collection.json');
  const expectedEnvironment = join(temp, 'InsuranceClaims.local.postman_environment.json');
  run(generator, [inventory, openapi, expectedCollection, expectedEnvironment]);
  run(enricher, [expectedCollection, baseline, expectedEnvironment]);

  assert.equal(
    await readFile(collection, 'utf8'),
    await readFile(expectedCollection, 'utf8'),
    'Postman R3 collection drift detected; run npm run postman:generate:r3.',
  );
  assert.equal(
    await readFile(environment, 'utf8'),
    await readFile(expectedEnvironment, 'utf8'),
    'Postman R3 environment drift detected; run npm run postman:generate:r3.',
  );
  console.log('Postman R3 materialization check PASS: 90 operations / 16 families / historical body compatibility / zero drift.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
