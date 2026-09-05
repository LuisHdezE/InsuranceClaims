import { readFile } from 'node:fs/promises';

const [bundlePath = '.runtime/openapi.bundle.json', inventoryPath = 'documentation/api/API_ENDPOINT_INVENTORY.json'] = process.argv.slice(2);
const [api, inventory] = await Promise.all([
  readFile(bundlePath, 'utf8').then(JSON.parse),
  readFile(inventoryPath, 'utf8').then(JSON.parse),
]);

const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
const operations = [];
const failures = [];

for (const [path, pathItem] of Object.entries(api.paths ?? {})) {
  for (const [method, operation] of Object.entries(pathItem ?? {})) {
    if (!httpMethods.has(method)) continue;
    operations.push({ path, method: method.toUpperCase(), operation });
  }
}

const byId = new Map();
for (const entry of operations) {
  const id = entry.operation?.operationId;
  if (!id) {
    failures.push(`${entry.method} ${entry.path}: missing operationId`);
    continue;
  }
  if (byId.has(id)) failures.push(`duplicate operationId: ${id}`);
  byId.set(id, entry);
}

const expectedIds = new Set(inventory.operations.map((item) => item.operationId));
const actualIds = new Set(operations.map((item) => item.operation?.operationId).filter(Boolean));

for (const expected of inventory.operations) {
  const actual = byId.get(expected.operationId);
  if (!actual) {
    failures.push(`missing operationId ${expected.operationId}`);
    continue;
  }
  if (actual.path !== expected.path) failures.push(`${expected.operationId}: path ${actual.path} != ${expected.path}`);
  if (actual.method !== expected.method) failures.push(`${expected.operationId}: method ${actual.method} != ${expected.method}`);

  if (expected.permission !== undefined) {
    const permission = actual.operation['x-permission-intent'] ?? null;
    if (permission !== expected.permission) failures.push(`${expected.operationId}: x-permission-intent mismatch`);
  }
  if (expected.rate_limit && actual.operation['x-rate-limit'] !== expected.rate_limit) {
    failures.push(`${expected.operationId}: x-rate-limit mismatch`);
  }
  if (expected.durable_audit && actual.operation['x-durable-audit'] !== expected.durable_audit) {
    failures.push(`${expected.operationId}: x-durable-audit mismatch`);
  }

  const responses = actual.operation.responses ?? {};
  if (!responses[String(expected.success_status)]) {
    failures.push(`${expected.operationId}: missing success status ${expected.success_status}`);
  }

  if (expected.request_content_type) {
    const content = actual.operation.requestBody?.content ?? {};
    if (!content[expected.request_content_type]) {
      failures.push(`${expected.operationId}: missing request content type ${expected.request_content_type}`);
    }
  }

  const params = actual.operation.parameters ?? [];

  for (const name of expected.required_headers ?? []) {
    const parameter = params.find((p) => p?.in === 'header' && p?.name?.toLowerCase() === name.toLowerCase());
    if (!parameter?.required) failures.push(`${expected.operationId}: required header ${name} missing or optional`);
  }
  for (const name of expected.query ?? []) {
    const parameter = params.find((p) => p?.in === 'query' && p?.name === name);
    if (!parameter) failures.push(`${expected.operationId}: query parameter ${name} missing`);
  }
  for (const name of expected.path_params ?? []) {
    const parameter = params.find((p) => p?.in === 'path' && p?.name === name);
    if (!parameter?.required) failures.push(`${expected.operationId}: path parameter ${name} missing or optional`);
  }

  if (expected.path.startsWith('/api/v1/')) {
    const requestId = params.find((p) => p?.in === 'header' && p?.name?.toLowerCase() === 'x-request-id');
    if (!requestId) failures.push(`${expected.operationId}: X-Request-Id input contract missing`);

    for (const [status, response] of Object.entries(responses)) {
      const numeric = Number(status);
      if (Number.isFinite(numeric) && numeric >= 400) {
        if (!response?.content?.['application/problem+json']) {
          failures.push(`${expected.operationId}: ${status} does not use application/problem+json`);
        }
      }
    }
  }

  const needsBearer = expected.authentication === 'Bearer JWT';
  const hasBearer = Array.isArray(actual.operation.security) &&
    actual.operation.security.some((item) => Object.prototype.hasOwnProperty.call(item, 'bearerAuth'));
  if (needsBearer !== hasBearer) failures.push(`${expected.operationId}: bearer security mismatch`);
}

for (const id of actualIds) {
  if (!expectedIds.has(id)) failures.push(`unexpected REST operationId ${id}`);
}
if (actualIds.size !== expectedIds.size) {
  failures.push(`REST operation count ${actualIds.size} != inventory ${expectedIds.size}`);
}
if (actualIds.has('MCP:get_claim_status') || actualIds.has('get_claim_status')) {
  failures.push('MCP tool was incorrectly exposed as a REST operationId');
}

const create = byId.get('createClaim')?.operation;
const idem = create?.parameters?.find((p) => p?.in === 'header' && p?.name === 'Idempotency-Key');
if (idem?.schema?.minLength !== 16 || idem?.schema?.maxLength !== 128) {
  failures.push('createClaim: Idempotency-Key bounds must be 16..128');
}
const evidence = create?.requestBody?.content?.['multipart/form-data']?.schema?.properties?.evidence;
if (evidence?.maxItems !== 5 || evidence?.items?.format !== 'binary') {
  failures.push('createClaim: evidence contract must be max 5 binary files');
}

const evidenceDownload = byId.get('downloadClaimEvidence')?.operation?.responses?.['200']?.content ?? {};
for (const mediaType of ['image/jpeg', 'image/png', 'application/pdf']) {
  if (!evidenceDownload[mediaType]) failures.push(`downloadClaimEvidence: missing ${mediaType} response`);
}

const bearer = api.components?.securitySchemes?.bearerAuth;
if (bearer?.type !== 'http' || bearer?.scheme !== 'bearer') {
  failures.push('components.securitySchemes.bearerAuth must be HTTP bearer');
}

if (failures.length) {
  console.error('OpenAPI contract validation FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('OpenAPI contract validation PASS');
console.log(`Validated ${actualIds.size} REST operations against contract revision ${inventory.contract_revision}.`);
console.log('MCP:get_claim_status remains intentionally outside REST OpenAPI.');
