import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const positional = args.filter((arg) => arg !== '--check');
const [inventoryPath = 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json', openapiPath = 'openapi.yaml', collectionPath = 'postman/InsuranceClaims.postman_collection.json', environmentPath = 'postman/InsuranceClaims.local.postman_environment.json'] = positional;

const docs = new Map();
async function loadJson(path) {
  const absolute = resolve(path);
  if (!docs.has(absolute)) docs.set(absolute, JSON.parse(await readFile(absolute, 'utf8')));
  return docs.get(absolute);
}

function pointerGet(document, pointer) {
  if (!pointer || pointer === '#') return document;
  const raw = pointer.replace(/^#\/?/, '');
  if (!raw) return document;
  return raw.split('/').reduce((value, token) => value?.[token.replaceAll('~1', '/').replaceAll('~0', '~')], document);
}

async function dereference(value, currentFile, stack = new Set()) {
  if (Array.isArray(value)) return Promise.all(value.map((item) => dereference(item, currentFile, stack)));
  if (!value || typeof value !== 'object') return value;

  if (typeof value.$ref === 'string') {
    const [filePart, fragment = ''] = value.$ref.split('#', 2);
    assert.ok(!/^https?:/i.test(filePart), `Remote OpenAPI reference is not allowed: ${value.$ref}`);
    const targetFile = filePart ? resolve(dirname(currentFile), filePart) : currentFile;
    const cycleKey = `${targetFile}#${fragment}`;
    assert.ok(!stack.has(cycleKey), `Circular OpenAPI reference is not supported by the Postman generator: ${cycleKey}`);
    const nextStack = new Set(stack);
    nextStack.add(cycleKey);
    const targetDocument = await loadJson(targetFile);
    const target = pointerGet(targetDocument, fragment ? `#${fragment}` : '#');
    assert.notEqual(target, undefined, `OpenAPI reference not found: ${value.$ref}`);
    const resolved = await dereference(target, targetFile, nextStack);
    const siblings = Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref'));
    if (!Object.keys(siblings).length) return resolved;
    return { ...resolved, ...(await dereference(siblings, currentFile, stack)) };
  }

  return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await dereference(item, currentFile, stack)])));
}

const inventory = await loadJson(inventoryPath);
const openapi = await dereference(await loadJson(openapiPath), resolve(openapiPath));
assert.equal(inventory.contract_revision, 'api-v1-r3');
assert.equal(inventory.effective_operation_count, 90);
assert.equal(openapi.info?.['x-contract-revision'], 'api-v1-r3');
assert.equal(openapi.info?.['x-effective-operation-count'], 90);

const fields = inventory.operation_tuple_fields;
const operations = inventory.families.flatMap((family) => family.operations.map((tuple) => ({
  family: family.id,
  ...Object.fromEntries(fields.map((field, index) => [field, tuple[index]])),
})));
assert.equal(operations.length, 90);

const fixedDefaults = new Map(Object.entries({
  baseUrl: 'http://localhost:3000',
  operatorLogin: 'qa.operator@example.invalid',
  supervisorLogin: 'qa.supervisor@example.invalid',
  adminLogin: 'qa.admin@example.invalid',
  customerLogin: 'qa.customer@example.invalid',
  policyReference: 'SYN-QA-PORTAL-POL-001',
  vehicleReference: 'SYN-QA-PORTAL-VEH-001',
  trackingCode: 'SYN-QA-PORTAL-TRACK-001',
  eventType: 'Synthetic incident',
  occurredAt: '2026-09-09T12:00:00Z',
  locationText: 'Synthetic location',
  description: 'Synthetic request for local contract testing.',
  claimDescription: 'Synthetic claim created for local contract testing.',
  page: '1',
  pageSize: '25',
  expectedVersion: '1',
  expectedDefinitionVersion: '1',
  expectedFromStatus: 'RECEIVED',
  expectedStatus: 'OPEN',
  toStatus: 'UNDER_REVIEW',
  toStageKey: 'review',
  integrationEventId: 'SYN-R3-EVENT-001',
  integrationTimestamp: '',
  integrationSignature: '',
  integrationKey: '',
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
}));

