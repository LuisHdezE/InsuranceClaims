import assert from 'node:assert/strict';
import { File } from 'node:buffer';
import { createApiClient } from '../apps/web/src/api/client';
import {
  authenticateOperator,
  createClaim,
  downloadClaimEvidence,
  getClaimDetail,
  listClaims,
  transitionClaimStatus,
  verifyPolicyVehicle,
} from '../apps/web/src/api/claims';
import type { ApiFailure, ClaimDraft } from '../apps/web/src/api/types';

const baseURL = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const operatorPassword = process.env.QA_OPERATOR_PASSWORD;
if (!operatorPassword) throw new Error('QA_OPERATOR_PASSWORD is required');
const client = createApiClient(baseURL);

const verification = await verifyPolicyVehicle({
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
}, client);

const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zx9sAAAAASUVORK5CYII=', 'base64');
const evidence = new File([pngBytes], 'synthetic-backoffice-proof.png', { type: 'image/png' });
const draft: ClaimDraft = {
  eventType: 'Synthetic backoffice QA event',
  occurredAt: new Date(Date.now() - 180_000).toISOString(),
  locationText: 'Synthetic backoffice QA location',
  description: 'Synthetic claim created to exercise the protected backoffice web slice.',
  evidence: [evidence as unknown as File],
};

const created = await createClaim(verification.data, draft, `backoffice-${crypto.randomUUID()}`, client);

const authenticated = await authenticateOperator({ login: operatorLogin, password: operatorPassword }, client);
assert.equal(authenticated.data.tokenType, 'Bearer');
assert.equal(authenticated.data.expiresIn, 900);
assert.equal(authenticated.data.operator.role, 'CLAIMS_OPERATOR');
assert.ok(authenticated.data.accessToken.length > 20);
assert.ok(authenticated.requestId);
const token = authenticated.data.accessToken;

let protectedReadRejectedWithoutValidToken = false;
try {
  await listClaims({ page: 1, pageSize: 20 }, 'not-a-valid-token', client);
} catch (error) {
  const failure = error as ApiFailure;
  protectedReadRejectedWithoutValidToken = failure.problem?.status === 401 && failure.problem?.code === 'AUTHENTICATION_REQUIRED';
  assert.ok(failure.requestId);
}
assert.equal(protectedReadRejectedWithoutValidToken, true, 'protected list must reject an invalid bearer token');

const claims = await listClaims({ page: 1, pageSize: 20, status: 'RECEIVED' }, token, client);
const summary = claims.data.items.find((item) => item.trackingCode === created.data.trackingCode);
assert.ok(summary, 'created claim must appear in authorized filtered claims list');
assert.ok(claims.requestId);

const detail = await getClaimDetail(summary.claimId, token, client);
assert.equal(detail.data.claimId, summary.claimId);
assert.equal(detail.data.status, 'RECEIVED');
assert.ok(detail.data.allowedTransitions.includes('UNDER_REVIEW'));
assert.equal(detail.data.evidence.length, 1);
assert.ok(detail.requestId);

const downloaded = await downloadClaimEvidence(summary.claimId, detail.data.evidence[0].evidenceId, token, client);
assert.ok(downloaded.data.bytes.byteLength > 0);
assert.equal(downloaded.data.mediaType, 'image/png');
assert.ok(downloaded.requestId);
const evidenceDownloadProtected = true;

const transitioned = await transitionClaimStatus(summary.claimId, {
  expectedFromStatus: detail.data.status,
  toStatus: 'UNDER_REVIEW',
}, token, client);
assert.equal(transitioned.data.fromStatus, 'RECEIVED');
assert.equal(transitioned.data.status, 'UNDER_REVIEW');
assert.ok(transitioned.requestId);
const transitionCommitted = true;

let staleTransitionConflict = false;
try {
  await transitionClaimStatus(summary.claimId, {
    expectedFromStatus: 'RECEIVED',
    toStatus: 'OBSERVED',
  }, token, client);
} catch (error) {
  const failure = error as ApiFailure;
  staleTransitionConflict = failure.problem?.status === 409 && failure.problem?.code === 'CLAIM_STATE_CONFLICT';
  assert.ok(failure.requestId);
}
assert.equal(staleTransitionConflict, true, 'stale expectedFromStatus must produce CLAIM_STATE_CONFLICT');

const refreshed = await getClaimDetail(summary.claimId, token, client);
assert.equal(refreshed.data.status, 'UNDER_REVIEW');
assert.ok(refreshed.data.history.some((entry) => entry.toStatus === 'UNDER_REVIEW'));
assert.ok(refreshed.data.auditEvents.some((event) => event.eventCode === 'CLAIM_STATE_TRANSITIONED'));

console.log(JSON.stringify({
  event: 'BACKOFFICE_RUNTIME_PASS',
  operationIds: ['authenticateOperator', 'listClaims', 'getClaimDetail', 'downloadClaimEvidence', 'transitionClaimStatus'],
  tokenLifetimeSeconds: authenticated.data.expiresIn,
  protectedReadRejectedWithoutValidToken,
  evidenceDownloadProtected,
  transitionCommitted,
  staleTransitionConflict,
  authoritativeRefreshStatus: refreshed.data.status,
  requestIdObserved: Boolean(authenticated.requestId && claims.requestId && detail.requestId && transitioned.requestId && refreshed.requestId),
}));
