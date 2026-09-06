import assert from 'node:assert/strict';
import { createApiClient } from '../apps/web/src/api/client';
import { createClaim, trackClaim, verifyPolicyVehicle } from '../apps/web/src/api/claims';
import type { ApiFailure, ClaimDraft } from '../apps/web/src/api/types';

const baseURL = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const client = createApiClient(baseURL);

const verification = await verifyPolicyVehicle({
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
}, client);

const draft: ClaimDraft = {
  eventType: 'Synthetic tracking QA event',
  occurredAt: new Date(Date.now() - 120_000).toISOString(),
  locationText: 'Synthetic tracking QA location',
  description: 'Synthetic claim created to verify the customer tracking web slice.',
  evidence: [],
};

const created = await createClaim(
  verification.data,
  draft,
  `tracking-${crypto.randomUUID()}`,
  client,
);

const proof = {
  trackingCode: created.data.trackingCode,
  policyReference: verification.data.policyReference,
};

const tracked = await trackClaim(proof, client);
assert.equal(tracked.data.trackingCode, created.data.trackingCode);
assert.equal(tracked.data.status, 'RECEIVED');
assert.equal(tracked.data.summary.vehicleReference, verification.data.vehicleReference);
assert.equal(tracked.data.summary.eventType, draft.eventType);
assert.ok(Array.isArray(tracked.data.timeline));
assert.ok(Array.isArray(tracked.data.nextSteps));
assert.ok(tracked.requestId);

const serializedProjection = JSON.stringify(tracked.data).toLowerCase();
for (const forbidden of ['audit', 'operator', 'password', 'permission', 'internalnote', 'evidencepath']) {
  assert.equal(serializedProjection.includes(forbidden), false, `customer-safe tracking projection leaked marker: ${forbidden}`);
}
const customerSafeProjection = true;

let invalidProofCollapsedTo404 = false;
try {
  await trackClaim({
    trackingCode: created.data.trackingCode,
    policyReference: 'SYN-POL-NOT-THE-CLAIM',
  }, client);
} catch (error) {
  const failure = error as ApiFailure;
  invalidProofCollapsedTo404 = failure.problem?.status === 404 && failure.problem?.code === 'CLAIM_NOT_FOUND';
  assert.ok(failure.requestId);
}
assert.equal(invalidProofCollapsedTo404, true, 'invalid proof pair must collapse to 404 CLAIM_NOT_FOUND');

const refreshed = await trackClaim(proof, client);
assert.equal(refreshed.data.trackingCode, tracked.data.trackingCode);
assert.ok(refreshed.requestId);

console.log(JSON.stringify({
  event: 'TRACKING_RUNTIME_PASS',
  operationIds: ['trackClaim'],
  customerSafeProjection,
  invalidProofCollapsedTo404,
  explicitRefreshUsesCanonicalApi: refreshed.data.trackingCode === tracked.data.trackingCode,
  requestIdObserved: Boolean(tracked.requestId && refreshed.requestId),
}));
