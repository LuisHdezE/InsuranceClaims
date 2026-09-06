import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const operatorPassword = process.env.QA_OPERATOR_PASSWORD;
if (!operatorPassword) throw new Error('QA_OPERATOR_PASSWORD is required for runtime QA.');

function assert(condition, message) {
  if (!condition) throw new Error(`QA_ASSERTION_FAILED: ${message}`);
}

async function parseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`); }
}

async function jsonRequest(path, { method = 'GET', body, headers = {}, requestId } = {}) {
  const finalHeaders = { ...headers };
  if (body !== undefined) finalHeaders['content-type'] = 'application/json';
  if (requestId) finalHeaders['x-request-id'] = requestId;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, payload: await parseJson(response) };
}

function assertRequestId(response, expected) {
  assert(response.headers.get('x-request-id') === expected, `X-Request-Id must echo ${expected}`);
}

function assertProblem(response, payload, status, code) {
  assert(response.status === status, `expected HTTP ${status}, got ${response.status}`);
  assert((response.headers.get('content-type') ?? '').startsWith('application/problem+json'), 'error must use application/problem+json');
  assert(payload.status === status, `Problem Details status must be ${status}`);
  assert(payload.code === code, `Problem Details code must be ${code}, got ${payload.code}`);
  assert(typeof payload.requestId === 'string' && payload.requestId.length > 0, 'Problem Details must include requestId');
  assert(typeof payload.type === 'string' && payload.type.startsWith('urn:insuranceclaims:problem:'), 'Problem Details must include safe urn type');
  assert(typeof payload.detail === 'string' && !payload.detail.includes('SELECT ') && !payload.detail.includes('/home/runner'), 'Problem detail must be sanitized');
}

function claimForm({ policyReference = 'SYN-POL-001', vehicleReference = 'SYN-VEH-001', description = 'Synthetic runtime QA claim.', evidenceType = 'application/pdf', withEvidence = true } = {}) {
  const form = new FormData();
  form.set('policyReference', policyReference);
  form.set('vehicleReference', vehicleReference);
  form.set('eventType', 'Synthetic collision');
  form.set('occurredAt', '2026-09-05T12:00:00Z');
  form.set('locationText', 'Synthetic QA location');
  form.set('description', description);
  if (withEvidence) form.append('evidence', new Blob([new TextEncoder().encode('%PDF-1.4\n% synthetic QA evidence\n')], { type: evidenceType }), 'qa-evidence.pdf');
  return form;
}

async function createClaim(idempotencyKey, options = {}, requestId = 'qa-create-001') {
  const response = await fetch(`${baseUrl}/api/v1/public/claims`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey, 'x-request-id': requestId },
    body: claimForm(options),
  });
  const payload = await parseJson(response);
  return { response, payload };
}

console.log('QA: health and positive public flow');
{
  const live = await jsonRequest('/health/live');
  assert(live.response.status === 200 && live.payload.status === 'ok', 'liveness must pass');
  const ready = await jsonRequest('/health/ready');
  assert(ready.response.status === 200 && ready.payload.status === 'ok', 'readiness must pass');
}

const verify = await jsonRequest('/api/v1/public/policy-verifications', {
  method: 'POST',
  requestId: 'qa-verify-001',
  body: { policyReference: 'SYN-POL-001', vehicleReference: 'SYN-VEH-001' },
});
assert(verify.response.status === 200 && verify.payload.eligible === true, 'eligible synthetic policy must verify');
assert(verify.payload.customerLabel === 'Synthetic Customer A', 'legacy ACL must map synthetic customer label');
assertRequestId(verify.response, 'qa-verify-001');

const primaryKey = 'qa-idempotency-primary-0001';
const created = await createClaim(primaryKey);
assert(created.response.status === 201, `createClaim must return 201, got ${created.response.status}`);
assert(created.payload.status === 'RECEIVED' && typeof created.payload.trackingCode === 'string', 'createClaim response must expose trackingCode and RECEIVED');
assert(created.response.headers.get('idempotency-replayed') === null, 'first create must not be marked replayed');
assertRequestId(created.response, 'qa-create-001');
const trackingCode = created.payload.trackingCode;

const replay = await createClaim(primaryKey, {}, 'qa-create-replay');
assert(replay.response.status === 201, 'idempotent replay must preserve 201');
assert(replay.payload.trackingCode === trackingCode, 'idempotent replay must preserve original response');
assert(replay.response.headers.get('idempotency-replayed') === 'true', 'replay must expose Idempotency-Replayed=true');

const reused = await createClaim(primaryKey, { description: 'Different synthetic payload.' }, 'qa-create-reused');
assertProblem(reused.response, reused.payload, 409, 'IDEMPOTENCY_KEY_REUSED');

const track = await jsonRequest('/api/v1/public/claim-tracking', {
  method: 'POST', requestId: 'qa-track-001', body: { trackingCode, policyReference: 'SYN-POL-001' },
});
assert(track.response.status === 200 && track.payload.status === 'RECEIVED', 'public tracking must show RECEIVED');
assertRequestId(track.response, 'qa-track-001');
for (const forbidden of ['claimId', 'policyReference', 'auditEvents', 'description', 'verifiedCustomerLabel']) {
  assert(!Object.hasOwn(track.payload, forbidden), `public tracking must not leak ${forbidden}`);
}

console.log('QA: negative and security behavior');
const missingTrack = await jsonRequest('/api/v1/public/claim-tracking', {
  method: 'POST', requestId: 'qa-track-miss', body: { trackingCode, policyReference: 'SYN-POL-999' },
});
assertProblem(missingTrack.response, missingTrack.payload, 404, 'CLAIM_NOT_FOUND');
assertRequestId(missingTrack.response, 'qa-track-miss');

const invalidLogin = await jsonRequest('/api/v1/operator/auth/login', {
  method: 'POST', requestId: 'qa-login-failed', body: { login: operatorLogin, password: 'wrong-password' },
});
assertProblem(invalidLogin.response, invalidLogin.payload, 401, 'INVALID_CREDENTIALS');
assert(!JSON.stringify(invalidLogin.payload).includes(operatorLogin), 'invalid login response must not echo account identity');

const login = await jsonRequest('/api/v1/operator/auth/login', {
  method: 'POST', requestId: 'qa-login-success', body: { login: operatorLogin, password: operatorPassword },
});
assert(login.response.status === 200, `operator login must return 200, got ${login.response.status}`);
assert(typeof login.payload.accessToken === 'string' && login.payload.accessToken.split('.').length === 3, 'login must return JWT');
assert(login.payload.expiresIn === 900 && login.payload.operator.role === 'CLAIMS_OPERATOR', 'JWT contract must preserve 900 second operator session');
const token = login.payload.accessToken;
const auth = { authorization: `Bearer ${token}` };

const noAuth = await jsonRequest('/api/v1/operator/claims', { requestId: 'qa-no-auth' });
assertProblem(noAuth.response, noAuth.payload, 401, 'AUTHENTICATION_REQUIRED');

const badToken = await jsonRequest('/api/v1/operator/claims', { requestId: 'qa-bad-token', headers: { authorization: 'Bearer definitely-not-a-jwt' } });
assertProblem(badToken.response, badToken.payload, 401, 'AUTHENTICATION_REQUIRED');

const badPagination = await jsonRequest('/api/v1/operator/claims?page=0&pageSize=101', { requestId: 'qa-bad-page', headers: auth });
assertProblem(badPagination.response, badPagination.payload, 422, 'VALIDATION_ERROR');

const badEvidence = await createClaim('qa-idempotency-bad-evidence-01', { evidenceType: 'text/plain' }, 'qa-bad-evidence');
assertProblem(badEvidence.response, badEvidence.payload, 422, 'EVIDENCE_VALIDATION_FAILED');

console.log('QA: protected positive flow and runtime contract');
const list = await jsonRequest('/api/v1/operator/claims?page=1&pageSize=20', { requestId: 'qa-list-001', headers: auth });
assert(list.response.status === 200 && Array.isArray(list.payload.items), 'listClaims must return paginated items');
const listItem = list.payload.items.find((item) => item.trackingCode === trackingCode);
assert(listItem && typeof listItem.claimId === 'string', 'created claim must be visible to operator');
const claimId = listItem.claimId;

const detail = await jsonRequest(`/api/v1/operator/claims/${claimId}`, { requestId: 'qa-detail-001', headers: auth });
assert(detail.response.status === 200 && detail.payload.claimId === claimId, 'getClaimDetail must return claim');
assert(Array.isArray(detail.payload.evidence) && detail.payload.evidence.length === 1, 'claim detail must expose evidence metadata');
assert(Array.isArray(detail.payload.auditEvents) && detail.payload.auditEvents.some((e) => e.eventCode === 'CLAIM_CREATED'), 'detail must expose allowlisted claim audit summary');
const evidenceId = detail.payload.evidence[0].evidenceId;

const evidence = await fetch(`${baseUrl}/api/v1/operator/claims/${claimId}/evidence/${evidenceId}`, {
  headers: { ...auth, 'x-request-id': 'qa-evidence-001' },
});
assert(evidence.status === 200, 'downloadClaimEvidence must return 200');
assert((evidence.headers.get('content-type') ?? '').startsWith('application/pdf'), 'evidence media type must be allowlisted PDF');
assert((evidence.headers.get('content-disposition') ?? '').includes('attachment;'), 'evidence must use attachment content-disposition');
assert((await evidence.arrayBuffer()).byteLength > 0, 'evidence bytes must be retrievable');

const transition = await jsonRequest(`/api/v1/operator/claims/${claimId}/transitions`, {
  method: 'POST', requestId: 'qa-transition-001', headers: auth,
  body: { expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' },
});
assert(transition.response.status === 200 && transition.payload.status === 'UNDER_REVIEW', 'valid transition must succeed');

const trackedAfter = await jsonRequest('/api/v1/public/claim-tracking', {
  method: 'POST', requestId: 'qa-track-after', body: { trackingCode, policyReference: 'SYN-POL-001' },
});
assert(trackedAfter.response.status === 200 && trackedAfter.payload.status === 'UNDER_REVIEW', 'public tracking must reflect operator transition');
assert(trackedAfter.payload.timeline.some((e) => e.status === 'UNDER_REVIEW'), 'public timeline must include transition');

const staleTransition = await jsonRequest(`/api/v1/operator/claims/${claimId}/transitions`, {
  method: 'POST', requestId: 'qa-transition-stale', headers: auth,
  body: { expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' },
});
assertProblem(staleTransition.response, staleTransition.payload, 409, 'CLAIM_STATE_CONFLICT');

const illegalTransition = await jsonRequest(`/api/v1/operator/claims/${claimId}/transitions`, {
  method: 'POST', requestId: 'qa-transition-illegal', headers: auth,
  body: { expectedFromStatus: 'UNDER_REVIEW', toStatus: 'CLOSED' },
});
assertProblem(illegalTransition.response, illegalTransition.payload, 409, 'INVALID_STATE_TRANSITION');

console.log('QA: concurrent stale-state guard');
const raceCreated = await createClaim('qa-idempotency-race-claim-0001', { policyReference: 'SYN-POL-002', vehicleReference: 'SYN-VEH-002', withEvidence: false }, 'qa-race-create');
assert(raceCreated.response.status === 201, 'race-test claim must be created');
const raceTracking = raceCreated.payload.trackingCode;
const listRace = await jsonRequest('/api/v1/operator/claims?page=1&pageSize=100', { requestId: 'qa-race-list', headers: auth });
const raceItem = listRace.payload.items.find((item) => item.trackingCode === raceTracking);
assert(raceItem, 'race-test claim must be visible');
const raceClaimId = raceItem.claimId;
const concurrent = await Promise.all([
  jsonRequest(`/api/v1/operator/claims/${raceClaimId}/transitions`, { method: 'POST', requestId: 'qa-race-a', headers: auth, body: { expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' } }),
  jsonRequest(`/api/v1/operator/claims/${raceClaimId}/transitions`, { method: 'POST', requestId: 'qa-race-b', headers: auth, body: { expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' } }),
]);
const raceStatuses = concurrent.map((r) => r.response.status).sort();
assert(raceStatuses[0] === 200 && raceStatuses[1] === 409, `concurrent transition guard requires one 200 and one 409, got ${raceStatuses.join(',')}`);
const raceConflict = concurrent.find((r) => r.response.status === 409);
assertProblem(raceConflict.response, raceConflict.payload, 409, 'CLAIM_STATE_CONFLICT');

console.log('QA: transport rate limit');
for (let index = 0; index < 19; index += 1) {
  const r = await jsonRequest('/api/v1/public/policy-verifications', {
    method: 'POST', requestId: `qa-rate-${String(index).padStart(2, '0')}`,
    body: { policyReference: 'SYN-POL-001', vehicleReference: 'SYN-VEH-001' },
  });
  assert(r.response.status === 200, `verify request ${index + 2}/20 must remain within limit`);
}
const rateLimited = await jsonRequest('/api/v1/public/policy-verifications', {
  method: 'POST', requestId: 'qa-rate-blocked', body: { policyReference: 'SYN-POL-001', vehicleReference: 'SYN-VEH-001' },
});
assertProblem(rateLimited.response, rateLimited.payload, 429, 'RATE_LIMITED');
assert(Number(rateLimited.response.headers.get('retry-after')) >= 1, '429 must include Retry-After');

await mkdir('.runtime', { recursive: true });
await writeFile('.runtime/api-qa-state.json', JSON.stringify({
  claimId,
  raceClaimId,
  trackingCode,
  raceTracking,
  operatorId: login.payload.operator.id,
  evidenceId,
}, null, 2));

console.log(JSON.stringify({
  event: 'API_QA_RUNTIME_PASS',
  checks: ['positive', 'negative', 'contract', 'security', 'concurrency'],
  claimId,
  raceClaimId,
}));
