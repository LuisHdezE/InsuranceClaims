import assert from 'node:assert/strict';
import test from 'node:test';
import { Claim, ClaimStateConflictError, InvalidTransitionError, allowedTransitionsFor } from '@insurance/domain';

function claim() {
  const now = new Date('2026-09-05T12:00:00Z');
  return Claim.create({ id: 'c1', trackingCode: 't1', policyReference: 'p1', vehicleReference: 'v1', verifiedCustomerLabel: null, eventType: 'Synthetic incident', occurredAt: now, locationText: 'Synthetic location', description: 'Synthetic description', createdAt: now, updatedAt: now });
}

test('Domain owns the approved transition matrix', () => {
  assert.deepEqual(allowedTransitionsFor('UNDER_REVIEW'), ['OBSERVED', 'APPROVED']);
  const aggregate = claim();
  aggregate.transition('UNDER_REVIEW', 'RECEIVED', new Date('2026-09-05T13:00:00Z'));
  assert.equal(aggregate.status, 'UNDER_REVIEW');
  assert.throws(() => aggregate.transition('CLOSED', 'UNDER_REVIEW', new Date()), InvalidTransitionError);
});

test('Domain rejects stale expected state before transition', () => {
  assert.throws(() => claim().transition('UNDER_REVIEW', 'APPROVED', new Date()), ClaimStateConflictError);
});