const env = new Map();
function secretName(name) {
  return /(password|token|secret|signature)$/i.test(name);
}
function defaultValue(name, schema = {}) {
  if (fixedDefaults.has(name)) return fixedDefaults.get(name);
  if (/Id$/i.test(name)) return '';
  if (schema.default !== undefined) return String(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return String(schema.enum[0]);
  if (schema.type === 'integer' || schema.type === 'number') return String(schema.minimum ?? 1);
  if (schema.type === 'boolean') return 'true';
  if (schema.format === 'date-time') return '2026-09-09T12:00:00Z';
  if (schema.format === 'date') return '2026-09-09';
  return 'SYNTHETIC_VALUE';
}
function ensureVariable(name, schema = {}, forceSecret = false) {
  if (!name || name.startsWith('$')) return;
  if (!env.has(name)) env.set(name, {
    key: name,
    value: forceSecret || secretName(name) ? '' : defaultValue(name, schema),
    type: forceSecret || secretName(name) ? 'secret' : 'default',
    enabled: true,
  });
}

for (const [name, value] of [
  ['baseUrl', 'http://localhost:3000'],
  ['operatorLogin', 'qa.operator@example.invalid'],
  ['operatorPassword', ''],
  ['supervisorLogin', 'qa.supervisor@example.invalid'],
  ['supervisorPassword', ''],
  ['adminLogin', 'qa.admin@example.invalid'],
  ['adminPassword', ''],
  ['staffBearerToken', ''],
  ['customerLogin', 'qa.customer@example.invalid'],
  ['customerPassword', ''],
  ['customerBearerToken', ''],
  ['integrationKey', ''],
  ['integrationSecret', ''],
  ['integrationEventId', 'SYN-R3-EVENT-001'],
  ['integrationTimestamp', ''],
  ['integrationSignature', ''],
  ['idempotencyKey', '11111111-1111-4111-8111-111111111111'],
]) {
  env.set(name, { key: name, value, type: secretName(name) ? 'secret' : 'default', enabled: true });
}

function variableForField(name, schema = {}) {
  const aliases = {
    login: 'operatorLogin',
    password: 'operatorPassword',
    description: 'description',
  };
  const variable = aliases[name] ?? name;
  ensureVariable(variable, schema, variable === 'operatorPassword');
  return variable;
}

function renderPrimitive(schema, name) {
  const variable = variableForField(name, schema);
  if (schema.type === 'integer' || schema.type === 'number' || schema.type === 'boolean') return `{{${variable}}}`;
  return JSON.stringify(`{{${variable}}}`);
}

function renderJsonTemplate(schema = {}, name = 'value', level = 0) {
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    schema = { ...schema, type: schema.type.find((type) => type !== 'null') ?? 'string' };
  }
  if (schema.type === 'array') {
    const min = schema.minItems ?? 0;
    return min > 0 ? `[${renderJsonTemplate(schema.items ?? {}, `${name}Item`, level + 1)}]` : '[]';
  }
  if (schema.type === 'object' || schema.properties) {
    const properties = schema.properties ?? {};
    const required = new Set(schema.required ?? []);
    const keys = Object.keys(properties).filter((key) => required.has(key));
    if (!keys.length) return '{}';
    const indent = '  '.repeat(level + 1);
    const closeIndent = '  '.repeat(level);
    return `{\n${keys.map((key) => `${indent}${JSON.stringify(key)}: ${renderJsonTemplate(properties[key], key, level + 1)}`).join(',\n')}\n${closeIndent}}`;
  }
  return renderPrimitive(schema, name);
}

function pathVariables(path) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function authFor(authentication) {
  if (authentication === 'staff_jwt') {
    ensureVariable('staffBearerToken', {}, true);
    return { type: 'bearer', bearer: [{ key: 'token', value: '{{staffBearerToken}}', type: 'string' }] };
  }
  if (authentication === 'customer_jwt') {
    ensureVariable('customerBearerToken', {}, true);
    return { type: 'bearer', bearer: [{ key: 'token', value: '{{customerBearerToken}}', type: 'string' }] };
  }
  return { type: 'noauth' };
}

function headerVariable(name) {
  const map = {
    'idempotency-key': 'idempotencyKey',
    'x-integration-key': 'integrationKey',
    'x-event-id': 'integrationEventId',
    'x-event-timestamp': 'integrationTimestamp',
    'x-event-signature': 'integrationSignature',
  };
  const variable = map[name.toLowerCase()] ?? name.replace(/-([a-z])/gi, (_, letter) => letter.toUpperCase()).replace(/^x/, 'x');
  ensureVariable(variable, {}, /signature/i.test(variable));
  return variable;
}

