import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaimTaskApplicationError } from '@insurance/application/claim-tasks';
import { createMemoryRuntime } from '@insurance/infrastructure';

const claimInput = {
  idempotencyKey: 'claim-task-1234567890abcdef',
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic task scenario',
  occurredAt: '2026-09-07T18:00:00Z',
  locationText: 'Synthetic location',
  description: 'Synthetic description for ClaimTask tests.',
  evidence: [],
};

test('claim submission creates one idempotent review task and task completion does not transition the Claim', async () => {
  const runtime = await createMemoryRuntime();
  const first = await runtime.application.submitClaim(claimInput, { requestId: 'task-submit-1' });
  const replay = await runtime.application.submitClaim(claimInput, { requestId: 'task-submit-2' });
  assert.equal(first.response.trackingCode, replay.response.trackingCode);

  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);

  const tasks = await runtime.tasks.listTasks({}, actor);
  assert.equal(tasks.totalItems, 1);
  assert.equal(tasks.items[0]?.type, 'CLAIM_REVIEW');
  assert.equal(tasks.items[0]?.status, 'OPEN');
  assert.equal(tasks.items[0]?.priority, 'NORMAL');
  assert.equal(tasks.items[0]?.dueAt, null);

  const completed = await runtime.tasks.completeTask({ taskId: tasks.items[0]!.taskId, expectedStatus: 'OPEN' }, actor);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.completedById, actor.operatorId);

  await assert.rejects(
    () => runtime.tasks.completeTask({ taskId: tasks.items[0]!.taskId, expectedStatus: 'OPEN' }, actor),
    (error: unknown) => error instanceof ClaimTaskApplicationError && error.code === 'TASK_STATE_CONFLICT',
  );

  const tracked = await runtime.application.trackClaim({
    trackingCode: first.response.trackingCode,
    policyReference: claimInput.policyReference,
  });
  assert.equal(tracked.status, 'RECEIVED');
});
