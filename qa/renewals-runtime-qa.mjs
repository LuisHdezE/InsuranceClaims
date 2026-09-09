const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for renewals runtime QA.');

const renewalId = 'a3000000-0000-4000-8000-000000000001';

function assert(condition, message) {
  if (!condition) throw new Error(`RENEWALS_QA_ASSERTION_FAILED: ${message}`);
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
  const result = await api('/api/v1/operator/auth/login', {
    method: 'POST', requestId,
    body: { login: loginName, password },
  });
  assert(result.response.status === 200, `${loginName} must authenticate for synthetic renewals QA`);
  assert(typeof result.payload.accessToken === 'string', 'login must return access token');
  return result.payload.accessToken;
}

const operatorToken = await login(operatorLogin, 'qa-renewals-operator-login');
const adminToken = await login(adminLogin, 'qa-renewals-admin-login');

console.log('QA Renewals: authentication and least privilege');
const unauthenticated = await api('/api/v1/operator/renewals');
assertProblem(unauthenticated, 401, 'AUTHENTICATION_REQUIRED');
const adminForbidden = await api(`/api/v1/operator/renewals/${renewalId}`, {
  token: adminToken,
  requestId: 'qa-renewals-admin-forbidden',
});
assertProblem(adminForbidden, 403, 'FORBIDDEN');

console.log('QA Renewals: list and detail from PostgreSQL authority');
const list = await api('/api/v1/operator/renewals?page=1&pageSize=25', {
  token: operatorToken,
  requestId: 'qa-renewals-list',
});
assert(list.response.status === 200, `listRenewalCases must return 200, got ${list.response.status}`);
assert(list.payload.items.some((item) => item.renewalId === renewalId), 'synthetic RenewalCase must be listed');
const detail = await api(`/api/v1/operator/renewals/${renewalId}`, {
  token: operatorToken,
  requestId: 'qa-renewals-detail',
});
assert(detail.response.status === 200, `getRenewalCase must return 200, got ${detail.response.status}`);
assert(detail.payload.status === 'OPEN' && detail.payload.version === 1, 'seeded RenewalCase must begin OPEN version 1');
assert(detail.payload.customer?.customerRef === 'SYN-QA-RENEWAL-CUST-001', 'Customer 360 context must resolve');
assert(detail.payload.policy?.policyReference === 'MOD-QA-RENEWAL-POL-001', 'Policy 360 context must resolve');
assert(detail.payload.pipeline?.currentStage?.stageKey === 'review', 'pinned Renewal pipeline projection must resolve');

console.log('QA Renewals: operational stage movement remains a projection');
const moved = await api(`/api/v1/operator/renewals/${renewalId}/operational-transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-renewals-pipeline-move',
  body: { toStageKey: 'follow-up', expectedVersion: 1 },
});
assert(moved.response.status === 200, `moveRenewalOperationalStage must return 200, got ${moved.response.status}`);
assert(moved.payload.currentStage?.stageKey === 'follow-up' && moved.payload.version === 2, 'pipeline work item must persist stage/version move');
const afterMove = await api(`/api/v1/operator/renewals/${renewalId}`, {
  token: operatorToken,
  requestId: 'qa-renewals-detail-after-move',
});
assert(afterMove.response.status === 200, 'Renewal detail must remain readable after pipeline move');
assert(afterMove.payload.status === 'OPEN' && afterMove.payload.version === 1, 'Pipeline movement must not mutate Renewal lifecycle or version');

const stalePipeline = await api(`/api/v1/operator/renewals/${renewalId}/operational-transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-renewals-pipeline-stale',
  body: { toStageKey: 'follow-up', expectedVersion: 1 },
});
assertProblem(stalePipeline, 409, 'RESOURCE_VERSION_CONFLICT');

console.log('QA Renewals: terminal lifecycle transition and optimistic concurrency');
const completed = await api(`/api/v1/operator/renewals/${renewalId}/transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-renewals-complete',
  body: { toStatus: 'COMPLETED', expectedVersion: 1 },
});
assert(completed.response.status === 200, `transitionRenewalCase must return 200, got ${completed.response.status}`);
assert(completed.payload.status === 'COMPLETED' && completed.payload.version === 2, 'terminal transition must persist COMPLETED version 2');
assert(completed.payload.completedAt, 'COMPLETED transition must set completedAt');
assert(completed.payload.cancelledAt === null, 'COMPLETED transition must not set cancelledAt');

const stale = await api(`/api/v1/operator/renewals/${renewalId}/transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-renewals-stale',
  body: { toStatus: 'CANCELLED', expectedVersion: 1 },
});
assertProblem(stale, 409, 'RESOURCE_VERSION_CONFLICT');

const invalidTerminal = await api(`/api/v1/operator/renewals/${renewalId}/transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-renewals-invalid-terminal',
  body: { toStatus: 'CANCELLED', expectedVersion: 2 },
});
assertProblem(invalidTerminal, 409, 'INVALID_STATE_TRANSITION');

const missing = await api('/api/v1/operator/renewals/a3000000-0000-4000-8000-000000009999', {
  token: operatorToken,
  requestId: 'qa-renewals-missing',
});
assertProblem(missing, 404, 'RESOURCE_NOT_FOUND');

console.log(JSON.stringify({
  event: 'RENEWALS_RUNTIME_QA_PASS',
  renewalId,
  checks: [
    'staff-authentication',
    'least-privilege-rbac',
    'postgresql-authority',
    'customer-policy-context',
    'pipeline-separation',
    'optimistic-concurrency',
    'terminal-lifecycle',
    'problem-details',
  ],
}));
