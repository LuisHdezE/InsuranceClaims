import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [bundlePath = '.runtime/openapi.bundle.json', inventoryPath = 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json'] = process.argv.slice(2);
const [api, inventory] = await Promise.all([
  readFile(bundlePath, 'utf8').then(JSON.parse),
  readFile(inventoryPath, 'utf8').then(JSON.parse),
]);

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const failures = [];
const fail = (message) => failures.push(message);

const expected = inventory.families.flatMap((family) =>
  family.operations.map((tuple) => ({
    family: family.id,
    operationId: tuple[0],
    method: tuple[1],
    path: tuple[2],
    authentication: tuple[3],
    permission: tuple[4],
    requestSchema: tuple[5],
    successContract: tuple[6],
    requirements: tuple[7],
    useCases: tuple[8],
    audit: tuple[9],
    idempotency: tuple[10],
    concurrency: tuple[11],
  })),
);

const actual = [];
for (const [path, pathItem] of Object.entries(api.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!methods.has(method)) continue;
    actual.push({ path, method: method.toUpperCase(), operation });
  }
}

if (inventory.contract_revision !== 'api-v1-r3') fail('inventory revision is not api-v1-r3');
if (api.info?.version !== 'api-v1-r3') fail(`info.version ${api.info?.version ?? 'missing'} != api-v1-r3`);
if (api.info?.['x-contract-revision'] !== 'api-v1-r3') fail('info.x-contract-revision must be api-v1-r3');
if (api.info?.['x-blueprint-version'] !== '0.5.2') fail('info.x-blueprint-version must be 0.5.2');
if (api.info?.['x-effective-operation-count'] !== 90) fail('info.x-effective-operation-count must be 90');

const byId = new Map();
for (const entry of actual) {
  const id = entry.operation?.operationId;
  if (!id) {
    fail(`${entry.method} ${entry.path}: missing operationId`);
    continue;
  }
  if (byId.has(id)) fail(`duplicate operationId ${id}`);
  byId.set(id, entry);
}

if (expected.length !== 90) fail(`frozen inventory contains ${expected.length} operations instead of 90`);
if (actual.length !== 90) fail(`OpenAPI contains ${actual.length} operations instead of 90`);

const expectedIds = new Set(expected.map((item) => item.operationId));
for (const entry of actual) {
  if (!expectedIds.has(entry.operation?.operationId)) fail(`unexpected REST operationId ${entry.operation?.operationId ?? '<missing>'}`);
}

const securityKeys = (security) => {
  if (!Array.isArray(security) || security.length === 0) return [];
  return [...new Set(security.flatMap((entry) => Object.keys(entry ?? {})))].sort();
};

const expectedSecurity = (authentication) => {
  if (authentication === 'staff_jwt') return ['staffBearerAuth'];
  if (authentication === 'customer_jwt') return ['customerBearerAuth'];
  if (authentication === 'hmac_sha256') {
    return ['integrationEventId', 'integrationKey', 'integrationSignature', 'integrationTimestamp'].sort();
  }
  return [];
};

const findParameter = (operation, where, name) =>
  (operation.parameters ?? []).find((parameter) =>
    parameter?.in === where && String(parameter?.name ?? '').toLowerCase() === name.toLowerCase());

const requestContentType = (requestSchema) =>
  /\smultipart$/i.test(requestSchema ?? '') ? 'multipart/form-data' : 'application/json';

