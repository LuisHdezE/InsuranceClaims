import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const inventoryPath = 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json';
const outputPath = 'openapi.yaml';
const checkMode = process.argv.includes('--check');

const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
const operations = inventory.families.flatMap((family) =>
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

assert.equal(inventory.contract_revision, 'api-v1-r3');
assert.equal(operations.length, inventory.effective_operation_count);
assert.equal(new Set(operations.map((operation) => operation.operationId)).size, operations.length);

const splitWords = (value) =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

const summaryFor = (operationId) => {
  const words = splitWords(operationId);
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

const schemaName = (contractName) => {
  if (!contractName) return null;
  return contractName.replace(/\s+multipart$/i, '').replace(/\[\]$/, '').trim();
};

const isArrayContract = (contractName) => /\[\]$/.test(contractName ?? '');

const contentTypeForRequest = (contractName) =>
  /\smultipart$/i.test(contractName ?? '') ? 'multipart/form-data' : 'application/json';

const rateLimitFor = (operation) => {
  const { operationId, method, path, authentication } = operation;
  if (path.startsWith('/health/')) return 'not_rate_limited';
  if (operationId === 'verifyPolicyVehicle' || operationId === 'trackClaim') return '20/min/IP';
  if (operationId === 'createClaim') return '5/min/IP';
  if (operationId === 'authenticateOperator' || operationId === 'authenticateCustomer') {
    return '5/min/IP + 10/15m/normalized login';
  }
  if (operationId === 'uploadPortalClaimEvidence') return '10/min/customer';
  if (operationId === 'ingestIntegrationEvent') return '120/min/integration key';
  if (operationId === 'createImportJob') return '5/min/admin';
  if (path.startsWith('/api/v1/admin/import-jobs') && method !== 'GET') return '30/min/admin';
  if (operationId === 'executeBulkOperation') return '10/min/supervisor';
  if (path.startsWith('/api/v1/admin/dead-letters') && method !== 'GET') return '20/min/admin';
  if (path.startsWith('/api/v1/admin/') && method !== 'GET') return '30/min/admin';
  if (authentication === 'customer_jwt') return method === 'GET' ? '120/min/customer' : '60/min/customer';
  if (authentication === 'staff_jwt') return method === 'GET' ? '120/min/principal' : '60/min/principal';
  return '60/min/principal';
};

const securityFor = (authentication) => {
  if (authentication === 'staff_jwt') return [{ staffBearerAuth: [] }];
  if (authentication === 'customer_jwt') return [{ customerBearerAuth: [] }];
  if (authentication === 'hmac_sha256') {
    return [{
      integrationKey: [],
      integrationEventId: [],
      integrationTimestamp: [],
      integrationSignature: [],
    }];
  }
  return [];
};

const requestIdParameter = { $ref: '#/components/parameters/RequestId' };
const idempotencyParameter = { $ref: '#/components/parameters/IdempotencyKey' };
const hmacParameters = [
  { $ref: '#/components/parameters/IntegrationKey' },
  { $ref: '#/components/parameters/IntegrationEventId' },
  { $ref: '#/components/parameters/IntegrationTimestamp' },
  { $ref: '#/components/parameters/IntegrationSignature' },
];
const pageParameters = [
  { $ref: '#/components/parameters/Page' },
  { $ref: '#/components/parameters/PageSize' },
];

const listClaimsExtra = [
  { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'stage', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 80 } },
  { name: 'search', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 120 } },
  { name: 'sort', in: 'query', required: false, schema: { type: 'string' } },
];

const listTasksExtra = [
  { name: 'status', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'assigneeId', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'queueKey', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'priority', in: 'query', required: false, schema: { type: 'string' } },
  { name: 'overdue', in: 'query', required: false, schema: { type: 'boolean' } },
];

const pathParametersFor = (path) =>
  [...path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 120 },
  }));

const errorResponseRef = (name) => ({ $ref: `#/components/responses/${name}` });

const responseSchemaFor = (successContract) => {
  const [, rawContract] = successContract.split(':', 2);
  if (rawContract === 'binary evidence') return null;
  const name = schemaName(rawContract);
  if (isArrayContract(rawContract)) {
    return { type: 'array', items: { $ref: `#/components/schemas/${name}` } };
  }
  return { $ref: `#/components/schemas/${name}` };
};

