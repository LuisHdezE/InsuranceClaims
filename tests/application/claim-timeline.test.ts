import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRuntime } from '@insurance/infrastructure';

const evidenceBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const claimInput = {
  idempotencyKey: 'claim-timeline-1234567890abcdef',
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic timeline scenario',
  occurredAt: '2026-09-07T18:00:00Z',
  locationText: 'Synthetic timeline location',
  description: 'Synthetic description for Claim Timeline tests.',
  evidence: [{ bytes: evidenceBytes, mediaType: 'image/png', originalName: 'timeline-proof.png' }],
};

test('ClaimTimeline projects durable claim, evidence and task facts without exposing audit events', async () => {
  const runtime = await createMemoryRuntime();
  const submitted = await runtime.application.submitClaim(claimInput, { requestId: 'timeline-submit-1' });
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);

  const claims = await runtime.application.listClaims({ status: 'RECEIVED' }, actor);
  const claimId = claims.items.find((item) => item.trackingCode === submitted.response.trackingCode)?.claimId;
  assert.ok(claimId);

  const initial = await runtime.timeline.listClaimTimeline(claimId, actor);
  assert.equal(initial.claimId, claimId);
  assert.equal(initial.trackingCode, submitted.response.trackingCode);
  assert.deepEqual(
    initial.events.map((event) => event.eventType),
    ['CLAIM_REPORTED', 'EVIDENCE_ADDED', 'TASK_CREATED', 'TASK_CREATED'],
  );
  assert.equal(initial.events.filter((event) => event.eventType === 'TASK_CREATED').length, 2);
  assert.ok(initial.events.every((event) => !('eventCode' in event)));

  const taskPage = await runtime.tasks.listTasks({ status: 'OPEN', type: 'EVIDENCE_REVIEW', claimId }, actor);
  assert.equal(taskPage.totalItems, 1);
  await runtime.tasks.completeTask({ taskId: taskPage.items[0]!.taskId, expectedStatus: 'OPEN' }, actor);

  await runtime.application.transitionClaimStatus({
    claimId,
    expectedFromStatus: 'RECEIVED',
    toStatus: 'UNDER_REVIEW',
  }, actor, { requestId: 'timeline-transition-1' });

  const updated = await runtime.timeline.listClaimTimeline(claimId, actor);
  assert.equal(updated.events.filter((event) => event.eventType === 'TASK_COMPLETED').length, 1);
  assert.equal(updated.events.filter((event) => event.eventType === 'STATUS_CHANGED').length, 1);
  const statusEvent = updated.events.find((event) => event.eventType === 'STATUS_CHANGED');
  assert.ok(statusEvent && statusEvent.fromStatus === 'RECEIVED' && statusEvent.toStatus === 'UNDER_REVIEW');

  const timestamps = updated.events.map((event) => Date.parse(event.occurredAt));
  assert.deepEqual(timestamps, [...timestamps].sort((left, right) => left - right));

  const publicTracking = await runtime.application.trackClaim({
    trackingCode: submitted.response.trackingCode,
    policyReference: claimInput.policyReference,
  });
  assert.deepEqual(publicTracking.timeline.map((entry) => entry.status), ['RECEIVED', 'UNDER_REVIEW']);
});
