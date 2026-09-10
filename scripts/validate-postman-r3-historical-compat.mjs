import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [collectionPath = 'postman/InsuranceClaims.postman_collection.json', baselinePath = 'postman/baselines/api-v1-r1/InsuranceClaims.postman_collection.json'] = process.argv.slice(2);
const [collection, baseline] = await Promise.all([
  readFile(collectionPath, 'utf8').then(JSON.parse),
  readFile(baselinePath, 'utf8').then(JSON.parse),
]);

function flatten(items = [], target = new Map()) {
  for (const item of items) {
    if (Array.isArray(item.item)) flatten(item.item, target);
    else if (item.request) target.set(item.name, item);
  }
  return target;
}

const active = flatten(collection.item);
const historical = flatten(baseline.item);
const frozenHistoricalBodies = ['verifyPolicyVehicle', 'trackClaim', 'transitionClaimStatus'];

for (const operationId of frozenHistoricalBodies) {
  const currentBody = active.get(operationId)?.request?.body;
  const historicalBody = historical.get(operationId)?.request?.body;
  assert.ok(currentBody, `${operationId}: active R3 request body missing`);
  assert.ok(historicalBody, `${operationId}: historical R1 request body missing`);
  assert.deepEqual(currentBody, historicalBody, `${operationId}: inherited R1 request body drifted in R3 Postman pack`);
}

console.log(`Postman historical body compatibility PASS: ${frozenHistoricalBodies.join(', ')}.`);
