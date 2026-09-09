import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InvalidRenewalCaseTransitionError,
  RenewalCase,
  RenewalCaseVersionConflictError,
} from '@insurance/domain';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  customerId: '22222222-2222-4222-8222-222222222222',
  policyId: '33333333-3333-4333-8333-333333333333',
  createdAt: new Date('2026-09-09T12:00:00.000Z'),
  updatedAt: new Date('2026-09-09T12:00:00.000Z'),
};

test('RenewalCase starts OPEN and exposes only approved terminal transitions', () => {
  const aggregate = RenewalCase.create(base);
  assert.equal(aggregate.snapshot().status, 'OPEN');
  assert.equal(aggregate.snapshot().version, 1);
  assert.deepEqual(aggregate.allowedTransitions(), ['COMPLETED', 'CANCELLED']);
});

test('RenewalCase completes with optimistic version increment', () => {
  const aggregate = RenewalCase.create(base);
  aggregate.transition('COMPLETED', 1, new Date('2026-09-09T13:00:00.000Z'));
  const snapshot = aggregate.snapshot();
  assert.equal(snapshot.status, 'COMPLETED');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.completedAt?.toISOString(), '2026-09-09T13:00:00.000Z');
  assert.equal(snapshot.cancelledAt, null);
  assert.deepEqual(aggregate.allowedTransitions(), []);
});

test('RenewalCase cancels with optimistic version increment', () => {
  const aggregate = RenewalCase.create(base);
  aggregate.transition('CANCELLED', 1, new Date('2026-09-09T13:30:00.000Z'));
  const snapshot = aggregate.snapshot();
  assert.equal(snapshot.status, 'CANCELLED');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.cancelledAt?.toISOString(), '2026-09-09T13:30:00.000Z');
  assert.equal(snapshot.completedAt, null);
});

test('RenewalCase rejects stale expectedVersion', () => {
  const aggregate = RenewalCase.create(base);
  assert.throws(
    () => aggregate.transition('COMPLETED', 2, new Date('2026-09-09T13:00:00.000Z')),
    RenewalCaseVersionConflictError,
  );
});

test('RenewalCase terminal state cannot transition again', () => {
  const aggregate = RenewalCase.create(base);
  aggregate.transition('COMPLETED', 1, new Date('2026-09-09T13:00:00.000Z'));
  assert.throws(
    () => aggregate.transition('CANCELLED', 2, new Date('2026-09-09T14:00:00.000Z')),
    InvalidRenewalCaseTransitionError,
  );
});
