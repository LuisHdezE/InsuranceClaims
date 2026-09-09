import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ClockPort } from '@insurance/application';
import type { IntegrationAuthenticatorPort } from '@insurance/application/integration-auth';
import type {
  InboundEventAcceptance,
  InboundEventAuditRecord,
  InboundEventProcessorPort,
  IntegrationEventRepository,
  ProcessingLeaseResult,
} from '@insurance/application/integration-events';
import type {
  AsyncJobProps,
  InboundEventProps,
  InboundIntegrationProps,
  IntegrationEventSchema,
  IntegrationPayload,
  IntegrationScalar,
} from '@insurance/domain';

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

function schemaObject(value: unknown): Readonly<Record<string, IntegrationEventSchema>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, IntegrationEventSchema> = {};
  for (const [eventType, rawSchema] of Object.entries(value as Record<string, unknown>)) {
    if (!rawSchema || typeof rawSchema !== 'object' || Array.isArray(rawSchema)) continue;
    const schema: Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'> = {};
    for (const [key, rawType] of Object.entries(rawSchema as Record<string, unknown>)) {
      if (rawType === 'STRING' || rawType === 'NUMBER' || rawType === 'BOOLEAN') schema[key] = rawType;
    }
    result[eventType] = schema;
  }
  return result;
}

function payloadObject(value: unknown): IntegrationPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, IntegrationScalar> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'string' || typeof raw === 'boolean' || (typeof raw === 'number' && Number.isFinite(raw))) result[key] = raw;
  }
  return result;
}

function integrationRow(row: any): InboundIntegrationProps {
  return {
    id: row.id,
    integrationKey: row.integrationKey,
    keyId: row.keyId,
    enabled: Boolean(row.enabled),
    allowedEventSchemas: schemaObject(row.allowedEventSchemas),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    version: Number(row.version),
  };
}

