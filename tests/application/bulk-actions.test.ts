import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from '@insurance/application';
import { BulkActionsError } from '@insurance/application/bulk-actions';
import { Argon2PasswordHasher, createBulkActionsApplication, createMemoryRuntime } from '@insurance/infrastructure';

const claimA = 'd1000000-0000-4000-8000-000000000001';
const claimB = 'd1000000-0000-4000-8000-000000000002';

function seedClaim(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>, id: string, status: 'RECEIVED' | 'UNDER_REVIEW') {
  const at = new Date('2026-09-09T12:00:00.000Z');
  runtime.store.seedClaim({
    claim: {
      id,
      trackingCode: `TRACK-${id.slice(-4)}`,
      policyReference: `POL-${id.slice(-4)}`,
      vehicleReference: `VEH-${id.slice(-4)}`,
      verifiedCustomerLabel: 'Synthetic bulk customer',
      eventType: 'Synthetic event',
      occurredAt: at,
      locationText: 'Synthetic location',
      description: 'Synthetic bulk Claim.',
      status,
      createdAt: at,
      updatedAt: at,
    },
    evidence: [],
    history: [{
      historyId: `e${id.slice(1)}`,
      claimId: id,
      fromStatus: null,
      toStatus: status,
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    }],
  });
}

async function supervisorActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: 'd2000000-0000-4000-8000-000000000001',
    login: 'bulk.supervisor@example.invalid',
    passwordHash: await hasher.hash('bulk-supervisor-password'),
    role: 'CLAIMS_SUPERVISOR',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({ login: 'bulk.supervisor@example.invalid', password: 'bulk-supervisor-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

test('R3 bulk Claim transition preserves single-item parity, partial outcomes, durable summaries and replay', async () => {
  const runtime = await createMemoryRuntime();
  seedClaim(runtime, claimA, 'RECEIVED');
  seedClaim(runtime, claimB, 'UNDER_REVIEW');
  const supervisor = await supervisorActor(runtime);
  const bulk = createBulkActionsApplication({ application: runtime.application, store: runtime.store });
  const input = {
    idempotencyKey: 'bulk-application-key-0001',
    actionType: 'transitionClaimStatus',
    action: { toStatus: 'UNDER_REVIEW' },
    items: [
      { claimId: claimA, expectedFromStatus: 'RECEIVED' },
      { claimId: claimB, expectedFromStatus: 'RECEIVED' },
    ],
  };

  const first = await bulk.executeBulkOperation(input, supervisor, { requestId: 'bulk-application-request' });
  assert.equal(first.replayed, false);
  assert.equal(first.response.selectedItemCount, 2);
  assert.equal(first.response.succeededCount, 1);
  assert.equal(first.response.failedCount, 1);
  assert.equal(first.response.skippedCount, 0);
  assert.equal(first.response.allSucceeded, false);
  assert.equal(first.response.results[0]?.outcome, 'SUCCEEDED');
  assert.equal(first.response.results[1]?.outcome, 'FAILED');
  assert.equal(first.response.results[1]?.code, 'CLAIM_STATE_CONFLICT');
  assert.equal((await runtime.store.getById(claimA))?.claim.status, 'UNDER_REVIEW');
  assert.equal((await runtime.store.getById(claimB))?.claim.status, 'UNDER_REVIEW');

  const bulkAudits = await runtime.store.listForTarget('BULK_OPERATION', first.response.bulkOperationId);
  assert.deepEqual(bulkAudits.map((event) => event.eventCode), ['BULK_OPERATION_REQUESTED', 'BULK_OPERATION_COMPLETED']);
  assert.equal(bulkAudits[1]?.metadata?.allSucceeded, false);
  assert.equal(bulkAudits[1]?.metadata?.failedCount, 1);
  const claimAudits = await runtime.store.listForTarget('CLAIM', claimA);
  assert.equal(claimAudits.filter((event) => event.eventCode === 'CLAIM_STATE_TRANSITIONED').length, 1);

  const replay = await bulk.executeBulkOperation(input, supervisor, { requestId: 'bulk-application-replay' });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.response, first.response);
  const claimAuditsAfterReplay = await runtime.store.listForTarget('CLAIM', claimA);
  assert.equal(claimAuditsAfterReplay.filter((event) => event.eventCode === 'CLAIM_STATE_TRANSITIONED').length, 1);

  await assert.rejects(
    () => bulk.executeBulkOperation({ ...input, action: { toStatus: 'OBSERVED' } }, supervisor),
    (error: unknown) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('R3 bulk action is Supervisor-only and rejects unapproved or oversized envelopes', async () => {
  const runtime = await createMemoryRuntime();
  seedClaim(runtime, claimA, 'RECEIVED');
  const bulk = createBulkActionsApplication({ application: runtime.application, store: runtime.store });
  const operatorLogin = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const operator = await runtime.accessTokens.verify(operatorLogin.accessToken);
  assert.ok(operator);

  await assert.rejects(
    () => bulk.executeBulkOperation({
      idempotencyKey: 'bulk-application-key-0002',
      actionType: 'transitionClaimStatus',
      action: { toStatus: 'UNDER_REVIEW' },
      items: [{ claimId: claimA, expectedFromStatus: 'RECEIVED' }],
    }, operator),
    (error: unknown) => error instanceof ApplicationError && error.code === 'FORBIDDEN',
  );

  const supervisor = await supervisorActor(runtime);
  await assert.rejects(
    () => bulk.executeBulkOperation({
      idempotencyKey: 'bulk-application-key-0003',
      actionType: 'moveOperationalStage',
      action: { toStatus: 'UNDER_REVIEW' },
      items: [{ claimId: claimA, expectedFromStatus: 'RECEIVED' }],
    }, supervisor),
    (error: unknown) => error instanceof BulkActionsError && error.code === 'BULK_ACTION_INVALID',
  );

  await assert.rejects(
    () => bulk.executeBulkOperation({
      idempotencyKey: 'bulk-application-key-0004',
      actionType: 'transitionClaimStatus',
      action: { toStatus: 'UNDER_REVIEW' },
      items: Array.from({ length: 101 }, (_, index) => ({
        claimId: `d3000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        expectedFromStatus: 'RECEIVED',
      })),
    }, supervisor),
    (error: unknown) => error instanceof BulkActionsError && error.code === 'BULK_ACTION_INVALID',
  );
});
