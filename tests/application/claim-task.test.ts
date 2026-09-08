import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from '@insurance/application';
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
  assert.equal(tasks.items[0]?.version, 1);

  const completed = await runtime.tasks.completeTask({ taskId: tasks.items[0]!.taskId, expectedStatus: 'OPEN' }, actor);
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(completed.completedById, actor.operatorId);
  assert.equal(completed.version, 2);

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

test('R3 ClaimTask create/update/cancel is idempotent, versioned and history-backed', async () => {
  const runtime = await createMemoryRuntime();
  const submitted = await runtime.application.submitClaim({ ...claimInput, idempotencyKey: 'claim-task-r3-parent-123456' }, { requestId: 'task-r3-parent' });
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);

  const claims = await runtime.application.listClaims({ page: 1, pageSize: 25 }, actor);
  const claimId = claims.items[0]!.claimId;
  const idempotencyKey = 'task-create-r3-1234567890';
  const createInput = {
    claimId,
    idempotencyKey,
    type: 'CUSTOMER_FOLLOWUP' as const,
    title: 'Contactar cliente',
    description: 'Synthetic follow-up task.',
    priority: 'HIGH' as const,
    queue: 'CLAIMS' as const,
    assignedOperatorId: actor.operatorId,
    dueAt: '2026-09-10T12:00:00Z',
  };

  const created = await runtime.tasks.createTask(createInput, actor, { requestId: 'task-create-1' });
  assert.equal(created.replayed, false);
  assert.equal(created.response.version, 1);
  assert.equal(created.response.status, 'OPEN');

  const replay = await runtime.tasks.createTask(createInput, actor, { requestId: 'task-create-2' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.response.taskId, created.response.taskId);

  await assert.rejects(
    () => runtime.tasks.createTask({ ...createInput, title: 'Different title' }, actor),
    (error: unknown) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );

  const fetched = await runtime.tasks.getTask(created.response.taskId, actor);
  assert.equal(fetched.taskId, created.response.taskId);
  assert.equal(fetched.priority, 'HIGH');

  const updated = await runtime.tasks.updateTask({
    taskId: created.response.taskId,
    expectedVersion: 1,
    priority: 'NORMAL',
    dueAt: null,
  }, actor, { requestId: 'task-update-1' });
  assert.equal(updated.version, 2);
  assert.equal(updated.priority, 'NORMAL');
  assert.equal(updated.dueAt, null);

  await assert.rejects(
    () => runtime.tasks.updateTask({ taskId: created.response.taskId, expectedVersion: 1, priority: 'HIGH' }, actor),
    (error: unknown) => error instanceof ClaimTaskApplicationError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );

  const cancelled = await runtime.tasks.cancelTask({
    taskId: created.response.taskId,
    expectedVersion: 2,
    reason: 'NO_LONGER_REQUIRED',
  }, actor, { requestId: 'task-cancel-1' });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.version, 3);
  assert.equal(cancelled.cancellationReason, 'NO_LONGER_REQUIRED');

  const history = await runtime.tasks.getTaskHistory(created.response.taskId, actor);
  assert.deepEqual(history.map((item) => item.eventType), ['CREATED', 'UPDATED', 'CANCELLED']);
  assert.equal(history[0]?.correlationId, 'task-create-1');
  assert.equal(history[2]?.correlationId, 'task-cancel-1');

  const tracked = await runtime.application.trackClaim({ trackingCode: submitted.response.trackingCode, policyReference: claimInput.policyReference });
  assert.equal(tracked.status, 'RECEIVED');
});
