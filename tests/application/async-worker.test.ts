import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncOperationsApplication, type WorkerPrincipal } from '@insurance/application/async-operations';
import { MemoryAsyncOperationsStore } from '@insurance/infrastructure';
import type { AsyncJobProps } from '@insurance/domain';
import { DurableAsyncWorker } from '../../apps/worker/src/worker.js';

class MutableClock {
  constructor(private value: Date) {}
  now(): Date { return new Date(this.value); }
  set(value: Date): void { this.value = new Date(value); }
}

class TestIds {
  private sequence = 0;
  uuid(): string { this.sequence += 1; return `96000000-0000-4000-8000-${String(this.sequence).padStart(12, '0')}`; }
  trackingCode(): string { return 'TEST-ASYNC-TRACKING'; }
}

function job(input: { id: string; jobType: string; payload?: Record<string, string | number | boolean>; maxAttempts?: number }): AsyncJobProps {
  const now = new Date('2026-09-09T04:00:00.000Z');
  return {
    id: input.id,
    jobType: input.jobType,
    idempotencyIdentity: `test:${input.id}`,
    payload: input.payload ?? {},
    status: 'PENDING',
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? 3,
    availableAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    correlationId: 'async-worker-test',
    lastFailureCategory: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    version: 1,
  };
}

const principal: WorkerPrincipal = { context: 'system', actorId: 'worker-test', capabilities: ['async.jobs.execute'] };

test('generic async leasing rejects a stale worker at lease expiry and bounds retries', async () => {
  const clock = new MutableClock(new Date('2026-09-09T04:00:00.000Z'));
  const store = new MemoryAsyncOperationsStore();
  const application = new AsyncOperationsApplication({ repository: store, clock, ids: new TestIds() });
  const original = job({ id: '97000000-0000-4000-8000-000000000001', jobType: 'RESUME_AUTOMATION_EXECUTION', maxAttempts: 1 });
  store.seedJob(original);

  const leased = await application.leaseJob(original, 'worker-test', 5, principal);
  assert.equal(leased.status, 'LEASED');
  assert.equal(leased.attemptCount, 1);

  clock.set(new Date('2026-09-09T04:00:05.000Z'));
  const staleFinish = await application.finishJob({ job: leased, leaseOwner: 'worker-test', outcome: 'SUCCEEDED' }, principal);
  assert.equal(staleFinish, null);

  const recovered = (await application.listDueJobs(10, principal))[0]!;
  await assert.rejects(
    () => application.leaseJob(recovered, 'worker-recovery', 5, { ...principal, actorId: 'worker-recovery' }),
    (error: any) => error.code === 'ASYNC_JOB_TERMINAL',
  );
  assert.equal(store.snapshot(original.id)?.status, 'DEAD_LETTER');
  assert.equal(store.snapshot(original.id)?.lastFailureCategory, 'MAX_ATTEMPTS_EXHAUSTED');
});

test('worker resumes automation jobs through Application and marks durable job success', async () => {
  const store = new MemoryAsyncOperationsStore();
  const clock = new MutableClock(new Date('2026-09-09T04:00:00.000Z'));
  const application = new AsyncOperationsApplication({ repository: store, clock, ids: new TestIds() });
  const automationJob = job({
    id: '97000000-0000-4000-8000-000000000002',
    jobType: 'RESUME_AUTOMATION_EXECUTION',
    payload: { executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', automationVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  });
  store.seedJob(automationJob);
  let resumed = 0;
  const worker = new DurableAsyncWorker({
    asyncOperations: application,
    integrations: { processInboundEvent: async () => { throw new Error('unexpected integration dispatch'); } } as any,
    automationExecution: { resumeExecution: async () => { resumed += 1; return { status: 'SUCCEEDED' }; } } as any,
  }, 'worker-test');

  const result = await worker.tick();
  assert.equal(resumed, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(store.snapshot(automationJob.id)?.status, 'SUCCEEDED');
  assert.equal(store.snapshot(automationJob.id)?.attemptCount, 1);
});

test('worker does not double-lease inbound jobs and fails closed for unknown job types', async () => {
  const store = new MemoryAsyncOperationsStore();
  const clock = new MutableClock(new Date('2026-09-09T04:00:00.000Z'));
  const application = new AsyncOperationsApplication({ repository: store, clock, ids: new TestIds() });
  const inbound = job({
    id: '97000000-0000-4000-8000-000000000003',
    jobType: 'PROCESS_INBOUND_EVENT',
    payload: { eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
  });
  const unknown = job({ id: '97000000-0000-4000-8000-000000000004', jobType: 'DYNAMIC_UNTRUSTED_ACTION' });
  store.seedJob(inbound);
  store.seedJob(unknown);
  let inboundCalls = 0;
  const worker = new DurableAsyncWorker({
    asyncOperations: application,
    integrations: {
      processInboundEvent: async () => {
        inboundCalls += 1;
        return { processingStatus: 'PROCESSED' };
      },
    } as any,
    automationExecution: { resumeExecution: async () => { throw new Error('unexpected automation dispatch'); } } as any,
  }, 'worker-test');

  const result = await worker.tick();
  assert.equal(inboundCalls, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 1);
  assert.equal(store.snapshot(inbound.id)?.attemptCount, 0, 'inbound lease remains owned exclusively by IntegrationEventsApplication');
  assert.equal(store.snapshot(unknown.id)?.status, 'DEAD_LETTER');
  assert.equal(store.snapshot(unknown.id)?.lastFailureCategory, 'UNSUPPORTED_JOB_TYPE');
});
