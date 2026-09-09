import type {
  AsyncJobLeaseResult,
  AsyncJobMutationResult,
  AsyncOperationsAuditRecord,
  AsyncOperationsRepository,
} from '@insurance/application/async-operations';
import type { AsyncJobProps, IntegrationPayload, IntegrationScalar } from '@insurance/domain';

function clone<T>(value: T): T { return structuredClone(value); }

function toDbInstant(value: Date): any {
  const temporal = (globalThis as any).Temporal;
  if (!temporal?.Instant) throw new Error('Temporal.Instant is required by the PostgreSQL runtime.');
  return temporal.Instant.from(value.toISOString());
}

function toAppDate(value: any): Date {
  if (value instanceof Date) return value;
  const serialized = typeof value === 'string' ? value : value?.toString?.();
  const parsed = new Date(serialized);
  if (Number.isNaN(parsed.getTime())) throw new Error('PostgreSQL returned an invalid timestamp value.');
  return parsed;
}

function payloadObject(value: unknown): IntegrationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, IntegrationScalar> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'boolean' || (typeof raw === 'number' && Number.isFinite(raw))) result[key] = raw;
  }
  return result;
}

function jobRow(row: any): AsyncJobProps {
  return {
    id: row.id,
    jobType: row.jobType,
    idempotencyIdentity: row.idempotencyIdentity,
    payload: payloadObject(row.payload),
    status: row.status,
    attemptCount: Number(row.attemptCount),
    maxAttempts: Number(row.maxAttempts),
    availableAt: toAppDate(row.availableAt),
    leaseOwner: row.leaseOwner ?? null,
    leaseExpiresAt: row.leaseExpiresAt ? toAppDate(row.leaseExpiresAt) : null,
    correlationId: row.correlationId ?? null,
    lastFailureCategory: row.lastFailureCategory ?? null,
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    version: Number(row.version),
  };
}

function eligibleAt(job: AsyncJobProps, at: Date): boolean {
  if ((job.status === 'PENDING' || job.status === 'FAILED_RETRYABLE') && job.availableAt.getTime() <= at.getTime()) return true;
  return job.status === 'LEASED' && Boolean(job.leaseExpiresAt && job.leaseExpiresAt.getTime() <= at.getTime());
}

function terminal(job: AsyncJobProps): boolean {
  return job.status === 'SUCCEEDED' || job.status === 'DEAD_LETTER' || job.status === 'CANCELLED';
}

export class MemoryAsyncOperationsStore implements AsyncOperationsRepository {
  private readonly jobs = new Map<string, AsyncJobProps>();
  readonly audits: AsyncOperationsAuditRecord[] = [];

  seedJob(job: AsyncJobProps): void { this.jobs.set(job.id, clone(job)); }
  snapshot(jobId: string): AsyncJobProps | null { const job = this.jobs.get(jobId); return job ? clone(job) : null; }