const responsesFor = (operation) => {
  const [status] = operation.successContract.split(':', 1);
  const rawContract = operation.successContract.slice(status.length + 1);
  const success = {
    description: `Success contract: ${rawContract}.`,
    headers: operation.path.startsWith('/api/v1/')
      ? {
          'X-Request-Id': { $ref: '#/components/headers/XRequestId' },
          ...(String(operation.idempotency ?? '').includes('Idempotency-Key')
            ? { 'Idempotency-Replayed': { $ref: '#/components/headers/IdempotencyReplayed' } }
            : {}),
        }
      : undefined,
  };

  if (rawContract === 'binary evidence') {
    success.content = Object.fromEntries(
      ['image/jpeg', 'image/png', 'application/pdf'].map((mediaType) => [
        mediaType,
        { schema: { type: 'string', format: 'binary' } },
      ]),
    );
  } else {
    success.content = {
      'application/json': { schema: responseSchemaFor(operation.successContract) },
    };
  }

  const responses = { [status]: success };
  if (!operation.path.startsWith('/api/v1/')) return responses;

  if (operation.requestSchema || operation.method === 'GET') {
    responses['400'] = errorResponseRef('BadRequest');
  }
  if (!['anonymous', 'anonymous_credentials'].includes(operation.authentication)) {
    responses['401'] = errorResponseRef('Unauthorized');
  }
  if (operation.permission && ['staff_jwt', 'customer_jwt'].includes(operation.authentication)) {
    responses['403'] = errorResponseRef('Forbidden');
  }
  if (operation.path.includes('{')) responses['404'] = errorResponseRef('NotFound');
  if (
    String(operation.idempotency ?? '').includes('Idempotency-Key') ||
    (operation.concurrency && !['none', 'n/a'].includes(operation.concurrency))
  ) {
    responses['409'] = errorResponseRef('Conflict');
  }
  if (operation.requestSchema) responses['422'] = errorResponseRef('UnprocessableEntity');
  responses['429'] = errorResponseRef('TooManyRequests');
  return responses;
};

const buildGenericSchema = (name) => ({
  type: 'object',
  description: `Named contract projection ${name}. Field-level semantics remain governed by api-v1-r3 canonical contract and implementation tests; this schema does not invent insurer data.`,
  additionalProperties: true,
});

const specialRequestSchemas = {
  MoveOperationalStageRequest: {
    type: 'object',
    required: ['toStageKey', 'expectedVersion'],
    additionalProperties: false,
    properties: {
      toStageKey: { type: 'string', minLength: 1, maxLength: 80 },
      expectedVersion: { type: 'integer', minimum: 1 },
    },
  },
  OperatorLoginRequest: {
    type: 'object',
    required: ['login', 'password'],
    additionalProperties: false,
    properties: {
      login: { type: 'string', minLength: 1, maxLength: 160 },
      password: { type: 'string', minLength: 1, maxLength: 256, writeOnly: true },
    },
  },
  CustomerLoginRequest: {
    type: 'object',
    required: ['login', 'password'],
    additionalProperties: false,
    properties: {
      login: { type: 'string', minLength: 1, maxLength: 160 },
      password: { type: 'string', minLength: 1, maxLength: 256, writeOnly: true },
    },
  },
  InboundIntegrationEventRequest: {
    type: 'object',
    required: ['eventType', 'payload'],
    additionalProperties: false,
    properties: {
      eventType: { type: 'string', minLength: 1, maxLength: 120 },
      payload: {
        type: 'object',
        description: 'Schema-governed synthetic event-family payload.',
        additionalProperties: true,
      },
    },
  },
  ExecuteBulkOperationRequest: {
    type: 'object',
    required: ['actionType', 'action', 'items'],
    additionalProperties: false,
    properties: {
      actionType: { type: 'string', description: 'Server allowlisted bulk action type.' },
      action: { type: 'object', additionalProperties: true },
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          description: 'Per-item target and action-specific concurrency guard.',
          additionalProperties: true,
        },
      },
    },
  },
  CreateClaimRequest: {
    type: 'object',
    required: ['policyReference', 'vehicleReference', 'eventType', 'occurredAt', 'locationText', 'description'],
    additionalProperties: false,
    properties: {
      policyReference: { type: 'string', minLength: 1, maxLength: 80 },
      vehicleReference: { type: 'string', minLength: 1, maxLength: 80 },
      eventType: { type: 'string', minLength: 1, maxLength: 60 },
      occurredAt: { type: 'string', format: 'date-time' },
      locationText: { type: 'string', minLength: 1, maxLength: 300 },
      description: { type: 'string', minLength: 1, maxLength: 4000 },
      evidence: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', format: 'binary' },
      },
    },
  },
  PortalEvidenceUploadRequest: {
    type: 'object',
    additionalProperties: true,
    properties: {
      evidence: {
        type: 'array',
        maxItems: 5,
        items: { type: 'string', format: 'binary' },
      },
    },
  },
  CreateImportJobRequest: {
    type: 'object',
    additionalProperties: true,
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: 'CSV or XLSX source file. Technical portfolio maximum is 10 MiB.',
      },
    },
  },
};

