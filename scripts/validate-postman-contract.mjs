import { readFile } from 'node:fs/promises';

const [collectionPath = 'postman/InsuranceClaims.postman_collection.json', environmentPath = 'postman/InsuranceClaims.local.postman_environment.json', inventoryPath = 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json'] = process.argv.slice(2);

const [collection, environment, inventory] = await Promise.all([
  readFile(collectionPath, 'utf8').then(JSON.parse),
  readFile(environmentPath, 'utf8').then(JSON.parse),
  readFile(inventoryPath, 'utf8').then(JSON.parse),
]);

const failures = [];
const fail = (message) => failures.push(message);
const fields = inventory.operation_tuple_fields;
const expected = inventory.families.flatMap((family) => family.operations.map((tuple) => ({
  family: family.id,
  ...Object.fromEntries(fields.map((field, index) => [field, tuple[index]])),
})));

const folders = new Map();
const leaves = [];
for (const folder of collection.item ?? []) {
  if (!Array.isArray(folder.item)) continue;
  if (folders.has(folder.name)) fail(`duplicate folder ${folder.name}`);
  folders.set(folder.name, folder);
  for (const item of folder.item) {
    if (Array.isArray(item.item)) fail(`nested subfolder not allowed in frozen R3 family ${folder.name}`);
    else if (item.request) leaves.push({ family: folder.name, item });
  }
}

const byName = new Map();
for (const entry of leaves) {
  if (byName.has(entry.item.name)) fail(`duplicate request name/operationId: ${entry.item.name}`);
  byName.set(entry.item.name, entry);
}

function normalizePath(item) {
  const segments = item.request?.url?.path ?? [];
  return '/' + segments.map((segment) => String(segment).replace(/^\{\{([^}]+)\}\}$/, '{$1}')).join('/');
}

function activeHeaders(item) {
  return new Map((item.request?.header ?? []).filter((header) => !header.disabled).map((header) => [String(header.key).toLowerCase(), header]));
}

function bearerVariable(item) {
  if (item.request?.auth?.type !== 'bearer') return null;
  return item.request.auth.bearer?.find((entry) => entry.key === 'token')?.value ?? null;
}

function scripts(item, listen) {
  return (item.event ?? []).filter((event) => event.listen === listen).flatMap((event) => event.script?.exec ?? []).map(String);
}

function hasCapture(item, variable) {
  return scripts(item, 'test').some((line) => line.includes(`pm.environment.set('${variable}'`));
}

function hasHmacScript(item) {
  const text = scripts(item, 'prerequest').join('\n');
  return text.includes("pm.require('npm:crypto-js@4.2.0')")
    && text.includes("pm.environment.get('integrationSecret')")
    && text.includes("pm.environment.set('integrationTimestamp'")
    && text.includes("pm.environment.set('integrationSignature'")
    && text.includes('HmacSHA256');
}

function variableBackedJsonIsStructurallyValid(raw) {
  try {
    JSON.parse(String(raw ?? '').replace(/\{\{[^{}]+\}\}/g, '1'));
    return true;
  } catch {
    return false;
  }
}

if (inventory.contract_revision !== 'api-v1-r3') fail('inventory must be api-v1-r3');
if (inventory.effective_operation_count !== 90) fail('inventory effective operation count must be 90');
if (expected.length !== 90) fail(`inventory tuple count ${expected.length} != 90`);
if (inventory.families.length !== 16) fail(`inventory family count ${inventory.families.length} != 16`);

