import assert from 'node:assert/strict';

const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const customerLogin = process.env.QA_CUSTOMER_LOGIN ?? 'qa.customer@example.invalid';
const customerPassword = process.env.QA_CUSTOMER_PASSWORD;
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const operatorPassword = process.env.QA_OPERATOR_PASSWORD;
if (!customerPassword || !operatorPassword) throw new Error('QA customer and operator passwords are required.');

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${base}${path}`, init);
  let body = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) body = await response.json();
  return { response, body };
}

async function login(path, loginValue, passwordValue, requestId) {
  const { response, body } = await jsonRequest(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    body: JSON.stringify({ login: loginValue, password: passwordValue }),
  });
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(typeof body.accessToken, 'string');
  return body.accessToken;
}

const failedLogin = await jsonRequest('/api/v1/portal/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-request-id': 'qa-portal-login-failed' },
  body: JSON.stringify({ login: customerLogin, password: 'definitely-wrong-password' }),
});
assert.equal(failedLogin.response.status, 401);
assert.equal(failedLogin.body.code, 'INVALID_CREDENTIALS');

const customerToken = await login('/api/v1/portal/auth/login', customerLogin, customerPassword, 'qa-portal-login-success');
const staffToken = await login('/api/v1/operator/auth/login', operatorLogin, operatorPassword, 'qa-staff-login-for-cross-context');

const staffOnPortal = await jsonRequest('/api/v1/portal/me', {
  headers: { authorization: `Bearer ${staffToken}` },
});
assert.equal(staffOnPortal.response.status, 401);
assert.equal(staffOnPortal.body.code, 'AUTHENTICATION_CONTEXT_MISMATCH');

const customerOnStaff = await jsonRequest('/api/v1/operator/claims', {
  headers: { authorization: `Bearer ${customerToken}` },
});
assert.equal(customerOnStaff.response.status, 401);
assert.equal(customerOnStaff.body.code, 'AUTHENTICATION_CONTEXT_MISMATCH');

const auth = { authorization: `Bearer ${customerToken}` };
const self = await jsonRequest('/api/v1/portal/me', { headers: auth });
assert.equal(self.response.status, 200);
assert.equal(self.body.customerId, '91000000-0000-4000-8000-000000000001');

const policies = await jsonRequest('/api/v1/portal/policies', { headers: auth });
assert.equal(policies.response.status, 200);
assert.equal(policies.body.totalItems, 1);
assert.equal(policies.body.items[0].policyId, '92000000-0000-4000-8000-000000000001');

const claims = await jsonRequest('/api/v1/portal/claims', { headers: auth });
assert.equal(claims.response.status, 200);
assert.equal(claims.body.totalItems, 1);
assert.equal(claims.body.items[0].claimId, '94000000-0000-4000-8000-000000000001');

const claim = await jsonRequest('/api/v1/portal/claims/94000000-0000-4000-8000-000000000001', { headers: auth });
assert.equal(claim.response.status, 200);
assert.equal(claim.body.claimId, '94000000-0000-4000-8000-000000000001');
assert.deepEqual(claim.body.outstandingActions, []);

const missing = await jsonRequest('/api/v1/portal/claims/94000000-0000-4000-8000-000000000099', { headers: auth });
assert.equal(missing.response.status, 404);
assert.equal(missing.body.code, 'RESOURCE_NOT_FOUND');

const invalidEvidence = new FormData();
invalidEvidence.append('evidence', new Blob([Buffer.from('not really a jpeg')], { type: 'image/jpeg' }), 'fake.jpg');
const invalidUpload = await jsonRequest('/api/v1/portal/claims/94000000-0000-4000-8000-000000000001/evidence', {
  method: 'POST',
  headers: { ...auth, 'idempotency-key': 'qa-portal-invalid-evidence-0001' },
  body: invalidEvidence,
});
assert.equal(invalidUpload.response.status, 422);
assert.equal(invalidUpload.body.code, 'EVIDENCE_VALIDATION_FAILED');

const evidenceBytes = Buffer.from('%PDF-1.7\nsynthetic PostgreSQL Customer Portal evidence\n');
const form = new FormData();
form.append('evidence', new Blob([evidenceBytes], { type: 'application/pdf' }), '../../qa-portal-evidence.pdf');
const upload = await jsonRequest('/api/v1/portal/claims/94000000-0000-4000-8000-000000000001/evidence', {
  method: 'POST',
  headers: { ...auth, 'idempotency-key': 'qa-portal-evidence-idempotency-0001', 'x-request-id': 'qa-portal-evidence-success' },
  body: form,
});
assert.equal(upload.response.status, 201, JSON.stringify(upload.body));
assert.equal(upload.body.claimId, '94000000-0000-4000-8000-000000000001');
assert.equal(upload.body.evidence.length, 1);
assert.equal(upload.body.evidence[0].mediaType, 'application/pdf');

const replayForm = new FormData();
replayForm.append('evidence', new Blob([evidenceBytes], { type: 'application/pdf' }), 'renamed.pdf');
const replay = await jsonRequest('/api/v1/portal/claims/94000000-0000-4000-8000-000000000001/evidence', {
  method: 'POST',
  headers: { ...auth, 'idempotency-key': 'qa-portal-evidence-idempotency-0001' },
  body: replayForm,
});
assert.equal(replay.response.status, 201);
assert.equal(replay.response.headers.get('idempotency-replayed'), 'true');
assert.deepEqual(replay.body, upload.body);

const reusedForm = new FormData();
reusedForm.append('evidence', new Blob([Buffer.from('%PDF-1.7\ndifferent synthetic content\n')], { type: 'application/pdf' }), 'different.pdf');
const reused = await jsonRequest('/api/v1/portal/claims/94000000-0000-4000-8000-000000000001/evidence', {
  method: 'POST',
  headers: { ...auth, 'idempotency-key': 'qa-portal-evidence-idempotency-0001' },
  body: reusedForm,
});
assert.equal(reused.response.status, 409);
assert.equal(reused.body.code, 'IDEMPOTENCY_KEY_REUSED');

const communications = await jsonRequest('/api/v1/portal/communications', { headers: auth });
assert.equal(communications.response.status, 200);
assert.equal(communications.body.totalItems, 0);

console.log(JSON.stringify({
  event: 'CUSTOMER_PORTAL_RUNTIME_QA_PASSED',
  customerId: self.body.customerId,
  claimId: claim.body.claimId,
  evidenceId: upload.body.evidence[0].evidenceId,
}));
