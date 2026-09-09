const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for custom fields runtime QA.');

function assert(condition, message) {
  if (!condition) throw new Error(`CUSTOM_FIELDS_QA_ASSERTION_FAILED: ${message}`);
}

async function parseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`); }
}

async function api(path, { method = 'GET', body, token, requestId } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (requestId) headers['x-request-id'] = requestId;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await parseJson(response) };
}

function assertProblem(result, status, code) {
  assert(result.response.status === status, `expected HTTP ${status}, got ${result.response.status}`);
  assert((result.response.headers.get('content-type') ?? '').startsWith('application/problem+json'), 'error must use Problem Details');
  assert(result.payload.code === code, `expected ${code}, got ${result.payload.code}`);
  assert(result.payload.status === status, `Problem Details status must be ${status}`);
}

async function login(loginName, requestId) {
  const result = await api('/api/v1/operator/auth/login', { method: 'POST', requestId, body: { login: loginName, password } });
  assert(result.response.status === 200, `${loginName} must authenticate for synthetic custom fields QA`);
  assert(typeof result.payload.accessToken === 'string', 'login must return access token');
  return result.payload.accessToken;
}

const adminToken = await login(adminLogin, 'qa-custom-fields-admin-login');
const operatorToken = await login(operatorLogin, 'qa-custom-fields-operator-login');

console.log('QA Custom Fields: authentication, least privilege and semantic guardrails');
assertProblem(await api('/api/v1/admin/custom-fields'), 401, 'AUTHENTICATION_REQUIRED');
assertProblem(await api('/api/v1/admin/custom-fields', { token: operatorToken, requestId: 'qa-custom-fields-operator-forbidden' }), 403, 'FORBIDDEN');
const protectedField = await api('/api/v1/admin/custom-fields', {
  method: 'POST', token: adminToken, requestId: 'qa-custom-fields-protected',
  body: {
    fieldKey: 'status', targetType: 'CLAIM', valueType: 'STRING', displayName: 'Rejected protected field',
    validationMetadata: {}, enumValues: [], sensitivityClassification: 'STAFF_ONLY', sourceClassification: 'SYNTHETIC_QA',
  },
});
assertProblem(protectedField, 422, 'CUSTOM_FIELD_DEFINITION_INVALID');

console.log('QA Custom Fields: create DRAFT v1 in PostgreSQL authority');
const created = await api('/api/v1/admin/custom-fields', {
  method: 'POST', token: adminToken, requestId: 'qa-custom-fields-create',
  body: {
    fieldKey: 'syntheticQaOperationalMarker', targetType: 'CLAIM', valueType: 'ENUM', displayName: 'Synthetic QA operational marker',
    validationMetadata: { required: false, maxSelections: 1 }, enumValues: ['QA_A', 'QA_B'], sensitivityClassification: 'STAFF_ONLY',
    sourceClassification: 'SYNTHETIC_QA_V1',
  },
});
assert(created.response.status === 201, `createCustomField must return 201, got ${created.response.status}`);
assert(created.payload.enabled === false && created.payload.version === 1, 'new definition must be disabled version 1');
assert(created.payload.versions?.[0]?.status === 'DRAFT', 'initial version must be DRAFT');
const definitionId = created.payload.definitionId;
const version1Id = created.payload.versions[0].versionId;

const list = await api('/api/v1/admin/custom-fields?page=1&pageSize=25', { token: adminToken, requestId: 'qa-custom-fields-list' });
assert(list.response.status === 200 && list.payload.items.some((item) => item.definitionId === definitionId), 'created definition must be listed');
const detail = await api(`/api/v1/admin/custom-fields/${definitionId}`, { token: adminToken, requestId: 'qa-custom-fields-detail' });
assert(detail.response.status === 200 && detail.payload.targetType === 'CLAIM', 'detail must resolve PostgreSQL definition');

console.log('QA Custom Fields: activation, enablement and optimistic concurrency');
const activeV1 = await api(`/api/v1/admin/custom-fields/${definitionId}/versions/${version1Id}/activate`, {
  method: 'POST', token: adminToken, requestId: 'qa-custom-fields-activate-v1', body: { expectedDefinitionVersion: 1 },
});
assert(activeV1.response.status === 200 && activeV1.payload.version === 2, 'v1 activation must increment definition version');
const enabled = await api(`/api/v1/admin/custom-fields/${definitionId}`, {
  method: 'PATCH', token: adminToken, requestId: 'qa-custom-fields-enable', body: { expectedDefinitionVersion: 2, enabled: true },
});
assert(enabled.response.status === 200 && enabled.payload.enabled === true && enabled.payload.version === 3, 'enablement must persist version 3');
const stale = await api(`/api/v1/admin/custom-fields/${definitionId}/versions`, {
  method: 'POST', token: adminToken, requestId: 'qa-custom-fields-stale',
  body: {
    expectedDefinitionVersion: 2, valueType: 'BOOLEAN', displayName: 'Stale synthetic revision', validationMetadata: {}, enumValues: [],
    sensitivityClassification: 'PUBLIC_SAFE', sourceClassification: 'SYNTHETIC_QA_STALE',
  },
});
assertProblem(stale, 409, 'RESOURCE_VERSION_CONFLICT');

console.log('QA Custom Fields: immutable-content successor and retirement');
const draftV2 = await api(`/api/v1/admin/custom-fields/${definitionId}/versions`, {
  method: 'POST', token: adminToken, requestId: 'qa-custom-fields-create-v2',
  body: {
    expectedDefinitionVersion: 3, valueType: 'BOOLEAN', displayName: 'Synthetic QA operational marker v2', validationMetadata: {}, enumValues: [],
    sensitivityClassification: 'PUBLIC_SAFE', sourceClassification: 'SYNTHETIC_QA_V2',
  },
});
assert(draftV2.response.status === 201 && draftV2.payload.version === 4, 'successor DRAFT must be created at definition version 4');
const version2Id = draftV2.payload.versions.at(-1).versionId;
const activeV2 = await api(`/api/v1/admin/custom-fields/${definitionId}/versions/${version2Id}/activate`, {
  method: 'POST', token: adminToken, requestId: 'qa-custom-fields-activate-v2', body: { expectedDefinitionVersion: 4 },
});
assert(activeV2.response.status === 200 && activeV2.payload.version === 5, 'v2 activation must persist definition version 5');
assert(activeV2.payload.versions.find((item) => item.versionId === version1Id)?.status === 'RETIRED', 'previous active version must retire');
const disabled = await api(`/api/v1/admin/custom-fields/${definitionId}`, {
  method: 'PATCH', token: adminToken, requestId: 'qa-custom-fields-disable', body: { expectedDefinitionVersion: 5, enabled: false },
});
assert(disabled.response.status === 200 && disabled.payload.version === 6, 'disable must increment definition version');
assert(disabled.payload.enabled === false && disabled.payload.activeVersionId === null, 'disable must remove runtime active pointer');
assert(disabled.payload.versions.find((item) => item.versionId === version2Id)?.status === 'RETIRED', 'disable must retire active version');

console.log(JSON.stringify({
  event: 'CUSTOM_FIELDS_RUNTIME_QA_PASS', definitionId, version1Id, version2Id,
  checks: [
    'staff-authentication', 'least-privilege-rbac', 'protected-field-rejection', 'postgresql-authority',
    'draft-v1', 'optimistic-concurrency', 'activation', 'enable-disable', 'version-retirement', 'problem-details',
  ],
}));