function eventRow(row: any): InboundEventProps {
  return {
    id: row.id,
    integrationId: row.integrationId,
    externalEventId: row.externalEventId,
    payloadHash: row.payloadHash,
    payload: payloadObject(row.sanitizedPayload),
    eventType: row.eventType,
    ingestionStatus: row.ingestionStatus,
    processingStatus: row.processingStatus,
    correlationId: row.correlationId ?? null,
    acceptedAt: toAppDate(row.acceptedAt),
    processedAt: row.processedAt ? toAppDate(row.processedAt) : null,
    failureCategory: row.failureCategory ?? null,
    version: Number(row.version),
  };
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

export class MemoryIntegrationStore implements IntegrationEventRepository {
  private readonly integrations = new Map<string, InboundIntegrationProps>();
  private readonly events = new Map<string, InboundEventProps>();
  private readonly jobs = new Map<string, AsyncJobProps>();
  private readonly jobsByEvent = new Map<string, string>();
  readonly audits: InboundEventAuditRecord[] = [];

  seedIntegration(record: InboundIntegrationProps): void { this.integrations.set(record.id, clone(record)); }

  async findIntegrationByExternalKey(integrationKey: string) {
    const value = [...this.integrations.values()].find((item) => item.integrationKey === integrationKey);
    return value ? clone(value) : null;
  }
  async getIntegration(integrationId: string) { const value = this.integrations.get(integrationId); return value ? clone(value) : null; }
  async findEventByExternalIdentity(integrationId: string, externalEventId: string) {
    const value = [...this.events.values()].find((item) => item.integrationId === integrationId && item.externalEventId === externalEventId);
    return value ? clone(value) : null;
  }
  async getEvent(eventId: string) { const value = this.events.get(eventId); return value ? clone(value) : null; }

  async acceptEvent(input: InboundEventAcceptance): Promise<'CREATED' | 'DUPLICATE'> {
    const existing = await this.findEventByExternalIdentity(input.event.integrationId, input.event.externalEventId);
    if (existing) return 'DUPLICATE';
    if ([...this.jobs.values()].some((item) => item.jobType === input.job.jobType && item.idempotencyIdentity === input.job.idempotencyIdentity)) return 'DUPLICATE';
    this.events.set(input.event.id, clone(input.event));
    this.jobs.set(input.job.id, clone(input.job));
    this.jobsByEvent.set(input.event.id, input.job.id);
    this.audits.push(clone(input.audit));
    return 'CREATED';
  }

  async beginProcessing(input: { eventId: string; leaseOwner: string; at: Date; leaseSeconds: number }): Promise<ProcessingLeaseResult> {
    const event = this.events.get(input.eventId);
    if (!event) return { outcome: 'NOT_FOUND' };
    const jobId = this.jobsByEvent.get(input.eventId);
    const job = jobId ? this.jobs.get(jobId) : undefined;
    if (!job) throw new Error('Inbound event processing job is missing.');
    if (event.processingStatus === 'PROCESSED' || event.processingStatus === 'DEAD_LETTER' || job.status === 'SUCCEEDED' || job.status === 'DEAD_LETTER' || job.status === 'CANCELLED') {
      return { outcome: 'TERMINAL', event: clone(event) };
    }
    if (job.status === 'LEASED' && job.leaseExpiresAt && job.leaseExpiresAt.getTime() > input.at.getTime()) {
      return { outcome: 'BUSY', event: clone(event) };
    }
    if (job.attemptCount >= job.maxAttempts) {
      event.processingStatus = 'DEAD_LETTER';
      event.failureCategory = job.lastFailureCategory ?? 'MAX_ATTEMPTS_EXHAUSTED';
      event.version += 1;
      job.status = 'DEAD_LETTER';
      job.updatedAt = input.at;
      job.completedAt = input.at;
      job.leaseOwner = null;
      job.leaseExpiresAt = null;
      job.version += 1;
      return { outcome: 'TERMINAL', event: clone(event) };
    }
    event.processingStatus = 'PROCESSING';
    event.failureCategory = null;
    event.version += 1;
    job.status = 'LEASED';
    job.attemptCount += 1;
    job.leaseOwner = input.leaseOwner;
    job.leaseExpiresAt = new Date(input.at.getTime() + input.leaseSeconds * 1000);
    job.updatedAt = input.at;
    job.version += 1;
    return { outcome: 'LEASED', event: clone(event), job: clone(job) };
  }

  async finishProcessing(input: {
    eventId: string;
    jobId: string;
    expectedEventVersion: number;
    expectedJobVersion: number;
    leaseOwner: string;
    outcome: 'PROCESSED' | 'FAILED';
    failureCategory: string | null;
    at: Date;
  }): Promise<InboundEventProps> {
    const event = this.events.get(input.eventId);
    const job = this.jobs.get(input.jobId);
    if (!event || !job || this.jobsByEvent.get(input.eventId) !== input.jobId) throw new Error('Inbound event processing state is missing.');
    if (
      event.version !== input.expectedEventVersion
      || job.version !== input.expectedJobVersion
      || job.leaseOwner !== input.leaseOwner
      || event.processingStatus !== 'PROCESSING'
      || job.status !== 'LEASED'
      || !job.leaseExpiresAt
      || job.leaseExpiresAt.getTime() < input.at.getTime()
    ) {
      return clone(event);
    }
    if (input.outcome === 'PROCESSED') {
      event.processingStatus = 'PROCESSED';
      event.processedAt = input.at;
      event.failureCategory = null;
      job.status = 'SUCCEEDED';
      job.completedAt = input.at;
      job.lastFailureCategory = null;
    } else {
      const deadLetter = job.attemptCount >= job.maxAttempts;
      event.processingStatus = deadLetter ? 'DEAD_LETTER' : 'FAILED';
      event.failureCategory = input.failureCategory ?? 'PROCESSING_FAILED';
      job.status = deadLetter ? 'DEAD_LETTER' : 'FAILED_RETRYABLE';
      job.completedAt = deadLetter ? input.at : null;
      job.lastFailureCategory = input.failureCategory ?? 'PROCESSING_FAILED';
      job.availableAt = input.at;
    }
    event.version += 1;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = input.at;
    job.version += 1;
    return clone(event);
  }
}

class IntegrationTransactionAbort extends Error {
  constructor(readonly outcome: 'BUSY') {
    super(`Integration transaction aborted: ${outcome}`);
    this.name = 'IntegrationTransactionAbort';
  }
}

export class PrismaIntegrationStore implements IntegrationEventRepository {
  constructor(private readonly db: any) {}

  async findIntegrationByExternalKey(integrationKey: string) {
    const row = await this.db.orm.public.InboundIntegration.first({ integrationKey });
    return row ? integrationRow(row) : null;
  }
  async getIntegration(integrationId: string) {
    const row = await this.db.orm.public.InboundIntegration.first({ id: integrationId });
    return row ? integrationRow(row) : null;
  }
  async findEventByExternalIdentity(integrationId: string, externalEventId: string) {
    const row = await this.db.orm.public.InboundEvent.first({ integrationId, externalEventId });
    return row ? eventRow(row) : null;
  }
  async getEvent(eventId: string) {
    const row = await this.db.orm.public.InboundEvent.first({ id: eventId });
    return row ? eventRow(row) : null;
  }

  async acceptEvent(input: InboundEventAcceptance): Promise<'CREATED' | 'DUPLICATE'> {
    try {
      await this.db.transaction(async (txDb: any) => {
        await txDb.orm.public.InboundEvent.create({
          id: input.event.id,
          integrationId: input.event.integrationId,
          externalEventId: input.event.externalEventId,
          payloadHash: input.event.payloadHash,
          sanitizedPayload: { ...input.event.payload },
          eventType: input.event.eventType,
          ingestionStatus: input.event.ingestionStatus,
          processingStatus: input.event.processingStatus,
          correlationId: input.event.correlationId,
          acceptedAt: toDbInstant(input.event.acceptedAt),
          processedAt: null,
          failureCategory: null,
          version: input.event.version,
        });
        await txDb.orm.public.AsyncJob.create({
          id: input.job.id,
          jobType: input.job.jobType,
          idempotencyIdentity: input.job.idempotencyIdentity,
          payload: { ...input.job.payload },
          status: input.job.status,
          attemptCount: input.job.attemptCount,
          maxAttempts: input.job.maxAttempts,
          availableAt: toDbInstant(input.job.availableAt),
          leaseOwner: null,
          leaseExpiresAt: null,
          correlationId: input.job.correlationId,
          lastFailureCategory: null,
          createdAt: toDbInstant(input.job.createdAt),
          updatedAt: toDbInstant(input.job.updatedAt),
          completedAt: null,
          version: input.job.version,
        });
        await txDb.orm.public.AuditEvent.create({
          id: input.audit.id,
          eventCode: input.audit.eventCode,
          occurredAt: toDbInstant(input.audit.occurredAt),
          actorType: input.audit.actorType,
          actorId: input.audit.actorId,
          targetType: input.audit.targetType,
          targetId: input.audit.targetId,
          outcome: input.audit.outcome,
          requestId: input.audit.requestId,
          metadata: { ...input.audit.metadata },
        });
      });
      return 'CREATED';
    } catch (error) {
      const existing = await this.findEventByExternalIdentity(input.event.integrationId, input.event.externalEventId);
      if (existing) return 'DUPLICATE';
      throw error;
    }
  }

  private async findJobForEvent(db: any, event: InboundEventProps) {
    return db.orm.public.AsyncJob.first({
      jobType: 'PROCESS_INBOUND_EVENT',
      idempotencyIdentity: `${event.integrationId}:${event.externalEventId}`,
    });
  }

  async beginProcessing(input: { eventId: string; leaseOwner: string; at: Date; leaseSeconds: number }): Promise<ProcessingLeaseResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const rawEvent = await txDb.orm.public.InboundEvent.first({ id: input.eventId });
        if (!rawEvent) return { outcome: 'NOT_FOUND' } as const;
        const event = eventRow(rawEvent);
        const rawJob = await this.findJobForEvent(txDb, event);
        if (!rawJob) throw new Error('Inbound event processing job is missing.');
        const job = jobRow(rawJob);
        if (event.processingStatus === 'PROCESSED' || event.processingStatus === 'DEAD_LETTER' || job.status === 'SUCCEEDED' || job.status === 'DEAD_LETTER' || job.status === 'CANCELLED') {
          return { outcome: 'TERMINAL', event } as const;
        }
        if (job.status === 'LEASED' && job.leaseExpiresAt && job.leaseExpiresAt.getTime() > input.at.getTime()) {
          return { outcome: 'BUSY', event } as const;
        }
        if (job.attemptCount >= job.maxAttempts) {
          const eventUpdated = await txDb.orm.public.InboundEvent.where({ id: event.id, version: event.version }).updateAndCount({
            processingStatus: 'DEAD_LETTER',
            failureCategory: job.lastFailureCategory ?? 'MAX_ATTEMPTS_EXHAUSTED',
            version: event.version + 1,
          });
          const jobUpdated = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
            status: 'DEAD_LETTER',
            updatedAt: toDbInstant(input.at),
            completedAt: toDbInstant(input.at),
            leaseOwner: null,
            leaseExpiresAt: null,
            version: job.version + 1,
          });
          if (eventUpdated !== 1 || jobUpdated !== 1) throw new IntegrationTransactionAbort('BUSY');
          const changed = await txDb.orm.public.InboundEvent.first({ id: event.id });
          if (!changed) throw new Error('Inbound event disappeared while dead-lettering.');
          return { outcome: 'TERMINAL', event: eventRow(changed) } as const;
        }
        const eventUpdated = await txDb.orm.public.InboundEvent.where({ id: event.id, version: event.version }).updateAndCount({
          processingStatus: 'PROCESSING', failureCategory: null, version: event.version + 1,
        });
        if (eventUpdated !== 1) throw new IntegrationTransactionAbort('BUSY');
        const jobUpdated = await txDb.orm.public.AsyncJob.where({ id: job.id, version: job.version }).updateAndCount({
          status: 'LEASED',
          attemptCount: job.attemptCount + 1,
          leaseOwner: input.leaseOwner,
          leaseExpiresAt: toDbInstant(new Date(input.at.getTime() + input.leaseSeconds * 1000)),
          updatedAt: toDbInstant(input.at),
          version: job.version + 1,
        });
        if (jobUpdated !== 1) throw new IntegrationTransactionAbort('BUSY');
        const changedEvent = await txDb.orm.public.InboundEvent.first({ id: event.id });
        const changedJob = await txDb.orm.public.AsyncJob.first({ id: job.id });
        if (!changedEvent || !changedJob) throw new Error('Inbound event processing lease disappeared.');
        return { outcome: 'LEASED', event: eventRow(changedEvent), job: jobRow(changedJob) } as const;
      });
    } catch (error) {
      if (error instanceof IntegrationTransactionAbort) {
        const event = await this.getEvent(input.eventId);
        return event ? { outcome: 'BUSY', event } : { outcome: 'NOT_FOUND' };
      }
      throw error;
    }
  }

  async finishProcessing(input: {
    eventId: string;
    jobId: string;
    expectedEventVersion: number;
    expectedJobVersion: number;
    leaseOwner: string;
    outcome: 'PROCESSED' | 'FAILED';
    failureCategory: string | null;
    at: Date;
  }): Promise<InboundEventProps> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const rawEvent = await txDb.orm.public.InboundEvent.first({ id: input.eventId });
        const rawJob = await txDb.orm.public.AsyncJob.first({ id: input.jobId });
        if (!rawEvent || !rawJob) throw new Error('Inbound event processing state is missing.');
        const event = eventRow(rawEvent);
        const job = jobRow(rawJob);
        if (
          event.version !== input.expectedEventVersion
          || job.version !== input.expectedJobVersion
          || job.leaseOwner !== input.leaseOwner
          || event.processingStatus !== 'PROCESSING'
          || job.status !== 'LEASED'
          || !job.leaseExpiresAt
          || job.leaseExpiresAt.getTime() < input.at.getTime()
        ) {
          return event;
        }

        let eventUpdated = 0;
        let jobUpdated = 0;
        if (input.outcome === 'PROCESSED') {
          eventUpdated = await txDb.orm.public.InboundEvent.where({
            id: event.id,
            version: input.expectedEventVersion,
            processingStatus: 'PROCESSING',
          }).updateAndCount({
            processingStatus: 'PROCESSED', processedAt: toDbInstant(input.at), failureCategory: null, version: input.expectedEventVersion + 1,
          });
          jobUpdated = await txDb.orm.public.AsyncJob.where({
            id: job.id,
            version: input.expectedJobVersion,
            status: 'LEASED',
            leaseOwner: input.leaseOwner,
          }).updateAndCount({
            status: 'SUCCEEDED', completedAt: toDbInstant(input.at), lastFailureCategory: null,
            leaseOwner: null, leaseExpiresAt: null, updatedAt: toDbInstant(input.at), version: input.expectedJobVersion + 1,
          });
        } else {
          const deadLetter = job.attemptCount >= job.maxAttempts;
          const failure = input.failureCategory ?? 'PROCESSING_FAILED';
          eventUpdated = await txDb.orm.public.InboundEvent.where({
            id: event.id,
            version: input.expectedEventVersion,
            processingStatus: 'PROCESSING',
          }).updateAndCount({
            processingStatus: deadLetter ? 'DEAD_LETTER' : 'FAILED', failureCategory: failure, version: input.expectedEventVersion + 1,
          });
          jobUpdated = await txDb.orm.public.AsyncJob.where({
            id: job.id,
            version: input.expectedJobVersion,
            status: 'LEASED',
            leaseOwner: input.leaseOwner,
          }).updateAndCount({
            status: deadLetter ? 'DEAD_LETTER' : 'FAILED_RETRYABLE',
            completedAt: deadLetter ? toDbInstant(input.at) : null,
            lastFailureCategory: failure,
            availableAt: toDbInstant(input.at),
            leaseOwner: null,
            leaseExpiresAt: null,
            updatedAt: toDbInstant(input.at),
            version: input.expectedJobVersion + 1,
          });
        }
        if (eventUpdated !== 1 || jobUpdated !== 1) throw new IntegrationTransactionAbort('BUSY');
        const changed = await txDb.orm.public.InboundEvent.first({ id: event.id });
        if (!changed) throw new Error('Inbound event disappeared while completing processing.');
        return eventRow(changed);
      });
    } catch (error) {
      if (error instanceof IntegrationTransactionAbort) {
        const event = await this.getEvent(input.eventId);
        if (!event) throw new Error('Inbound event disappeared after a stale lease completion attempt.');
        return event;
      }
      throw error;
    }
  }
}