  async listDueJobs(input: { at: Date; limit: number }): Promise<AsyncJobProps[]> {
    return [...this.jobs.values()]
      .filter((job) => eligibleAt(job, input.at))
      .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, input.limit)
      .map(clone);
  }

  async listDeadLetters(input: { page: number; pageSize: number }) {
    const all = [...this.jobs.values()]
      .filter((job) => job.status === 'DEAD_LETTER')
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize).map(clone), totalItems: all.length };
  }

  async getJob(jobId: string) { return this.snapshot(jobId); }

  async leaseJob(input: { jobId: string; expectedVersion: number; leaseOwner: string; at: Date; leaseSeconds: number }): Promise<AsyncJobLeaseResult> {
    const job = this.jobs.get(input.jobId);
    if (!job) return { outcome: 'NOT_FOUND' };
    if (terminal(job)) return { outcome: 'TERMINAL' };
    if (job.version !== input.expectedVersion || !eligibleAt(job, input.at)) return { outcome: 'BUSY' };
    if (job.attemptCount >= job.maxAttempts) {
      job.status = 'DEAD_LETTER';
      job.lastFailureCategory ??= 'MAX_ATTEMPTS_EXHAUSTED';
      job.completedAt = input.at;
      job.leaseOwner = null;
      job.leaseExpiresAt = null;
      job.updatedAt = input.at;
      job.version += 1;
      this.jobs.set(job.id, clone(job));
      return { outcome: 'TERMINAL' };
    }
    job.status = 'LEASED';
    job.attemptCount += 1;
    job.leaseOwner = input.leaseOwner;
    job.leaseExpiresAt = new Date(input.at.getTime() + input.leaseSeconds * 1000);
    job.updatedAt = input.at;
    job.completedAt = null;
    job.version += 1;
    this.jobs.set(job.id, clone(job));
    return { outcome: 'LEASED', job: clone(job) };
  }

  async finishJob(input: { jobId: string; expectedVersion: number; leaseOwner: string; outcome: 'SUCCEEDED' | 'FAILED'; retryable: boolean; failureCategory: string | null; at: Date }): Promise<AsyncJobProps | null> {
    const job = this.jobs.get(input.jobId);
    if (!job || job.version !== input.expectedVersion || job.status !== 'LEASED' || job.leaseOwner !== input.leaseOwner || !job.leaseExpiresAt || job.leaseExpiresAt.getTime() < input.at.getTime()) return null;
    if (input.outcome === 'SUCCEEDED') {
      job.status = 'SUCCEEDED';
      job.completedAt = input.at;
      job.lastFailureCategory = null;
    } else {
      const deadLetter = !input.retryable || job.attemptCount >= job.maxAttempts;
      job.status = deadLetter ? 'DEAD_LETTER' : 'FAILED_RETRYABLE';
      job.completedAt = deadLetter ? input.at : null;
      job.availableAt = input.at;
      job.lastFailureCategory = input.failureCategory ?? 'WORKER_HANDLER_FAILED';
    }
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = input.at;
    job.version += 1;
    this.jobs.set(job.id, clone(job));
    return clone(job);
  }

  async requeueDeadLetter(input: { jobId: string; expectedVersion: number; at: Date; audit: AsyncOperationsAuditRecord }): Promise<AsyncJobMutationResult> {
    const job = this.jobs.get(input.jobId);
    if (!job) return { outcome: 'NOT_FOUND' };
    if (job.version !== input.expectedVersion) return { outcome: 'STALE' };
    if (job.status !== 'DEAD_LETTER') return { outcome: 'NOT_DEAD_LETTER' };
    job.status = 'PENDING';
    job.attemptCount = 0;
    job.availableAt = input.at;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.lastFailureCategory = null;
    job.completedAt = null;
    job.updatedAt = input.at;
    job.version += 1;
    this.jobs.set(job.id, clone(job));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', job: clone(job) };
  }

  async resolveDeadLetter(input: { jobId: string; expectedVersion: number; at: Date; audit: AsyncOperationsAuditRecord }): Promise<AsyncJobMutationResult> {
    const job = this.jobs.get(input.jobId);
    if (!job) return { outcome: 'NOT_FOUND' };
    if (job.version !== input.expectedVersion) return { outcome: 'STALE' };
    if (job.status !== 'DEAD_LETTER') return { outcome: 'NOT_DEAD_LETTER' };
    job.status = 'CANCELLED';
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.completedAt = input.at;
    job.updatedAt = input.at;
    job.version += 1;
    this.jobs.set(job.id, clone(job));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', job: clone(job) };
  }
}

class AsyncTransactionAbort extends Error {
  constructor(readonly outcome: 'STALE' | 'NOT_DEAD_LETTER' | 'BUSY') { super(outcome); this.name = 'AsyncTransactionAbort'; }
}

async function appendAudit(db: any, audit: AsyncOperationsAuditRecord): Promise<void> {
  await db.orm.public.AuditEvent.create({
    id: audit.id,
    eventCode: audit.eventCode,
    occurredAt: toDbInstant(audit.occurredAt),
    actorType: audit.actorType,
    actorId: audit.actorId,
    targetType: audit.targetType,
    targetId: audit.targetId,
    outcome: audit.outcome,
    requestId: audit.requestId,
    metadata: audit.metadata,
    createdAt: toDbInstant(audit.occurredAt),
  });
}