const addConcurrencyShape = (schema, concurrency) => {
  if (!concurrency || ['none', 'n/a'].includes(concurrency)) return schema;
  const copy = structuredClone(schema);
  copy.properties ??= {};
  copy.required ??= [];
  const guards = [];
  if (concurrency.includes('expectedDefinitionVersion')) guards.push(['expectedDefinitionVersion', { type: 'integer', minimum: 1 }]);
  if (concurrency.includes('expectedFromStatus')) guards.push(['expectedFromStatus', { type: 'string' }]);
  if (concurrency.includes('expectedStatus')) guards.push(['expectedStatus', { type: 'string' }]);
  if (concurrency.includes('expectedVersion') && !concurrency.includes('per-item')) guards.push(['expectedVersion', { type: 'integer', minimum: 1 }]);
  for (const [name, definition] of guards) {
    copy.properties[name] ??= definition;
    if (!copy.required.includes(name)) copy.required.push(name);
  }
  if (copy.required.length === 0) delete copy.required;
  return copy;
};

const schemaNames = new Set();
for (const operation of operations) {
  if (operation.requestSchema) schemaNames.add(schemaName(operation.requestSchema));
  const [, rawSuccess] = operation.successContract.split(':', 2);
  if (rawSuccess !== 'binary evidence') schemaNames.add(schemaName(rawSuccess));
}

