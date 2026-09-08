import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRuntime } from '@insurance/infrastructure';

const claimBase = {
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic evidence attention scenario',
  occurredAt: '2026-09-07T18:00:00Z',
  locationText: 'Synthetic evidence attention location',
  description: 'Synthetic description for evidence attention tests.',
};

async function actorFor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

test('EvidenceAttention derives NO_EVIDENCE without inventing review work', async () => {
  const runtime = await createMemoryRuntime();
  const submitted = await runtime.application.submitClaim({
    ...claimBase,
    idempotencyKey: 'evidence-attention-none-1234567890',
    evidence: [],
  });
  const actor = await actorFor(runtime);
  const claims = await runtime.application.listClaims({ status: 'RECEIVED' }, actor);
  const claimId = claims.items.find((item) => item.trackingCode === submitted.response.trackingCode)?.claimId;
  assert.ok(claimId);

  const attention = await runtime.evidenceAttention.getClaimEvidenceAttention(claimId, actor);
  assert.equal(attention.attentionState, 'NO_EVIDENCE');
  assert.equal(attention.evidenceCount, 0);
  assert.equal(attention.reviewTasks.length, 0);
  assert.equal(attention.openReviewTaskCount, 0);
});

test('EvidenceAttention moves from PENDING_REVIEW to REVIEWED through ClaimTask only', async () => {
  const runtime = await createMemoryRuntime();
  const submitted = await runtime.application.submitClaim({
    ...claimBase,
    idempotencyKey: 'evidence-attention-review-1234567890',
    evidence: [{ bytes: new Uint8Array([137, 80, 78, 71]), mediaType: 'image/png', originalName: 'proof.png' }],
  });
  const actor = await actorFor(runtime);
  const claims = await runtime.application.listClaims({ status: 'RECEIVED' }, actor);
  const claimId = claims.items.find((item) => item.trackingCode === submitted.response.trackingCode)?.claimId;
  assert.ok(claimId);

  const pending = await runtime.evidenceAttention.getClaimEvidenceAttention(claimId, actor);
  assert.equal(pending.attentionState, 'PENDING_REVIEW');
  assert.equal(pending.evidenceCount, 1);
  assert.equal(pending.reviewTasks.length, 1);
  assert.equal(pending.reviewTasks[0]?.status, 'OPEN');
  assert.equal(pending.openReviewTaskCount, 1);

  await runtime.tasks.completeTask({ taskId: pending.reviewTasks[0]!.taskId, expectedStatus: 'OPEN' }, actor);

  const reviewed = await runtime.evidenceAttention.getClaimEvidenceAttention(claimId, actor);
  assert.equal(reviewed.attentionState, 'REVIEWED');
  assert.equal(reviewed.openReviewTaskCount, 0);
  assert.equal(reviewed.completedReviewTaskCount, 1);
  assert.equal(reviewed.reviewTasks[0]?.status, 'COMPLETED');
  assert.ok(reviewed.reviewTasks[0]?.completedAt);

  const detail = await runtime.application.getClaimDetail(claimId, actor);
  assert.equal(detail.status, 'RECEIVED', 'evidence review completion must not mutate Claim lifecycle state');
});