export class PrismaAsyncOperationsStore implements AsyncOperationsRepository {
  constructor(private readonly db: any) {}

  async listDueJobs(input: { at: Date; limit: number }): Promise<AsyncJobProps[]> {
    const rows = await this.db.orm.public.AsyncJob.all();
    return rows.map(jobRow).filter((job: AsyncJobProps) => eligibleAt(job, input.at))
      .sort((a: AsyncJobProps, b: AsyncJobProps) => a.availableAt.getTime() - b.availableAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, input.limit);
  }

  async listDeadLetters(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.AsyncJob.all({ status: 'DEAD_LETTER' });
    const all = rows.map(jobRow).sort((a: AsyncJobProps, b: AsyncJobProps) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }

  async getJob(jobId: string) {
    const row = await this.db.orm.public.AsyncJob.first({ id: jobId });
    return row ? jobRow(row) : null;
  }

  async leaseJob(input: { jobId: string; expectedVersion: number; leaseOwner: string; at: Date; leaseSeconds: number }): Promise<AsyncJobLeaseResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const row = await txDb.orm.public.AsyncJob.first({ id: input.jobId });
        if (!row) return { outcome: 'NOT_FOUND' } as const;
        const job = jobRow(row);
        if (terminal(job)) return { outcome: 'TERMINAL' } as const;
        if (job.version !== input.expectedVersion || !eligibleAt(job, input.at)) return { outcome: 'BUSY' } as const;
        if (job.attemptCount >= job.maxAttempts) {
          const exhausted = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
            status: 'DEAD_LETTER', lastFailureCategory: job.lastFailureCategory ?? 'MAX_ATTEMPTS_EXHAUSTED', completedAt: toDbInstant(input.at),
            leaseOwner: null, leaseExpiresAt: null, updatedAt: toDbInstant(input.at), version: job.version + 1,
          });
          if (exhausted !== 1) throw new AsyncTransactionAbort('BUSY');
          return { outcome: 'TERMINAL' } as const;
        }
        const leaseExpiresAt = new Date(input.at.getTime() + input.leaseSeconds * 1000);
        const updated = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
          status: 'LEASED', attemptCount: job.attemptCount + 1, leaseOwner: input.leaseOwner, leaseExpiresAt: toDbInstant(leaseExpiresAt),
          completedAt: null, updatedAt: toDbInstant(input.at), version: job.version + 1,
        });
        if (updated !== 1) throw new AsyncTransactionAbort('BUSY');
        const leased = await txDb.orm.public.AsyncJob.first({ id: job.id });
        if (!leased) throw new Error('Leased async job disappeared.');
        return { outcome: 'LEASED', job: jobRow(leased) } as const;
      });
    } catch (error) {
      if (error instanceof AsyncTransactionAbort && error.outcome === 'BUSY') return { outcome: 'BUSY' };
      throw error;
    }
  }

  async finishJob(input: { jobId: string; expectedVersion: number; leaseOwner: string; outcome: 'SUCCEEDED' | 'FAILED'; retryable: boolean; failureCategory: string | null; at: Date }): Promise<AsyncJobProps | null> {
    return this.db.transaction(async (txDb: any) => {
      const row = await txDb.orm.public.AsyncJob.first({ id: input.jobId });
      if (!row) return null;
      const job = jobRow(row);
      if (job.version !== input.expectedVersion || job.status !== 'LEASED' || job.leaseOwner !== input.leaseOwner || !job.leaseExpiresAt || job.leaseExpiresAt.getTime() < input.at.getTime()) return null;
      const success = input.outcome === 'SUCCEEDED';
      const deadLetter = !success && (!input.retryable || job.attemptCount >= job.maxAttempts);
      const status = success ? 'SUCCEEDED' : deadLetter ? 'DEAD_LETTER' : 'FAILED_RETRYABLE';
      const updated = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
        status,
        availableAt: success ? toDbInstant(job.availableAt) : toDbInstant(input.at),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastFailureCategory: success ? null : (input.failureCategory ?? 'WORKER_HANDLER_FAILED'),
        completedAt: success || deadLetter ? toDbInstant(input.at) : null,
        updatedAt: toDbInstant(input.at),
        version: job.version + 1,
      });
      if (updated !== 1) return null;
      const finished = await txDb.orm.public.AsyncJob.first({ id: job.id });
      return finished ? jobRow(finished) : null;
    });
  }

  async requeueDeadLetter(input: { jobId: string; expectedVersion: number; at: Date; audit: AsyncOperationsAuditRecord }): Promise<AsyncJobMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const row = await txDb.orm.public.AsyncJob.first({ id: input.jobId });
        if (!row) return { outcome: 'NOT_FOUND' } as const;
        const job = jobRow(row);
        if (job.version !== input.expectedVersion) return { outcome: 'STALE' } as const;
        if (job.status !== 'DEAD_LETTER') return { outcome: 'NOT_DEAD_LETTER' } as const;

        if (job.jobType === 'PROCESS_INBOUND_EVENT') {
          const eventId = typeof job.payload.eventId === 'string' ? job.payload.eventId : null;
          if (!eventId) throw new Error('Dead-letter inbound event job has invalid sanitized payload.');
          const event = await txDb.orm.public.InboundEvent.first({ id: eventId });
          if (!event) throw new Error('Dead-letter inbound event is missing.');
          const eventVersion = Number(event.version);
          const eventUpdated = await txDb.orm.public.InboundEvent.where({ id: eventId, version: eventVersion }).updateAndCount({
            processingStatus: 'PENDING', failureCategory: null, processedAt: null, version: eventVersion + 1,
          });
          if (eventUpdated !== 1) throw new AsyncTransactionAbort('STALE');
        }

        const updated = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
          status: 'PENDING', attemptCount: 0, availableAt: toDbInstant(input.at), leaseOwner: null, leaseExpiresAt: null,
          lastFailureCategory: null, completedAt: null, updatedAt: toDbInstant(input.at), version: job.version + 1,
        });
        if (updated !== 1) throw new AsyncTransactionAbort('STALE');
        await appendAudit(txDb, input.audit);
        const current = await txDb.orm.public.AsyncJob.first({ id: job.id });
        if (!current) throw new Error('Requeued async job disappeared.');
        return { outcome: 'UPDATED', job: jobRow(current) } as const;
      });
    } catch (error) {
      if (error instanceof AsyncTransactionAbort && error.outcome === 'STALE') return { outcome: 'STALE' };
      throw error;
    }
  }

  async resolveDeadLetter(input: { jobId: string; expectedVersion: number; at: Date; audit: AsyncOperationsAuditRecord }): Promise<AsyncJobMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const row = await txDb.orm.public.AsyncJob.first({ id: input.jobId });
        if (!row) return { outcome: 'NOT_FOUND' } as const;
        const job = jobRow(row);
        if (job.version !== input.expectedVersion) return { outcome: 'STALE' } as const;
        if (job.status !== 'DEAD_LETTER') return { outcome: 'NOT_DEAD_LETTER' } as const;
        const updated = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
          status: 'CANCELLED', leaseOwner: null, leaseExpiresAt: null, completedAt: toDbInstant(input.at), updatedAt: toDbInstant(input.at), version: job.version + 1,
        });
        if (updated !== 1) throw new AsyncTransactionAbort('STALE');
        await appendAudit(txDb, input.audit);
        const current = await txDb.orm.public.AsyncJob.first({ id: job.id });
        if (!current) throw new Error('Resolved async job disappeared.');
        return { outcome: 'UPDATED', job: jobRow(current) } as const;
      });
    } catch (error) {
      if (error instanceof AsyncTransactionAbort && error.outcome === 'STALE') return { outcome: 'STALE' };
      throw error;
    }
  }
}