const schemas = {
  ProblemDetails: {
    type: 'object',
    required: ['type', 'title', 'status', 'detail', 'code', 'requestId'],
    additionalProperties: true,
    properties: {
      type: { type: 'string', format: 'uri-reference' },
      title: { type: 'string' },
      status: { type: 'integer', minimum: 400, maximum: 599 },
      detail: { type: 'string' },
      instance: { type: 'string' },
      code: { type: 'string' },
      requestId: { type: 'string' },
      errors: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

for (const name of [...schemaNames].filter(Boolean).sort()) {
  schemas[name] = specialRequestSchemas[name] ?? buildGenericSchema(name);
}

for (const operation of operations) {
  if (!operation.requestSchema) continue;
  const name = schemaName(operation.requestSchema);
  schemas[name] = addConcurrencyShape(schemas[name], operation.concurrency);
}

const paths = {};
for (const operation of operations) {
  const parameters = [];
  if (operation.path.startsWith('/api/v1/')) parameters.push(structuredClone(requestIdParameter));
  parameters.push(...pathParametersFor(operation.path));

  if (String(operation.idempotency ?? '').includes('Idempotency-Key')) {
    parameters.push(structuredClone(idempotencyParameter));
  }
  if (operation.authentication === 'hmac_sha256') parameters.push(...structuredClone(hmacParameters));

  const responseName = operation.successContract.split(':', 2)[1];
  if (responseName?.includes('PageResponse')) parameters.push(...structuredClone(pageParameters));
  if (operation.operationId === 'listClaims') parameters.push(...structuredClone(listClaimsExtra));
  if (operation.operationId === 'listTasks') parameters.push(...structuredClone(listTasksExtra));

  const op = {
    operationId: operation.operationId,
    summary: summaryFor(operation.operationId),
    tags: [operation.family],
    parameters,
    security: securityFor(operation.authentication),
    'x-contract-revision': inventory.contract_revision,
    'x-authentication-context': operation.authentication,
    'x-permission-intent': operation.permission,
    'x-rate-limit': rateLimitFor(operation),
    'x-durable-audit': operation.audit ?? 'not_required',
    'x-idempotency': operation.idempotency ?? 'none',
    'x-concurrency': operation.concurrency ?? 'none',
    'x-requirements': operation.requirements,
    'x-use-cases': operation.useCases,
    'x-request-contract': operation.requestSchema,
    'x-success-contract': operation.successContract,
    responses: responsesFor(operation),
  };

  if (operation.requestSchema) {
    op.requestBody = {
      required: true,
      content: {
        [contentTypeForRequest(operation.requestSchema)]: {
          schema: { $ref: `#/components/schemas/${schemaName(operation.requestSchema)}` },
        },
      },
    };
  }

  paths[operation.path] ??= {};
  paths[operation.path][operation.method.toLowerCase()] = op;
}

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Insurance Claims Legacy Modernization MVP API',
    version: inventory.contract_revision,
    description:
      'Effective R3 REST contract for the Insurance Claims Legacy Modernization MVP. Unofficial technical case study with synthetic/demo data only and no affiliation with FAR Seguros. The historical MCP get_claim_status tool remains outside REST OpenAPI counting.',
    'x-blueprint-version': inventory.blueprint_version,
    'x-contract-revision': inventory.contract_revision,
    'x-effective-operation-count': inventory.effective_operation_count,
    'x-delivery-mode': 'GREENFIELD',
    'x-legacy-coexistence': inventory.legacy_coexistence,
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local synthetic/demo API' }],
  tags: inventory.families.map((family) => ({
    name: family.id,
    description: `R3 operation family ${family.id}.`,
  })),
  paths,
  components: {
    parameters: {
      RequestId: {
        name: 'X-Request-Id',
        in: 'header',
        required: false,
        description: 'Optional caller correlation identifier.',
        schema: { type: 'string', minLength: 1, maxLength: 128 },
      },
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        description: 'Opaque idempotency key with replay/conflict semantics.',
        schema: { type: 'string', minLength: 16, maxLength: 128 },
      },
      IntegrationKey: { name: 'X-Integration-Key', in: 'header', required: true, schema: { type: 'string' } },
      IntegrationEventId: { name: 'X-Event-Id', in: 'header', required: true, schema: { type: 'string' } },
      IntegrationTimestamp: { name: 'X-Event-Timestamp', in: 'header', required: true, schema: { type: 'string' } },
      IntegrationSignature: { name: 'X-Event-Signature', in: 'header', required: true, schema: { type: 'string' } },
      Page: { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: inventory.pagination.default_page } },
      PageSize: { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: inventory.pagination.max_page_size, default: inventory.pagination.default_page_size } },
    },
    responses: Object.fromEntries([
      ['BadRequest', 'Malformed request or query parameters.'],
      ['Unauthorized', 'Authentication failed or authentication context mismatched.'],
      ['Forbidden', 'Authenticated principal lacks the required permission.'],
      ['NotFound', 'Resource not found or safely undisclosed.'],
      ['Conflict', 'Idempotency, lifecycle or optimistic concurrency conflict.'],
      ['UnprocessableEntity', 'Semantically invalid request.'],
      ['TooManyRequests', 'Rate limit exceeded.'],
    ].map(([name, description]) => [name, {
      description,
      headers: {
        'X-Request-Id': { $ref: '#/components/headers/XRequestId' },
        ...(name === 'TooManyRequests' ? { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } } : {}),
      },
      content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/ProblemDetails' } } },
    }])),
    securitySchemes: {
      staffBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Staff JWT context; target lifetime 900 seconds.',
      },
      customerBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Customer JWT context; target lifetime 1800 seconds and distinct issuer/audience from staff.',
      },
      integrationKey: { type: 'apiKey', in: 'header', name: 'X-Integration-Key' },
      integrationEventId: { type: 'apiKey', in: 'header', name: 'X-Event-Id' },
      integrationTimestamp: { type: 'apiKey', in: 'header', name: 'X-Event-Timestamp' },
      integrationSignature: { type: 'apiKey', in: 'header', name: 'X-Event-Signature' },
    },
    headers: {
      XRequestId: {
        description: 'Canonical response correlation identifier.',
        schema: { type: 'string' },
      },
      RetryAfter: {
        description: 'Seconds until retry is meaningful.',
        schema: { type: 'integer', minimum: 0 },
      },
      IdempotencyReplayed: {
        description: 'True when a prior successful logical response was replayed for the same key and fingerprint.',
        schema: { type: 'string', enum: ['true'] },
      },
    },
    schemas,
  },
};

const serialized = `${JSON.stringify(spec)}\n`;
if (checkMode) {
  const existing = await readFile(outputPath, 'utf8');
  assert.equal(existing, serialized, `${outputPath} is stale. Run node scripts/generate-openapi-r3.mjs.`);
  console.log(`OpenAPI R3 generation check PASS: ${operations.length}/${inventory.effective_operation_count} operations.`);
} else {
  await writeFile(outputPath, serialized, 'utf8');
  console.log(`Generated ${outputPath} for ${operations.length} R3 operations.`);
}