export class HmacIntegrationAuthenticator implements IntegrationAuthenticatorPort {
  constructor(
    private readonly repository: IntegrationEventRepository,
    private readonly secrets: Readonly<Record<string, string>>,
    private readonly clock: ClockPort,
  ) {}

  async authenticate(input: { integrationKey: string; externalEventId: string; timestamp: string; signature: string; rawBody: Uint8Array }) {
    if (!/^[0-9]{1,12}$/.test(input.timestamp)) return { outcome: 'INVALID_TIMESTAMP' } as const;
    const epochSeconds = Number(input.timestamp);
    if (!Number.isSafeInteger(epochSeconds)) return { outcome: 'INVALID_TIMESTAMP' } as const;
    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    if (Math.abs(nowSeconds - epochSeconds) > 300) return { outcome: 'INVALID_TIMESTAMP' } as const;
    if (!/^[a-f0-9]{64}$/.test(input.signature)) return { outcome: 'INVALID_SIGNATURE' } as const;

    const integration = await this.repository.findIntegrationByExternalKey(input.integrationKey);
    if (!integration || !integration.enabled) return { outcome: 'INVALID_SIGNATURE' } as const;
    const secret = this.secrets[integration.keyId];
    if (!secret || secret.length < 16) return { outcome: 'INVALID_SIGNATURE' } as const;

    const payloadHash = createHash('sha256').update(input.rawBody).digest('hex');
    const canonical = `${input.timestamp}\n${input.externalEventId}\n${payloadHash}`;
    const expected = createHmac('sha256', secret).update(canonical).digest('hex');
    const expectedBytes = Buffer.from(expected, 'hex');
    const suppliedBytes = Buffer.from(input.signature, 'hex');
    if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      return { outcome: 'INVALID_SIGNATURE' } as const;
    }
    return {
      outcome: 'AUTHENTICATED',
      payloadHash,
      principal: {
        integrationId: integration.id,
        integrationKey: integration.integrationKey,
        keyId: integration.keyId,
        context: 'integration',
        permissions: ['integration.events.ingest'] as const,
      },
    } as const;
  }
}

export class SimulatedInboundEventProcessor implements InboundEventProcessorPort {
  async process(): Promise<{ outcome: 'PROCESSED' }> { return { outcome: 'PROCESSED' }; }
}