for (const item of expected) {
  const found = byId.get(item.operationId);
  if (!found) {
    fail(`missing operationId ${item.operationId}`);
    continue;
  }

  const operation = found.operation;
  if (found.path !== item.path) fail(`${item.operationId}: path ${found.path} != ${item.path}`);
  if (found.method !== item.method) fail(`${item.operationId}: method ${found.method} != ${item.method}`);

  const extensionChecks = [
    ['x-contract-revision', inventory.contract_revision],
    ['x-authentication-context', item.authentication],
    ['x-permission-intent', item.permission],
    ['x-durable-audit', item.audit ?? 'not_required'],
    ['x-idempotency', item.idempotency ?? 'none'],
    ['x-concurrency', item.concurrency ?? 'none'],
    ['x-request-contract', item.requestSchema],
    ['x-success-contract', item.successContract],
  ];
  for (const [key, value] of extensionChecks) {
    if (operation[key] !== value) fail(`${item.operationId}: ${key} mismatch`);
  }

  if (JSON.stringify(operation['x-requirements']) !== JSON.stringify(item.requirements)) {
    fail(`${item.operationId}: x-requirements mismatch`);
  }
  if (JSON.stringify(operation['x-use-cases']) !== JSON.stringify(item.useCases)) {
    fail(`${item.operationId}: x-use-cases mismatch`);
  }
  if (!item.path.startsWith('/health/') && typeof operation['x-rate-limit'] !== 'string') {
    fail(`${item.operationId}: x-rate-limit missing`);
  }

  const actualSecurity = securityKeys(operation.security);
  const wantedSecurity = expectedSecurity(item.authentication);
  if (JSON.stringify(actualSecurity) !== JSON.stringify(wantedSecurity)) {
    fail(`${item.operationId}: security context mismatch (${actualSecurity.join(',')} != ${wantedSecurity.join(',')})`);
  }

  if (item.path.startsWith('/api/v1/') && !findParameter(operation, 'header', inventory.request_id_header)) {
    fail(`${item.operationId}: X-Request-Id input contract missing`);
  }

  for (const match of item.path.matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    const parameter = findParameter(operation, 'path', match[1]);
    if (!parameter?.required) fail(`${item.operationId}: path parameter ${match[1]} missing or optional`);
  }

  if (String(item.idempotency ?? '').includes('Idempotency-Key')) {
    const parameter = findParameter(operation, 'header', 'Idempotency-Key');
    if (!parameter?.required) fail(`${item.operationId}: required Idempotency-Key missing`);
    if (parameter?.schema?.minLength !== 16 || parameter?.schema?.maxLength !== 128) {
      fail(`${item.operationId}: Idempotency-Key bounds must be 16..128`);
    }
  }

  if (item.authentication === 'hmac_sha256') {
    for (const name of inventory.auth_contract.integration.headers) {
      const parameter = findParameter(operation, 'header', name);
      if (!parameter?.required) fail(`${item.operationId}: required HMAC header ${name} missing`);
    }
  }

  if (item.requestSchema) {
    const content = operation.requestBody?.content ?? {};
    const expectedType = requestContentType(item.requestSchema);
    if (!content[expectedType]) fail(`${item.operationId}: missing request content type ${expectedType}`);
    const schema = content[expectedType]?.schema;
    if (!schema) fail(`${item.operationId}: missing request schema`);
  } else if (operation.requestBody) {
    fail(`${item.operationId}: unexpected requestBody for no-body operation`);
  }

  const [successStatus, successContract] = item.successContract.split(':', 2);
  const success = operation.responses?.[successStatus];
  if (!success) {
    fail(`${item.operationId}: missing success status ${successStatus}`);
  } else if (successContract === 'binary evidence') {
    for (const mediaType of ['image/jpeg', 'image/png', 'application/pdf']) {
      if (!success.content?.[mediaType]) fail(`${item.operationId}: missing binary response media ${mediaType}`);
    }
  } else if (!success.content?.['application/json']) {
    fail(`${item.operationId}: success response must expose application/json`);
  }

  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    const numeric = Number(status);
    if (Number.isFinite(numeric) && numeric >= 400 && !response?.content?.['application/problem+json']) {
      fail(`${item.operationId}: ${status} must use application/problem+json`);
    }
  }
}

const staff = api.components?.securitySchemes?.staffBearerAuth;
const customer = api.components?.securitySchemes?.customerBearerAuth;
if (staff?.type !== 'http' || staff?.scheme !== 'bearer') fail('staffBearerAuth must be HTTP bearer');
if (customer?.type !== 'http' || customer?.scheme !== 'bearer') fail('customerBearerAuth must be HTTP bearer');

for (const [schemeName, headerName] of [
  ['integrationKey', 'X-Integration-Key'],
  ['integrationEventId', 'X-Event-Id'],
  ['integrationTimestamp', 'X-Event-Timestamp'],
  ['integrationSignature', 'X-Event-Signature'],
]) {
  const scheme = api.components?.securitySchemes?.[schemeName];
  if (scheme?.type !== 'apiKey' || scheme?.in !== 'header' || scheme?.name !== headerName) {
    fail(`${schemeName} must be apiKey header ${headerName}`);
  }
}

const firstProblemSchema = actual
  .flatMap((entry) => Object.values(entry.operation?.responses ?? {}))
  .map((response) => response?.content?.['application/problem+json']?.schema)
  .find(Boolean);
for (const field of ['type', 'title', 'status', 'detail', 'code', 'requestId']) {
  if (!firstProblemSchema?.required?.includes(field)) fail(`ProblemDetails must require ${field}`);
}

const requestSchemaFor = (operationId) => {
  const operation = byId.get(operationId)?.operation;
  return operation?.requestBody?.content?.['application/json']?.schema
    ?? operation?.requestBody?.content?.['multipart/form-data']?.schema;
};

const bulk = requestSchemaFor('executeBulkOperation');
if (bulk?.properties?.items?.maxItems !== 100 || bulk?.properties?.items?.minItems !== 1) {
  fail('ExecuteBulkOperationRequest.items must be bounded to 1..100');
}

const move = requestSchemaFor('moveClaimOperationalStage');
for (const field of ['toStageKey', 'expectedVersion']) {
  if (!move?.required?.includes(field)) fail(`MoveOperationalStageRequest must require ${field}`);
}

const claim = requestSchemaFor('createClaim');
if (claim?.properties?.evidence?.maxItems !== 5 || claim?.properties?.evidence?.items?.format !== 'binary') {
  fail('CreateClaimRequest evidence must preserve max 5 binary files');
}

if (byId.has('get_claim_status') || byId.has('MCP:get_claim_status')) {
  fail('MCP get_claim_status must remain outside REST OpenAPI');
}

if (failures.length) {
  console.error('OpenAPI R3 contract validation FAILED');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('OpenAPI R3 contract validation PASS');
console.log(`Validated ${actual.length}/${inventory.effective_operation_count} REST operations against ${inventory.contract_revision}.`);
console.log('MCP:get_claim_status remains intentionally outside REST OpenAPI.');
