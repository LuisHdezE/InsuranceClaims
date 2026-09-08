import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ClaimTask,
  ClaimTaskStateConflictError,
  ClaimTaskVersionConflictError,
  InvalidClaimTaskStateError,
} from '@insurance/domain/claim-task';

function createTask() {
  return ClaimTask.create({
    id: '00000000-0000-4000-8000-000000000201',
    claimId: '00000000-0000-4000-8000-000000000101',
    type: 'CLAIM_REVIEW',
    title: 'Revisar siniestro reportado',
    description: null,
    priority: 'NORMAL',
    queue: 'CLAIMS',
    assignedOperatorId: null,
    dueAt: null,
    createdByType: 'SYSTEM',
    createdById: null,
    sourceKey: 'claim:initial:review',
    correlationId: 'req-123',
    createdAt: new Date('2026-09-07T22:00:00Z'),
  });
}

test('ClaimTask starts OPEN at version 1 and completes once without changing unrelated Claim state', () => {
  const task = createTask();
  const created = task.snapshot();
  assert.equal(created.status, 'OPEN');
  assert.equal(created.version, 1);
  assert.equal(created.updatedAt.toISOString(), '2026-09-07T22:00:00.000Z');

  task.complete('OPEN', '00000000-0000-4000-8000-000000000001', new Date('2026-09-07T22:05:00Z'));
  const snapshot = task.snapshot();
  assert.equal(snapshot.status, 'COMPLETED');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.completedById, '00000000-0000-4000-8000-000000000001');
  assert.equal(snapshot.completedAt?.toISOString(), '2026-09-07T22:05:00.000Z');

  assert.throws(
    () => task.complete('OPEN', '00000000-0000-4000-8000-000000000001', new Date('2026-09-07T22:06:00Z')),
    ClaimTaskStateConflictError,
  );
});

test('ClaimTask update uses optimistic versioning and records assignment priority and due date', () => {
  const task = createTask();
  task.update(1, {
    assignedOperatorId: '00000000-0000-4000-8000-000000000001',
    priority: 'HIGH',
    dueAt: new Date('2026-09-10T12:00:00Z'),
  }, new Date('2026-09-08T09:00:00Z'));

  const snapshot = task.snapshot();
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.assignedOperatorId, '00000000-0000-4000-8000-000000000001');
  assert.equal(snapshot.priority, 'HIGH');
  assert.equal(snapshot.dueAt?.toISOString(), '2026-09-10T12:00:00.000Z');

  assert.throws(
    () => task.update(1, { priority: 'NORMAL' }, new Date('2026-09-08T09:01:00Z')),
    ClaimTaskVersionConflictError,
  );
});

test('ClaimTask update preserves omitted optional fields while explicit null clears them', () => {
  const task = createTask();
  task.update(1, {
    assignedOperatorId: '00000000-0000-4000-8000-000000000001',
    dueAt: new Date('2026-09-10T12:00:00Z'),
  }, new Date('2026-09-08T09:00:00Z'));

  task.update(2, {
    assignedOperatorId: undefined,
    priority: 'HIGH',
    dueAt: undefined,
  }, new Date('2026-09-08T09:01:00Z'));

  let snapshot = task.snapshot();
  assert.equal(snapshot.assignedOperatorId, '00000000-0000-4000-8000-000000000001');
  assert.equal(snapshot.dueAt?.toISOString(), '2026-09-10T12:00:00.000Z');
  assert.equal(snapshot.priority, 'HIGH');

  task.update(3, {
    assignedOperatorId: null,
    dueAt: null,
  }, new Date('2026-09-08T09:02:00Z'));

  snapshot = task.snapshot();
  assert.equal(snapshot.assignedOperatorId, null);
  assert.equal(snapshot.dueAt, null);
});

test('ClaimTask cancellation is terminal and guarded by expected version', () => {
  const task = createTask();
  task.cancel(1, '00000000-0000-4000-8000-000000000001', 'NO_LONGER_REQUIRED', new Date('2026-09-08T10:00:00Z'));

  const snapshot = task.snapshot();
  assert.equal(snapshot.status, 'CANCELLED');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.cancellationReason, 'NO_LONGER_REQUIRED');
  assert.equal(snapshot.cancelledById, '00000000-0000-4000-8000-000000000001');

  assert.throws(
    () => task.update(2, { priority: 'HIGH' }, new Date('2026-09-08T10:01:00Z')),
    InvalidClaimTaskStateError,
  );
});
