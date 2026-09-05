import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError, permissionsForRole } from '@insurance/application';
import { createMemoryRuntime } from '@insurance/infrastructure';

const base = {
  idempotencyKey: '1234567890abcdef-demo-key', policyReference: 'SYN-POL-001', vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic incident', occurredAt: '2026-09-05T12:00:00Z', locationText: 'Synthetic location',
  description: 'Synthetic description', evidence: [],
};

test('submit is idempotent and public tracking is safe', async () => {
  const runtime = await createMemoryRuntime();
  const first = await runtime.application.submitClaim(base, { requestId: 'req-1' });
  const replay = await runtime.application.submitClaim(base, { requestId: 'req-2' });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.response.trackingCode, replay.response.trackingCode);
  const tracked = await runtime.application.trackClaim({ trackingCode: first.response.trackingCode, policyReference: base.policyReference });
  assert.equal(tracked.status, 'RECEIVED');
  await assert.rejects(() => runtime.application.trackClaim({ trackingCode: first.response.trackingCode, policyReference: 'wrong' }), (error: unknown) => error instanceof ApplicationError && error.code === 'CLAIM_NOT_FOUND');
});

test('operator authentication and transition create durable audit/history', async () => {
  const runtime = await createMemoryRuntime();
  const created = await runtime.application.submitClaim({ ...base, idempotencyKey: 'abcdef1234567890-transition' });
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' }, { requestId: 'login-1' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  assert.deepEqual(actor.permissions, permissionsForRole('CLAIMS_OPERATOR'));
  const page = await runtime.application.listClaims({}, actor);
  assert.equal(page.totalItems, 1);
  const claimId = page.items[0]!.claimId;
  const transitioned = await runtime.application.transitionClaimStatus({ claimId, expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' }, actor, { requestId: 'transition-1' });
  assert.equal(transitioned.status, 'UNDER_REVIEW');
  const detail = await runtime.application.getClaimDetail(claimId, actor);
  assert.equal(detail.history.at(-1)?.toStatus, 'UNDER_REVIEW');
  assert.ok(detail.auditEvents.some((event) => event.eventCode === 'CLAIM_STATE_TRANSITIONED'));
  const tracked = await runtime.application.trackClaim({ trackingCode: created.response.trackingCode, policyReference: base.policyReference });
  assert.equal(tracked.status, 'UNDER_REVIEW');
});
