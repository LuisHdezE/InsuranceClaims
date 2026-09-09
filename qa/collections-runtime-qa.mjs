const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for collections runtime QA.');

const collectionId = 'b3000000-0000-4000-8000-000000000001';

function assert(condition, message) {
  if (!condition) throw new Error(`COLLECTIONS_QA_ASSERTION_FAILED: ${message}`);
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
  assert(result.response.status === 200, `${loginName} must authenticate for synthetic collections QA`);
  assert(typeof result.payload.accessToken === 'string', 'login must return access token');
  return result.payload.accessToken;
}

const operatorToken = await login(operatorLogin, 'qa-collections-operator-login');
const adminToken = await login(adminLogin, 'qa-collections-admin-login');

console.log('QA Collections: authentication and least privilege');
assertProblem(await api('/api/v1/operator/collections'), 401, 'AUTHENTICATION_REQUIRED');
assertProblem(await api(`/api/v1/operator/collections/${collectionId}`, { token: adminToken, requestId: 'qa-collections-admin-forbidden' }), 403, 'FORBIDDEN');

console.log('QA Collections: list and detail from PostgreSQL authority');
const list = await api('/api/v1/operator/collections?page=1&pageSize=25', { token: operatorToken, requestId: 'qa-collections-list' });
assert(list.response.status === 200, `listCollectionCases must return 200, got ${list.response.status}`);
assert(list.payload.items.some((item) => item.collectionId === collectionId), 'synthetic CollectionCase must be listed');
const detail = await api(`/api/v1/operator/collections/${collectionId}`, { token: operatorToken, requestId: 'qa-collections-detail' });
assert(detail.response.status === 200, `getCollectionCase must return 200, got ${detail.response.status}`);
assert(detail.payload.status === 'OPEN' && detail.payload.version === 1, 'seeded CollectionCase must begin OPEN version 1');
assert(detail.payload.paymentState === 'DEMO_STATE_A', 'seeded Collection payment state must be DEMO_STATE_A');
assert(detail.payload.customer?.customerRef === 'SYN-QA-COLLECTION-CUST-001', 'Customer context must resolve');
assert(detail.payload.policy?.policyReference === 'MOD-QA-COLLECTION-POL-001', 'Policy context must resolve');
assert(detail.payload.pipeline?.currentStage?.stageKey === 'review', 'pinned Collection pipeline projection must resolve');

console.log('QA Collections: server verification fails closed');
const rejectedPayment = await api(`/api/v1/operator/collections/${collectionId}/payment-state`, {
  method: 'PATCH', token: operatorToken, requestId: 'qa-collections-payment-rejected',
  body: { paymentState: 'NOT_CONFIGURED', expectedVersion: 1 },
});
assertProblem(rejectedPayment, 422, 'VALIDATION_ERROR');
const afterRejected = await api(`/api/v1/operator/collections/${collectionId}`, { token: operatorToken, requestId: 'qa-collections-after-rejected' });
assert(afterRejected.payload.paymentState === 'DEMO_STATE_A' && afterRejected.payload.version === 1, 'unverified payment state must not mutate authority');

console.log('QA Collections: verified authoritative payment state');
const payment = await api(`/api/v1/operator/collections/${collectionId}/payment-state`, {
  method: 'PATCH', token: operatorToken, requestId: 'qa-collections-payment-change',
  body: { paymentState: 'DEMO_STATE_B', expectedVersion: 1 },
});
assert(payment.response.status === 200, `updateCollectionPaymentState must return 200, got ${payment.response.status}`);
assert(payment.payload.paymentState === 'DEMO_STATE_B' && payment.payload.version === 2, 'verified payment state must persist as version 2');
const stalePayment = await api(`/api/v1/operator/collections/${collectionId}/payment-state`, {
  method: 'PATCH', token: operatorToken, requestId: 'qa-collections-payment-stale',
  body: { paymentState: 'DEMO_STATE_A', expectedVersion: 1 },
});
assertProblem(stalePayment, 409, 'RESOURCE_VERSION_CONFLICT');

console.log('QA Collections: operational pipeline movement remains independent');
const moved = await api(`/api/v1/operator/collections/${collectionId}/operational-transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-collections-pipeline-move',
  body: { toStageKey: 'follow-up', expectedVersion: 1 },
});
assert(moved.response.status === 200, `moveCollectionOperationalStage must return 200, got ${moved.response.status}`);
assert(moved.payload.currentStage?.stageKey === 'follow-up' && moved.payload.version === 2, 'pipeline stage/version must persist');
const afterMove = await api(`/api/v1/operator/collections/${collectionId}`, { token: operatorToken, requestId: 'qa-collections-after-move' });
assert(afterMove.payload.status === 'OPEN' && afterMove.payload.version === 2, 'pipeline movement must not mutate Collection lifecycle/version');
assert(afterMove.payload.paymentState === 'DEMO_STATE_B', 'pipeline movement must not mutate Collection payment state');

console.log('QA Collections: terminal lifecycle transition');
const completed = await api(`/api/v1/operator/collections/${collectionId}/transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-collections-complete',
  body: { toStatus: 'COMPLETED', expectedVersion: 2 },
});
assert(completed.response.status === 200, `transitionCollectionCase must return 200, got ${completed.response.status}`);
assert(completed.payload.status === 'COMPLETED' && completed.payload.version === 3, 'terminal transition must persist COMPLETED version 3');
assert(completed.payload.completedAt && completed.payload.cancelledAt === null, 'terminal timestamps must be coherent');

const stale = await api(`/api/v1/operator/collections/${collectionId}/transitions`, {
  method: 'POST', token: operatorToken, requestId: 'qa-collections-stale',
  body: { toStatus: 'CANCELLED', expectedVersion: 2 },
});
assertProblem(stale, 409, 'RESOURCE_VERSION_CONFLICT');
const missing = await api('/api/v1/operator/collections/b3000000-0000-4000-8000-000000009999', { token: operatorToken, requestId: 'qa-collections-missing' });
assertProblem(missing, 404, 'RESOURCE_NOT_FOUND');

console.log(JSON.stringify({
  event: 'COLLECTIONS_RUNTIME_QA_PASS',
  collectionId,
  checks: [
    'staff-authentication', 'least-privilege-rbac', 'postgresql-authority', 'customer-policy-context',
    'payment-verification-fail-closed', 'payment-state-atomicity', 'pipeline-separation',
    'optimistic-concurrency', 'terminal-lifecycle', 'problem-details',
  ],
}));