function operationEvents(operationId, authentication) {
  const events = [];
  const capture = [];
  if (operationId === 'authenticateOperator') {
    capture.push("if (pm.response.code === 200) {", "  const body = pm.response.json();", "  if (body.accessToken) pm.environment.set('staffBearerToken', body.accessToken);", "}");
  }
  if (operationId === 'authenticateCustomer') {
    capture.push("if (pm.response.code === 200) {", "  const body = pm.response.json();", "  if (body.accessToken) pm.environment.set('customerBearerToken', body.accessToken);", "}");
  }
  if (operationId === 'createClaim') {
    ensureVariable('trackingCode');
    capture.push("if (pm.response.code === 201) {", "  const body = pm.response.json();", "  if (body.trackingCode) pm.environment.set('trackingCode', body.trackingCode);", "}");
  }
  if (operationId === 'listClaims') {
    ensureVariable('claimId');
    capture.push("if (pm.response.code === 200) {", "  const body = pm.response.json();", "  if (Array.isArray(body.items) && body.items[0]?.claimId) pm.environment.set('claimId', body.items[0].claimId);", "}");
  }
  if (operationId === 'getClaimDetail') {
    ensureVariable('evidenceId');
    capture.push("if (pm.response.code === 200) {", "  const body = pm.response.json();", "  if (Array.isArray(body.evidence) && body.evidence[0]?.evidenceId) pm.environment.set('evidenceId', body.evidence[0].evidenceId);", "}");
  }
  if (capture.length) events.push({ listen: 'test', script: { type: 'text/javascript', exec: capture } });

  if (authentication === 'hmac_sha256') {
    ensureVariable('integrationSecret', {}, true);
    const pre = [
      "const CryptoJS = pm.require('npm:crypto-js@4.2.0');",
      "const secret = pm.environment.get('integrationSecret');",
      "if (!secret) { console.warn('integrationSecret is empty; HMAC signature was not generated.'); return; }",
      "const timestamp = Math.floor(Date.now() / 1000).toString();",
      "const eventId = pm.variables.replaceIn('{{integrationEventId}}');",
      "const rawBody = pm.variables.replaceIn(pm.request.body?.raw ?? '{}');",
      "const bodyHash = CryptoJS.SHA256(rawBody).toString(CryptoJS.enc.Hex);",
      "const canonical = `${timestamp}\\n${eventId}\\n${bodyHash}`;",
      "const signature = CryptoJS.HmacSHA256(canonical, secret).toString(CryptoJS.enc.Hex);",
      "pm.environment.set('integrationTimestamp', timestamp);",
      "pm.environment.set('integrationSignature', signature);",
    ];
    events.unshift({ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } });
  }
  return events;
}

function requestDescription(op) {
  return [
    `operationId: ${op.operationId}`,
    `contract revision: ${inventory.contract_revision}`,
    `authentication: ${op.authentication}`,
    `permission: ${op.permission ?? 'none'}`,
    `request contract: ${op.request_schema ?? 'none'}`,
    `success contract: ${op.success_contract}`,
    `requirements: ${(op.requirements ?? []).join(', ') || 'none'}`,
    `use cases: ${(op.use_cases ?? []).join(', ') || 'none'}`,
    `audit: ${op.audit ?? 'not required'}`,
    `idempotency: ${op.idempotency ?? 'none'}`,
    `concurrency: ${op.concurrency ?? 'none'}`,
    '',
    'Synthetic/demo contract request. Where the frozen OpenAPI schema intentionally leaves business fields open, complete the request using the corresponding governed implementation documentation rather than inventing insurer data.',
  ].join('\n');
}

