const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const supervisorLogin = process.env.QA_SUPERVISOR_LOGIN ?? 'qa.supervisor@example.invalid';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for bulk runtime QA.');

const claimA = 'd7000000-0000-4000-8000-000000000001';
const claimB = 'd7000000-0000-4000-8000-000000000002';

function assert(condition, message) {
  if (!condition) throw new Error(`BULK_ACTIONS_QA_ASSERTION_FAILED: ${message}`);
}

async function parseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); }
  catch { throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`); }
}

async function api(path, { method = 'GET', body, token, requestId, idempotencyKey } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (requestId) headers['x-request-id'] = requestId;
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { response, payload: await parseJson(response) };
}

function assertProblem(result, status, code) {
  assert(result.response.status === status, `expected HTTP ${status}, got ${result.response.status}`);
  assert((result.response.headers.get('content-type') ?? '').startsWith('application/problem+json'), 'error must use Problem Details');
  assert(result.payload.code === code, `expected ${code}, got ${result.payload.code}`);
}

async function login(loginName, requestId) {
  const result = await api('/api/v1/operator/auth/login', {
    method: 'POST', requestId, body: { login: loginName, password },
  });
  assert(result.response.status === 200, `${loginName} must authenticate for synthetic bulk QA`);
  return result.payload.accessToken;
}

const supervisorToken = await login(supervisorLogin, 'qa-bulk-supervisor-login');
const operatorToken = await login(operatorLogin, 'qa-bulk-operator-login');
const adminToken = await login(adminLogin, 'qa-bulk-admin-login');

const payload = {
  actionType: 'transitionClaimStatus',
  action: { toStatus: 'UNDER_REVIEW' },
  items: [
    { claimId: claimA, expectedFromStatus: 'RECEIVED' },
    { claimId: claimB, expectedFromStatus: 'RECEIVED' },
  ],
};

console.log('QA Bulk Actions: least-privilege authorization');
assertProblem(await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: operatorToken, idempotencyKey: 'qa-bulk-operator-forbidden', body: payload,
}), 403, 'FORBIDDEN');
assertProblem(await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: adminToken, idempotencyKey: 'qa-bulk-admin-forbidden-001', body: payload,
}), 403, 'FORBIDDEN');

console.log('QA Bulk Actions: partial-success single-item parity');
const first = await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: supervisorToken, requestId: 'qa-bulk-request',
  idempotencyKey: 'qa-bulk-idempotency-key-0001', body: payload,
});
assert(first.response.status === 200, `bulk operation must return 200, got ${first.response.status}`);
assert(first.payload.selectedItemCount === 2, 'selected item count must be 2');
assert(first.payload.succeededCount === 1, 'one Claim transition must succeed');
assert(first.payload.failedCount === 1, 'one stale Claim transition must fail independently');
assert(first.payload.skippedCount === 0, 'current allowlisted action has no skipped outcome');
assert(first.payload.allSucceeded === false, 'partial success must never report global success');
assert(first.payload.results[0]?.outcome === 'SUCCEEDED', 'first Claim must succeed');
assert(first.payload.results[1]?.outcome === 'FAILED', 'second Claim must fail');
assert(first.payload.results[1]?.code === 'CLAIM_STATE_CONFLICT', 'stale item must expose the single-item conflict code');
assert(typeof first.payload.bulkOperationId === 'string', 'bulk operation identity must be returned');

console.log('QA Bulk Actions: same-key replay and changed-fingerprint conflict');
const replay = await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: supervisorToken, requestId: 'qa-bulk-replay',
  idempotencyKey: 'qa-bulk-idempotency-key-0001', body: payload,
});
assert(replay.response.status === 200, 'same request must replay with 200');
assert(replay.response.headers.get('idempotency-replayed') === 'true', 'replay header must be emitted');
assert(JSON.stringify(replay.payload) === JSON.stringify(first.payload), 'replay must return the original logical response');

const conflict = await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: supervisorToken, requestId: 'qa-bulk-conflict',
  idempotencyKey: 'qa-bulk-idempotency-key-0001',
  body: { ...payload, action: { toStatus: 'OBSERVED' } },
});
assertProblem(conflict, 409, 'IDEMPOTENCY_KEY_REUSED');

console.log('QA Bulk Actions: request-level allowlist and maximum');
const unsupported = await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: supervisorToken, requestId: 'qa-bulk-unsupported',
  idempotencyKey: 'qa-bulk-unsupported-key-0001',
  body: { ...payload, actionType: 'moveOperationalStage' },
});
assertProblem(unsupported, 422, 'BULK_ACTION_INVALID');

const oversized = await api('/api/v1/operator/bulk-actions', {
  method: 'POST', token: supervisorToken, requestId: 'qa-bulk-oversized',
  idempotencyKey: 'qa-bulk-oversized-key-00001',
  body: {
    actionType: 'transitionClaimStatus',
    action: { toStatus: 'UNDER_REVIEW' },
    items: Array.from({ length: 101 }, (_, index) => ({
      claimId: `d8000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      expectedFromStatus: 'RECEIVED',
    })),
  },
});
assertProblem(oversized, 422, 'BULK_ACTION_INVALID');

console.log(JSON.stringify({
  event: 'BULK_ACTIONS_RUNTIME_QA_PASS',
  bulkOperationId: first.payload.bulkOperationId,
  checks: [
    'supervisor-only-rbac', 'single-item-command-parity', 'partial-success', 'per-item-conflict',
    'idempotent-replay', 'fingerprint-conflict', 'allowlist', 'maximum-100', 'problem-details',
  ],
}));
