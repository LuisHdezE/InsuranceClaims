import { readFile } from 'node:fs/promises';

const [collectionPath = 'postman/InsuranceClaims.postman_collection.json', environmentPath = 'postman/InsuranceClaims.local.postman_environment.json', inventoryPath = 'documentation/api/API_ENDPOINT_INVENTORY.json'] = process.argv.slice(2);

const [collection, environment, inventory] = await Promise.all([
  readFile(collectionPath, 'utf8').then(JSON.parse),
  readFile(environmentPath, 'utf8').then(JSON.parse),
  readFile(inventoryPath, 'utf8').then(JSON.parse),
]);

const failures = [];
const leaves = [];

function walk(items = []) {
  for (const item of items) {
    if (Array.isArray(item.item)) walk(item.item);
    else if (item.request) leaves.push(item);
  }
}
walk(collection.item);

const byName = new Map();
for (const item of leaves) {
  if (byName.has(item.name)) failures.push(`duplicate request name/operationId: ${item.name}`);
  byName.set(item.name, item);
}

const expectedIds = new Set(inventory.operations.map((op) => op.operationId));
const actualIds = new Set(leaves.map((item) => item.name));

function normalizePath(item) {
  const segments = item.request?.url?.path ?? [];
  return '/' + segments.map((segment) => String(segment).replace(/^\{\{([^}]+)\}\}$/, '{$1}')).join('/');
}

function headerMap(item) {
  return new Map((item.request?.header ?? []).filter((h) => !h.disabled).map((h) => [String(h.key).toLowerCase(), h]));
}

function hasBearer(item) {
  return item.request?.auth?.type === 'bearer' && item.request?.auth?.bearer?.some((entry) => entry.key === 'token' && entry.value === '{{bearerToken}}');
}

function hasTestCapture(item, variableName) {
  const scripts = (item.event ?? []).filter((event) => event.listen === 'test').flatMap((event) => event.script?.exec ?? []);
  return scripts.some((line) => String(line).includes(`pm.environment.set('${variableName}'`));
}

for (const expected of inventory.operations) {
  const item = byName.get(expected.operationId);
  if (!item) {
    failures.push(`missing request for operationId ${expected.operationId}`);
    continue;
  }

  const actualMethod = String(item.request?.method ?? '').toUpperCase();
  if (actualMethod !== expected.method) failures.push(`${expected.operationId}: method ${actualMethod} != ${expected.method}`);

  const actualPath = normalizePath(item);
  if (actualPath !== expected.path) failures.push(`${expected.operationId}: path ${actualPath} != ${expected.path}`);

  const headers = headerMap(item);
  if (expected.path.startsWith('/api/v1/') && !headers.has('x-request-id')) {
    failures.push(`${expected.operationId}: X-Request-Id header missing`);
  }

  for (const requiredHeader of expected.required_headers ?? []) {
    if (!headers.has(requiredHeader.toLowerCase())) failures.push(`${expected.operationId}: required header ${requiredHeader} missing`);
  }

  const needsBearer = expected.authentication === 'Bearer JWT';
  if (needsBearer !== hasBearer(item)) failures.push(`${expected.operationId}: bearer auth mismatch`);

  if (!needsBearer && item.request?.auth?.type !== 'noauth') {
    failures.push(`${expected.operationId}: public/operational request must use noauth`);
  }

  if (expected.request_content_type === 'application/json') {
    if (item.request?.body?.mode !== 'raw') failures.push(`${expected.operationId}: JSON body must use raw mode`);
    if (headers.get('content-type')?.value !== 'application/json') failures.push(`${expected.operationId}: application/json Content-Type missing`);
  }

  if (expected.request_content_type === 'multipart/form-data') {
    if (item.request?.body?.mode !== 'formdata') failures.push(`${expected.operationId}: multipart request must use formdata mode`);
    const keys = new Set((item.request?.body?.formdata ?? []).map((entry) => entry.key));
    for (const key of ['policyReference', 'vehicleReference', 'eventType', 'occurredAt', 'locationText', 'description', 'evidence']) {
      if (!keys.has(key)) failures.push(`${expected.operationId}: multipart field ${key} missing`);
    }
  }

  for (const queryName of expected.query ?? []) {
    const query = item.request?.url?.query ?? [];
    if (!query.some((entry) => entry.key === queryName)) failures.push(`${expected.operationId}: query variable ${queryName} missing`);
  }
}

for (const actualId of actualIds) {
  if (!expectedIds.has(actualId)) failures.push(`unexpected Postman request ${actualId}`);
}
if (actualIds.size !== expectedIds.size) failures.push(`Postman operation count ${actualIds.size} != inventory ${expectedIds.size}`);
if (actualIds.has('get_claim_status') || actualIds.has('MCP:get_claim_status')) failures.push('MCP tool must not be represented as a REST Postman request');

const create = byName.get('createClaim');
const idempotencyHeader = headerMap(create).get('idempotency-key');
if (idempotencyHeader?.value !== '{{idempotencyKey}}') failures.push('createClaim: Idempotency-Key must use {{idempotencyKey}}');
if (!hasTestCapture(create, 'trackingCode')) failures.push('createClaim: successful response must capture trackingCode');

const login = byName.get('authenticateOperator');
if (!hasTestCapture(login, 'bearerToken')) failures.push('authenticateOperator: successful response must capture bearerToken');
const list = byName.get('listClaims');
if (!hasTestCapture(list, 'claimId')) failures.push('listClaims: successful response must capture claimId when available');
const detail = byName.get('getClaimDetail');
if (!hasTestCapture(detail, 'evidenceId')) failures.push('getClaimDetail: successful response must capture evidenceId when available');

const env = new Map((environment.values ?? []).map((entry) => [entry.key, entry]));
const requiredVariables = [
  'baseUrl', 'policyReference', 'vehicleReference', 'trackingCode', 'operatorLogin', 'operatorPassword', 'bearerToken',
  'claimId', 'evidenceId', 'idempotencyKey', 'eventType', 'occurredAt', 'locationText', 'claimDescription',
  'page', 'pageSize', 'status', 'expectedFromStatus', 'toStatus'
];
for (const key of requiredVariables) {
  if (!env.has(key)) failures.push(`environment variable ${key} missing`);
}
if (env.get('baseUrl')?.value !== 'http://localhost:3000') failures.push('environment baseUrl must target documented local API');
for (const secretKey of ['operatorPassword', 'bearerToken']) {
  const entry = env.get(secretKey);
  if (entry?.value) failures.push(`${secretKey} must not contain a committed secret/token`);
  if (entry?.type !== 'secret') failures.push(`${secretKey} must be typed as secret`);
}
const idemValue = String(env.get('idempotencyKey')?.value ?? '');
if (idemValue.length < 16 || idemValue.length > 128) failures.push('idempotencyKey example must satisfy 16..128 character contract');

if (collection.info?.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') {
  failures.push('collection must declare Postman Collection v2.1 schema');
}
if (environment._postman_variable_scope !== 'environment') failures.push('environment scope metadata missing');

if (failures.length) {
  console.error('Postman contract validation FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Postman contract validation PASS');
console.log(`Validated ${actualIds.size} REST requests against contract revision ${inventory.contract_revision}.`);
console.log('Environment contains no committed operator password or bearer token.');
console.log('MCP:get_claim_status remains intentionally outside the REST Postman collection.');