const folders = [];
for (const family of inventory.families) {
  const items = [];
  for (const tuple of family.operations) {
    const op = { family: family.id, ...Object.fromEntries(fields.map((field, index) => [field, tuple[index]])) };
    const pathItem = openapi.paths?.[op.path];
    const specOperation = pathItem?.[op.method.toLowerCase()];
    assert.ok(specOperation, `OpenAPI operation missing for ${op.method} ${op.path}`);
    assert.equal(specOperation.operationId, op.operationId, `${op.operationId}: OpenAPI operationId drift`);

    const headers = [];
    if (op.path.startsWith('/api/v1/')) headers.push({ key: 'X-Request-Id', value: '{{$guid}}', type: 'text' });
    const parameters = specOperation.parameters ?? [];
    for (const parameter of parameters.filter((entry) => entry.in === 'header')) {
      if (String(parameter.name).toLowerCase() === 'x-request-id') continue;
      const variable = headerVariable(parameter.name);
      headers.push({ key: parameter.name, value: `{{${variable}}}`, type: 'text', ...(parameter.required ? {} : { disabled: true }) });
    }

    const query = parameters.filter((entry) => entry.in === 'query').map((parameter) => {
      ensureVariable(parameter.name, parameter.schema ?? {});
      return { key: parameter.name, value: `{{${parameter.name}}}`, ...(parameter.required ? {} : { disabled: true }) };
    });

    for (const name of pathVariables(op.path)) ensureVariable(name);
    const requestPath = op.path.replaceAll(/\{([^}]+)\}/g, '{{$1}}');
    const url = {
      raw: `{{baseUrl}}${requestPath}`,
      host: ['{{baseUrl}}'],
      path: requestPath.split('/').filter(Boolean),
      ...(query.length ? { query } : {}),
    };

    let body;
    const content = specOperation.requestBody?.content ?? {};
    if (content['application/json']) {
      headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
      let schema = content['application/json'].schema ?? { type: 'object' };
      if (op.operationId === 'authenticateOperator') {
        ensureVariable('operatorLogin');
        ensureVariable('operatorPassword', {}, true);
        body = { mode: 'raw', raw: '{\n  "login": "{{operatorLogin}}",\n  "password": "{{operatorPassword}}"\n}', options: { raw: { language: 'json' } } };
      } else if (op.operationId === 'authenticateCustomer') {
        ensureVariable('customerLogin');
        ensureVariable('customerPassword', {}, true);
        body = { mode: 'raw', raw: '{\n  "login": "{{customerLogin}}",\n  "password": "{{customerPassword}}"\n}', options: { raw: { language: 'json' } } };
      } else {
        body = { mode: 'raw', raw: renderJsonTemplate(schema), options: { raw: { language: 'json' } } };
      }
    } else if (content['multipart/form-data']) {
      const schema = content['multipart/form-data'].schema ?? { type: 'object', properties: {} };
      const required = new Set(schema.required ?? []);
      const formdata = [];
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        const binary = property.format === 'binary' || (property.type === 'array' && property.items?.format === 'binary');
        if (binary) {
          formdata.push({ key: name, type: 'file', src: '', ...(required.has(name) || Object.keys(schema.properties ?? {}).length === 1 ? {} : { disabled: true }), description: property.description ?? (property.maxItems ? `Repeat for up to ${property.maxItems} files.` : 'Synthetic local file input.') });
        } else {
          ensureVariable(name, property);
          formdata.push({ key: name, value: `{{${name}}}`, type: 'text', ...(required.has(name) ? {} : { disabled: true }) });
        }
      }
      body = { mode: 'formdata', formdata };
    }

    const item = {
      name: op.operationId,
      ...(operationEvents(op.operationId, op.authentication).length ? { event: operationEvents(op.operationId, op.authentication) } : {}),
      request: {
        method: op.method,
        header: headers,
        ...(body ? { body } : {}),
        url,
        auth: authFor(op.authentication),
        description: requestDescription(op),
      },
    };
    items.push(item);
  }
  folders.push({ name: family.id, description: `api-v1-r3 operation family: ${family.id}`, item: items });
}

const collection = {
  info: {
    _postman_id: '6f25c1c6-2bed-4f66-82f5-31b08a7f3990',
    name: 'Insurance Claims Legacy Modernization MVP — R3',
    description: 'Unofficial technical case study. No affiliation with FAR Seguros. All data is synthetic/demo. Deterministic Postman contract pack for effective REST revision api-v1-r3: 90 operations across 16 frozen families. The historical MCP get_claim_status tool is intentionally outside this REST collection.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: folders,
};

const environment = {
  id: 'f302b6a1-d243-426c-9e33-35a5fc77eab1',
  name: 'InsuranceClaims Local R3',
  values: [...env.values()],
  _postman_variable_scope: 'environment',
  _postman_exported_at: '2026-09-09T00:00:00.000Z',
  _postman_exported_using: 'InsuranceClaims deterministic R3 Postman generator',
};

const collectionText = `${JSON.stringify(collection, null, 2)}\n`;
const environmentText = `${JSON.stringify(environment, null, 2)}\n`;

if (checkMode) {
  assert.equal(await readFile(collectionPath, 'utf8'), collectionText, `${collectionPath} is stale; run npm run postman:generate:r3`);
  assert.equal(await readFile(environmentPath, 'utf8'), environmentText, `${environmentPath} is stale; run npm run postman:generate:r3`);
  console.log('Postman R3 materialization check PASS: 90 operations / 16 families / zero drift.');
} else {
  await writeFile(collectionPath, collectionText, 'utf8');
  await writeFile(environmentPath, environmentText, 'utf8');
  console.log(`Materialized Postman R3 pack: ${operations.length} operations / ${inventory.families.length} families.`);
}
