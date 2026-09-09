import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CollectionCase,
  CollectionCaseVersionConflictError,
  InvalidCollectionCaseTransitionError,
} from '@insurance/domain';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  customerId: '22222222-2222-4222-8222-222222222222',
  policyId: '33333333-3333-4333-8333-333333333333',
  paymentState: 'DEMO_STATE_A',
  createdAt: new Date('2026-09-09T12:00:00.000Z'),
  updatedAt: new Date('2026-09-09T12:00:00.000Z'),
};

test('CollectionCase starts OPEN with only approved terminal transitions', () => {
  const aggregate = CollectionCase.create(base);
  assert.equal(aggregate.snapshot().status, 'OPEN');
  assert.equal(aggregate.snapshot().paymentState, 'DEMO_STATE_A');
  assert.equal(aggregate.snapshot().version, 1);
  assert.deepEqual(aggregate.allowedTransitions(), ['COMPLETED', 'CANCELLED']);
});

test('CollectionCase payment state changes with optimistic versioning', () => {
  const aggregate = CollectionCase.create(base);
  const change = aggregate.changePaymentState('DEMO_STATE_B', 1, new Date('2026-09-09T12:30:00.000Z'));
  assert.deepEqual(change, { fromPaymentState: 'DEMO_STATE_A', toPaymentState: 'DEMO_STATE_B' });
  assert.equal(aggregate.snapshot().paymentState, 'DEMO_STATE_B');
  assert.equal(aggregate.snapshot().version, 2);
});

test('CollectionCase rejects stale payment-state version', () => {
  const aggregate = CollectionCase.create(base);
  assert.throws(
    () => aggregate.changePaymentState('DEMO_STATE_B', 2, new Date('2026-09-09T12:30:00.000Z')),
    CollectionCaseVersionConflictError,
  );
});

test('CollectionCase completes with optimistic version increment', () => {
  const aggregate = CollectionCase.create(base);
  aggregate.transition('COMPLETED', 1, new Date('2026-09-09T13:00:00.000Z'));
  const snapshot = aggregate.snapshot();
  assert.equal(snapshot.status, 'COMPLETED');
  assert.equal(snapshot.version, 2);
  assert.equal(snapshot.completedAt?.toISOString(), '2026-09-09T13:00:00.000Z');
  assert.equal(snapshot.cancelledAt, null);
  assert.deepEqual(aggregate.allowedTransitions(), []);
});

test('CollectionCase terminal lifecycle cannot transition again', () => {
  const aggregate = CollectionCase.create(base);
  aggregate.transition('COMPLETED', 1, new Date('2026-09-09T13:00:00.000Z'));
  assert.throws(
    () => aggregate.transition('CANCELLED', 2, new Date('2026-09-09T14:00:00.000Z')),
    InvalidCollectionCaseTransitionError,
  );
});
