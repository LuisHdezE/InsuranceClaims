import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaimTask, ClaimTaskStateConflictError } from '@insurance/domain/claim-task';

test('ClaimTask completes once and records the operator without changing unrelated claim state', () => {
  const createdAt = new Date('2026-09-07T22:00:00Z');
  const task = ClaimTask.create({
    id: '00000000-0000-4000-8000-000000000201',
    claimId: '00000000-0000-4000-8000-000000000101',
    type: 'CLAIM_REVIEW',
    title: 'Revisar siniestro reportado',
    priority: 'NORMAL',
    queue: 'CLAIMS',
    assignedOperatorId: null,
    dueAt: null,
    createdByType: 'SYSTEM',
    createdById: null,
    sourceKey: 'claim:initial:review',
    correlationId: 'req-123',
    createdAt,
  });

  task.complete('OPEN', '00000000-0000-4000-8000-000000000001', new Date('2026-09-07T22:05:00Z'));
  const snapshot = task.snapshot();
  assert.equal(snapshot.status, 'COMPLETED');
  assert.equal(snapshot.completedById, '00000000-0000-4000-8000-000000000001');
  assert.equal(snapshot.completedAt?.toISOString(), '2026-09-07T22:05:00.000Z');

  assert.throws(
    () => task.complete('OPEN', '00000000-0000-4000-8000-000000000001', new Date('2026-09-07T22:06:00Z')),
    ClaimTaskStateConflictError,
  );
});
