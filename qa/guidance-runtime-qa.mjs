const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for guidance runtime QA.');

function assert(condition, message) {
  if (!condition) throw new Error(`GUIDANCE_QA_ASSERTION_FAILED: ${message}`);
}

async function parseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`); }
}

async function request(path, { method = 'GET', body, token, requestId } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (requestId) headers['x-request-id'] = requestId;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await parseJson(response) };
}

function assertProblem(result, status, code) {
  assert(result.response.status === status, `expected HTTP ${status}, got ${result.response.status}`);
  assert((result.response.headers.get('content-type') ?? '').startsWith('application/problem+json'), 'error must use Problem Details');
  assert(result.payload.code === code, `expected ${code}, got ${result.payload.code}`);
  assert(result.payload.status === status, `Problem Details status must be ${status}`);
}

async function login(loginName, requestId) {
  const result = await request('/api/v1/operator/auth/login', {
    method: 'POST',
    requestId,
    body: { login: loginName, password },
  });
  assert(result.response.status === 200, `${loginName} must authenticate for synthetic guidance QA`);
  assert(typeof result.payload.accessToken === 'string', 'login must return access token');
  return result.payload.accessToken;
}

const operatorToken = await login(operatorLogin, 'qa-guidance-operator-login');
const adminToken = await login(adminLogin, 'qa-guidance-admin-login');

console.log('QA Guidance: least privilege');
const forbidden = await request('/api/v1/admin/guidance', { token: operatorToken, requestId: 'qa-guidance-forbidden' });
assertProblem(forbidden, 403, 'FORBIDDEN');

const contentV1 = {
  insurerContextReference: 'SYNTHETIC_QA_INSURER_CONTEXT',
  guidanceCategory: 'SYNTHETIC_QA_DOCUMENT_GUIDANCE',
  documentCategories: ['SYNTHETIC_QA_IDENTITY', 'SYNTHETIC_QA_EVENT_EVIDENCE'],
  instructions: ['Synthetic QA instruction. This is not insurer guidance.'],
  assistanceMetadata: { mode: 'SYNTHETIC_QA_PORTAL' },
};
const contentV2 = {
  insurerContextReference: 'SYNTHETIC_QA_INSURER_CONTEXT',
  guidanceCategory: 'SYNTHETIC_QA_DOCUMENT_GUIDANCE_V2',
  documentCategories: ['SYNTHETIC_QA_EVENT_EVIDENCE'],
  instructions: ['Synthetic QA revision. This is not insurer guidance.'],
  assistanceMetadata: { mode: 'SYNTHETIC_QA_ASSISTANCE' },
};

console.log('QA Guidance: create, list and get');
const created = await request('/api/v1/admin/guidance', {
  method: 'POST', token: adminToken, requestId: 'qa-guidance-create',
  body: { key: 'synthetic-qa-guidance', sourceClassification: 'SYNTHETIC_QA', ...contentV1 },
});
assert(created.response.status === 201, `createGuidance must return 201, got ${created.response.status}`);
assert(created.payload.enabled === false && created.payload.version === 1, 'new guidance must be disabled definition version 1');
assert(created.payload.activeVersionId === null, 'new guidance must not have an active version');
assert(created.payload.versions?.length === 1 && created.payload.versions[0].status === 'DRAFT', 'new guidance must contain DRAFT v1');
const definitionId = created.payload.definitionId;
const version1Id = created.payload.versions[0].versionId;
assert(typeof definitionId === 'string' && typeof version1Id === 'string', 'guidance identity must be returned');

const listed = await request('/api/v1/admin/guidance?page=1&pageSize=25', { token: adminToken, requestId: 'qa-guidance-list' });
assert(listed.response.status === 200 && listed.payload.totalItems === 1, 'listGuidances must return persisted definition');
assert(listed.payload.items[0].definitionId === definitionId, 'listGuidances must preserve definition identity');

const fetched = await request(`/api/v1/admin/guidance/${definitionId}`, { token: adminToken, requestId: 'qa-guidance-get' });
assert(fetched.response.status === 200 && fetched.payload.definitionId === definitionId, 'getGuidance must return persisted definition');
assert(fetched.payload.versions[0].sourceClassification === 'SYNTHETIC_QA', 'source provenance must be persisted');

console.log('QA Guidance: activate, enable and optimistic conflict');
const activeV1 = await request(`/api/v1/admin/guidance/${definitionId}/versions/${version1Id}/activate`, {
  method: 'POST', token: adminToken, requestId: 'qa-guidance-activate-v1',
  body: { expectedDefinitionVersion: 1 },
});
assert(activeV1.response.status === 200 && activeV1.payload.version === 2, 'activateGuidanceVersion must increment definition version');
assert(activeV1.payload.activeVersionId === version1Id, 'activation must set active version pointer');

const enabled = await request(`/api/v1/admin/guidance/${definitionId}`, {
  method: 'PATCH', token: adminToken, requestId: 'qa-guidance-enable',
  body: { expectedDefinitionVersion: 2, enabled: true },
});
assert(enabled.response.status === 200 && enabled.payload.enabled === true && enabled.payload.version === 3, 'enable must persist runtime availability');

const stale = await request(`/api/v1/admin/guidance/${definitionId}/versions`, {
  method: 'POST', token: adminToken, requestId: 'qa-guidance-stale-version',
  body: { expectedDefinitionVersion: 2, sourceClassification: 'SYNTHETIC_QA_STALE', ...contentV2 },
});
assertProblem(stale, 409, 'RESOURCE_VERSION_CONFLICT');

console.log('QA Guidance: new DRAFT, activation and retirement');
const draftV2 = await request(`/api/v1/admin/guidance/${definitionId}/versions`, {
  method: 'POST', token: adminToken, requestId: 'qa-guidance-create-v2',
  body: { expectedDefinitionVersion: 3, sourceClassification: 'SYNTHETIC_QA_V2', ...contentV2 },
});
assert(draftV2.response.status === 201 && draftV2.payload.version === 4, 'createGuidanceVersion must persist a new DRAFT');
const version2 = draftV2.payload.versions.find((item) => item.versionNumber === 2);
assert(version2?.status === 'DRAFT', 'second guidance version must begin DRAFT');
const version2Id = version2.versionId;

const activeV2 = await request(`/api/v1/admin/guidance/${definitionId}/versions/${version2Id}/activate`, {
  method: 'POST', token: adminToken, requestId: 'qa-guidance-activate-v2',
  body: { expectedDefinitionVersion: 4 },
});
assert(activeV2.response.status === 200 && activeV2.payload.version === 5, 'second activation must increment definition version');
assert(activeV2.payload.versions.find((item) => item.versionId === version1Id)?.status === 'RETIRED', 'activating v2 must retire v1');
assert(activeV2.payload.versions.find((item) => item.versionId === version2Id)?.status === 'ACTIVE', 'v2 must become ACTIVE');

const disabled = await request(`/api/v1/admin/guidance/${definitionId}`, {
  method: 'PATCH', token: adminToken, requestId: 'qa-guidance-disable',
  body: { expectedDefinitionVersion: 5, enabled: false },
});
assert(disabled.response.status === 200 && disabled.payload.version === 6, 'disable must increment definition version');
assert(disabled.payload.enabled === false && disabled.payload.activeVersionId === null, 'disable must clear runtime active pointer');
assert(disabled.payload.versions.find((item) => item.versionId === version2Id)?.status === 'RETIRED', 'disable must retire the active version');

console.log(JSON.stringify({
  event: 'INSURER_GUIDANCE_RUNTIME_QA_PASS',
  definitionId,
  version1Id,
  version2Id,
  checks: ['rbac', 'postgresql', 'versioning', 'optimistic-concurrency', 'audit-triggering'],
}));
