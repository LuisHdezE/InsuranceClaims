import assert from 'node:assert/strict';
import { createApiClient } from '../apps/web/src/api/client';
import { createClaim, verifyPolicyVehicle } from '../apps/web/src/api/claims';
import type { ApiFailure, ClaimDraft } from '../apps/web/src/api/types';

const baseURL = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const client = createApiClient(baseURL);

const verification = await verifyPolicyVehicle({
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
}, client);

assert.equal(verification.data.eligible, true);
assert.equal(verification.data.policyReference, 'SYN-POL-001');
assert.equal(verification.data.vehicleReference, 'SYN-VEH-001');
assert.ok(verification.requestId);

const draft: ClaimDraft = {
  eventType: 'Synthetic collision event',
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  locationText: 'Synthetic QA location',
  description: 'Synthetic browser-client runtime integration claim.',
  evidence: [],
};

const idempotencyKey = `web-intake-${crypto.randomUUID()}`;
const created = await createClaim(verification.data, draft, idempotencyKey, client);
assert.equal(created.data.status, 'RECEIVED');
assert.ok(created.data.trackingCode);
assert.ok(created.requestId);
assert.equal(created.idempotencyReplayed, false);

const replay = await createClaim(verification.data, draft, idempotencyKey, client);
assert.equal(replay.data.trackingCode, created.data.trackingCode);
assert.equal(replay.data.status, 'RECEIVED');
assert.equal(replay.idempotencyReplayed, true);

let rejectedInactive = false;
try {
  await verifyPolicyVehicle({
    policyReference: 'SYN-POL-003',
    vehicleReference: 'SYN-VEH-003',
  }, client);
} catch (error) {
  const failure = error as ApiFailure;
  rejectedInactive = failure.problem?.status === 422;
  assert.ok(failure.requestId);
}
assert.equal(rejectedInactive, true, 'inactive synthetic policy/vehicle must be rejected by authoritative API');

console.log(JSON.stringify({
  event: 'WEB_DIGITAL_CLAIM_INTAKE_RUNTIME_PASS',
  operationIds: ['verifyPolicyVehicle', 'createClaim'],
  trackingCodeCreated: Boolean(created.data.trackingCode),
  idempotencyReplay: replay.idempotencyReplayed,
  inactiveEligibilityRejected: rejectedInactive,
}));