if (collection.info?.schema !== 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json') fail('collection must declare Postman Collection v2.1 schema');
if (!String(collection.info?.description ?? '').includes('api-v1-r3')) fail('collection description must identify api-v1-r3');
if (!String(collection.info?.description ?? '').includes('90 operations')) fail('collection description must declare the 90-operation frozen surface');
if (folders.size !== inventory.families.length) fail(`collection family count ${folders.size} != inventory ${inventory.families.length}`);
for (const family of inventory.families) {
  if (!folders.has(family.id)) fail(`missing Postman folder for family ${family.id}`);
}

const expectedIds = new Set(expected.map((operation) => operation.operationId));
const actualIds = new Set(leaves.map((entry) => entry.item.name));
if (actualIds.size !== expectedIds.size) fail(`Postman operation count ${actualIds.size} != inventory ${expectedIds.size}`);
for (const actualId of actualIds) if (!expectedIds.has(actualId)) fail(`unexpected Postman request ${actualId}`);
if (actualIds.has('get_claim_status') || actualIds.has('MCP:get_claim_status')) fail('MCP tool must not be represented as a REST Postman request');

for (const operation of expected) {
  const entry = byName.get(operation.operationId);
  if (!entry) {
    fail(`missing request for operationId ${operation.operationId}`);
    continue;
  }
  const item = entry.item;
  if (entry.family !== operation.family) fail(`${operation.operationId}: folder ${entry.family} != ${operation.family}`);
  const method = String(item.request?.method ?? '').toUpperCase();
  if (method !== operation.method) fail(`${operation.operationId}: method ${method} != ${operation.method}`);
  const path = normalizePath(item);
  if (path !== operation.path) fail(`${operation.operationId}: path ${path} != ${operation.path}`);

  const headers = activeHeaders(item);
  if (operation.path.startsWith('/api/v1/') && headers.get('x-request-id')?.value !== '{{$guid}}') {
    fail(`${operation.operationId}: X-Request-Id must use {{$guid}}`);
  }

  const idempotencyRequired = String(operation.idempotency ?? '').includes('Idempotency-Key');
  const idempotency = headers.get('idempotency-key');
  if (idempotencyRequired && idempotency?.value !== '{{idempotencyKey}}') fail(`${operation.operationId}: required Idempotency-Key missing or not variable-backed`);
  if (!idempotencyRequired && idempotency && operation.operationId !== 'createClaim') fail(`${operation.operationId}: unexpected active Idempotency-Key`);

  if (operation.authentication === 'staff_jwt') {
    if (bearerVariable(item) !== '{{staffBearerToken}}') fail(`${operation.operationId}: staff bearer auth mismatch`);
  } else if (operation.authentication === 'customer_jwt') {
    if (bearerVariable(item) !== '{{customerBearerToken}}') fail(`${operation.operationId}: customer bearer auth mismatch`);
  } else if (operation.authentication === 'hmac_sha256') {
    if (item.request?.auth?.type !== 'noauth') fail(`${operation.operationId}: HMAC request must not use bearer auth`);
    const expectedHeaders = new Map([
      ['x-integration-key', '{{integrationKey}}'],
      ['x-event-id', '{{integrationEventId}}'],
      ['x-event-timestamp', '{{integrationTimestamp}}'],
      ['x-event-signature', '{{integrationSignature}}'],
    ]);
    for (const [name, value] of expectedHeaders) if (headers.get(name)?.value !== value) fail(`${operation.operationId}: HMAC header ${name} missing or mismatched`);
    if (!hasHmacScript(item)) fail(`${operation.operationId}: deterministic HMAC prerequest script missing`);
  } else if (item.request?.auth?.type !== 'noauth') {
    fail(`${operation.operationId}: anonymous/credential request must use noauth transport auth`);
  }

  if (operation.request_schema) {
    const multipart = /\smultipart$/i.test(operation.request_schema);
    if (multipart) {
      if (item.request?.body?.mode !== 'formdata') fail(`${operation.operationId}: multipart request must use formdata mode`);
    } else {
      if (item.request?.body?.mode !== 'raw') fail(`${operation.operationId}: JSON request must use raw mode`);
      if (headers.get('content-type')?.value !== 'application/json') fail(`${operation.operationId}: JSON Content-Type missing`);
      if (!variableBackedJsonIsStructurallyValid(item.request?.body?.raw)) fail(`${operation.operationId}: variable-backed raw JSON template is structurally invalid`);
    }
  } else if (item.request?.body) {
    fail(`${operation.operationId}: no-body operation unexpectedly contains request body`);
  }

  const description = String(item.request?.description ?? '');
  for (const expectedText of [
    `operationId: ${operation.operationId}`,
    `contract revision: ${inventory.contract_revision}`,
    `authentication: ${operation.authentication}`,
    `success contract: ${operation.success_contract}`,
  ]) {
    if (!description.includes(expectedText)) fail(`${operation.operationId}: description missing ${expectedText}`);
  }
}

if (!hasCapture(byName.get('authenticateOperator')?.item ?? {}, 'staffBearerToken')) fail('authenticateOperator must capture staffBearerToken');
if (!hasCapture(byName.get('authenticateCustomer')?.item ?? {}, 'customerBearerToken')) fail('authenticateCustomer must capture customerBearerToken');
if (!hasCapture(byName.get('createClaim')?.item ?? {}, 'trackingCode')) fail('createClaim must capture trackingCode');
if (!hasCapture(byName.get('listClaims')?.item ?? {}, 'claimId')) fail('listClaims must capture claimId when available');
if (!hasCapture(byName.get('getClaimDetail')?.item ?? {}, 'evidenceId')) fail('getClaimDetail must capture evidenceId when available');

const env = new Map((environment.values ?? []).map((entry) => [entry.key, entry]));
if (environment._postman_variable_scope !== 'environment') fail('environment scope metadata missing');
if (env.get('baseUrl')?.value !== 'http://localhost:3000') fail('environment baseUrl must target local synthetic API');

const serializedCollection = JSON.stringify(collection);
const references = new Set([...serializedCollection.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1]).filter((name) => !name.startsWith('$')));
for (const variable of references) if (!env.has(variable)) fail(`environment variable ${variable} referenced by collection but missing`);

for (const secretKey of ['operatorPassword', 'supervisorPassword', 'adminPassword', 'staffBearerToken', 'customerPassword', 'customerBearerToken', 'integrationSecret', 'integrationSignature']) {
  const entry = env.get(secretKey);
  if (!entry) fail(`secret environment variable ${secretKey} missing`);
  else {
    if (entry.value) fail(`${secretKey} must not contain a committed secret/token/signature`);
    if (entry.type !== 'secret') fail(`${secretKey} must be typed as secret`);
  }
}

const idemValue = String(env.get('idempotencyKey')?.value ?? '');
if (idemValue.length < 16 || idemValue.length > 128) fail('idempotencyKey example must satisfy 16..128 character contract');
for (const loginKey of ['operatorLogin', 'supervisorLogin', 'adminLogin', 'customerLogin']) {
  const value = String(env.get(loginKey)?.value ?? '');
  if (!value.endsWith('.invalid')) fail(`${loginKey} must remain synthetic .invalid data`);
}

if (failures.length) {
  console.error('Postman R3 contract validation FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Postman R3 contract validation PASS');
console.log(`Validated ${actualIds.size}/${inventory.effective_operation_count} REST requests across ${folders.size}/${inventory.families.length} frozen families.`);
console.log('Staff/customer JWT contexts and HMAC integration context remain separated.');
console.log('Environment contains no committed passwords, bearer tokens, integration secret or HMAC signature.');
console.log('MCP:get_claim_status remains intentionally outside the REST Postman collection.');
