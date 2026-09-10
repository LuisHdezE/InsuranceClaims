import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const [
  collectionPath = 'postman/InsuranceClaims.postman_collection.json',
  baselinePath = 'postman/baselines/api-v1-r1/InsuranceClaims.postman_collection.json',
  environmentPath = 'postman/InsuranceClaims.local.postman_environment.json',
] = process.argv.slice(2);

const [collection, baseline, environment] = await Promise.all([
  readFile(collectionPath, 'utf8').then(JSON.parse),
  readFile(baselinePath, 'utf8').then(JSON.parse),
  readFile(environmentPath, 'utf8').then(JSON.parse),
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
  const target = active.get(operationId);
  const source = historical.get(operationId);
  assert.ok(target?.request, `Active R3 request missing for ${operationId}`);
  assert.ok(source?.request?.body, `Historical R1 body missing for ${operationId}`);
  target.request.body = structuredClone(source.request.body);
}

const values = new Map((environment.values ?? []).map((entry) => [entry.key, entry]));
const inheritedVariables = new Map([
  ['policyReference', 'SYN-QA-PORTAL-POL-001'],
  ['vehicleReference', 'SYN-QA-PORTAL-VEH-001'],
  ['trackingCode', 'SYN-QA-PORTAL-TRACK-001'],
  ['expectedFromStatus', 'RECEIVED'],
  ['toStatus', 'UNDER_REVIEW'],
]);
for (const [key, value] of inheritedVariables) {
  if (!values.has(key)) {
    const entry = { key, value, type: 'default', enabled: true };
    environment.values.push(entry);
    values.set(key, entry);
  }
}

await Promise.all([
  writeFile(collectionPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8'),
  writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`, 'utf8'),
]);
console.log(`Preserved ${frozenHistoricalBodies.length} frozen R1 request bodies and their inherited variables inside the effective R3 Postman pack.`);
