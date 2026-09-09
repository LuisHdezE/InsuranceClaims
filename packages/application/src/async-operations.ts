import type { AsyncJobProps } from '@insurance/domain';
import type { ActorContext, ClockPort, IdGeneratorPort } from './index.js';

export type AsyncOperationsErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'DEAD_LETTER_STATE_CONFLICT'
  | 'ASYNC_JOB_BUSY'
  | 'ASYNC_JOB_TERMINAL'
  | 'ASYNC_JOB_INVALID';

export class AsyncOperationsApplicationError extends Error {
  constructor(readonly code: AsyncOperationsErrorCode, message: string) {
    super(message);
    this.name = 'AsyncOperationsApplicationError';
  }
}

export interface WorkerPrincipal {
  context: 'system';
  actorId: string;
  capabilities: readonly string[];
}

export interface AsyncOperationsAuditRecord {
  id: string;
  eventCode: 'DEAD_LETTER_REQUEUED' | 'DEAD_LETTER_RESOLVED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR';
  actorId: string;
  targetType: 'ASYNC_JOB';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export type AsyncJobLeaseResult =
  | { outcome: 'LEASED'; job: AsyncJobProps }
  | { outcome: 'BUSY' }
  | { outcome: 'TERMINAL' }
  | { outcome: 'NOT_FOUND' };

export type AsyncJobMutationResult =
  | { outcome: 'UPDATED'; job: AsyncJobProps }
  | { outcome: 'STALE' }
  | { outcome: 'NOT_DEAD_LETTER' }
  | { outcome: 'NOT_FOUND' };

export interface AsyncOperationsRepository {
  listDueJobs(input: { at: Date; limit: number }): Promise<AsyncJobProps[]>;
  listDeadLetters(input: { page: number; pageSize: number }): Promise<{ items: AsyncJobProps[]; totalItems: number }>;
  getJob(jobId: string): Promise<AsyncJobProps | null>;
  leaseJob(input: { jobId: string; expectedVersion: number; leaseOwner: string; at: Date; leaseSeconds: number }): Promise<AsyncJobLeaseResult>;
  finishJob(input: {
    jobId: string;
    expectedVersion: number;
    leaseOwner: string;
    outcome: 'SUCCEEDED' | 'FAILED';
    retryable: boolean;
    failureCategory: string | null;
    at: Date;
  }): Promise<AsyncJobProps | null>;
  requeueDeadLetter(input: { jobId: string; expectedVersion: number; at: Date; audit: AsyncOperationsAuditRecord }): Promise<AsyncJobMutationResult>;
  resolveDeadLetter(input: { jobId: string; expectedVersion: number; at: Date; audit: AsyncOperationsAuditRecord }): Promise<AsyncJobMutationResult>;
}

export interface DeadLetterResponse {
  deadLetterId: string;
  jobType: string;
  status: AsyncJobProps['status'];
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  correlationId: string | null;
  failureCategory: string | null;
  completedAt: string | null;
  version: number;
}

export interface DeadLettersPageResponse {
  items: DeadLetterResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

function requireStaffPermission(actor: ActorContext | undefined, permission: 'operations.dead_letters.read' | 'operations.dead_letters.manage'): ActorContext {
  if (!actor) throw new AsyncOperationsApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) throw new AsyncOperationsApplicationError('FORBIDDEN', 'The caller is not authorized for dead-letter operations.');
  return actor;
}

function requireWorker(principal: WorkerPrincipal | undefined): WorkerPrincipal {
  if (!principal || principal.context !== 'system' || !principal.actorId || !principal.capabilities.includes('async.jobs.execute')) {
    throw new AsyncOperationsApplicationError('AUTHENTICATION_REQUIRED', 'A valid Worker system principal is required.');
  }
  return principal;
}

function validatePage(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new AsyncOperationsApplicationError('ASYNC_JOB_INVALID', 'Pagination values are invalid.');
  }
}

function validateExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new AsyncOperationsApplicationError('ASYNC_JOB_INVALID', 'expectedVersion must be a positive integer.');
  }
}

function validateLeaseInput(leaseOwner: string, leaseSeconds: number): void {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(leaseOwner) || !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 900) {
    throw new AsyncOperationsApplicationError('ASYNC_JOB_INVALID', 'Worker lease input is invalid.');
  }
}

function sanitizedFailureCategory(value: string | null): string | null {
  if (value === null) return null;
  return /^[A-Z][A-Z0-9_]{0,79}$/.test(value) ? value : 'WORKER_HANDLER_FAILED';
}

function jobResponse(job: AsyncJobProps): DeadLetterResponse {
  return {
    deadLetterId: job.id,
    jobType: job.jobType,
    status: job.status,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    availableAt: job.availableAt.toISOString(),
    correlationId: job.correlationId,
    failureCategory: job.lastFailureCategory,
    completedAt: job.completedAt?.toISOString() ?? null,
    version: job.version,
  };
}

function requireDeadLetter(job: AsyncJobProps): DeadLetterResponse {
  if (job.status !== 'DEAD_LETTER') throw new AsyncOperationsApplicationError('DEAD_LETTER_STATE_CONFLICT', 'The async job is not in dead-letter state.');
  return jobResponse(job);
}

export class AsyncOperationsApplication {
  constructor(private readonly deps: { repository: AsyncOperationsRepository; clock: ClockPort; ids: IdGeneratorPort }) {}

  async listDeadLetters(input: { page?: number; pageSize?: number }, actor: ActorContext | undefined): Promise<DeadLettersPageResponse> {
    requireStaffPermission(actor, 'operations.dead_letters.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    validatePage(page, pageSize);
    const result = await this.deps.repository.listDeadLetters({ page, pageSize });
    return {
      items: result.items.map(requireDeadLetter),
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / pageSize),
    };
  }

  async getDeadLetter(deadLetterId: string, actor: ActorContext | undefined): Promise<DeadLetterResponse> {
    requireStaffPermission(actor, 'operations.dead_letters.read');
    const job = await this.deps.repository.getJob(deadLetterId);
    if (!job || job.status !== 'DEAD_LETTER') throw new AsyncOperationsApplicationError('RESOURCE_NOT_FOUND', 'The dead-letter record was not found.');
    return requireDeadLetter(job);
  }

  async requeueDeadLetter(deadLetterId: string, expectedVersion: number, actorInput: ActorContext | undefined, context: { requestId?: string } = {}): Promise<DeadLetterResponse> {
    const actor = requireStaffPermission(actorInput, 'operations.dead_letters.manage');
    validateExpectedVersion(expectedVersion);
    const current = await this.deps.repository.getJob(deadLetterId);
    if (!current) throw new AsyncOperationsApplicationError('RESOURCE_NOT_FOUND', 'The dead-letter record was not found.');
    if (current.status !== 'DEAD_LETTER') throw new AsyncOperationsApplicationError('DEAD_LETTER_STATE_CONFLICT', 'Only dead-letter jobs may be requeued.');
    const at = this.deps.clock.now();
    const result = await this.deps.repository.requeueDeadLetter({
      jobId: deadLetterId,
      expectedVersion,
      at,
      audit: {
        id: this.deps.ids.uuid(),
        eventCode: 'DEAD_LETTER_REQUEUED',
        occurredAt: at,
        actorType: 'ADMINISTRATOR',
        actorId: actor.operatorId,
        targetType: 'ASYNC_JOB',
        targetId: deadLetterId,
        outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { jobType: current.jobType, previousAttempts: current.attemptCount, previousFailureCategory: current.lastFailureCategory },
      },
    });
    if (result.outcome === 'STALE') throw new AsyncOperationsApplicationError('RESOURCE_VERSION_CONFLICT', 'The dead-letter record changed concurrently.');
    if (result.outcome === 'NOT_FOUND') throw new AsyncOperationsApplicationError('RESOURCE_NOT_FOUND', 'The dead-letter record was not found.');
    if (result.outcome === 'NOT_DEAD_LETTER') throw new AsyncOperationsApplicationError('DEAD_LETTER_STATE_CONFLICT', 'Only dead-letter jobs may be requeued.');
    return jobResponse(result.job);
  }

  async resolveDeadLetter(deadLetterId: string, expectedVersion: number, actorInput: ActorContext | undefined, context: { requestId?: string } = {}): Promise<DeadLetterResponse> {
    const actor = requireStaffPermission(actorInput, 'operations.dead_letters.manage');
    validateExpectedVersion(expectedVersion);
    const current = await this.deps.repository.getJob(deadLetterId);
    if (!current) throw new AsyncOperationsApplicationError('RESOURCE_NOT_FOUND', 'The dead-letter record was not found.');
    if (current.status !== 'DEAD_LETTER') throw new AsyncOperationsApplicationError('DEAD_LETTER_STATE_CONFLICT', 'Only dead-letter jobs may be resolved.');
    const at = this.deps.clock.now();
    const result = await this.deps.repository.resolveDeadLetter({
      jobId: deadLetterId,
      expectedVersion,
      at,
      audit: {
        id: this.deps.ids.uuid(),
        eventCode: 'DEAD_LETTER_RESOLVED',
        occurredAt: at,
        actorType: 'ADMINISTRATOR',
        actorId: actor.operatorId,
        targetType: 'ASYNC_JOB',
        targetId: deadLetterId,
        outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: {
          jobType: current.jobType,
          previousAttempts: current.attemptCount,
          previousFailureCategory: current.lastFailureCategory,
          resolutionClassification: 'ADMINISTRATIVE_CLOSURE',
        },
      },
    });
    if (result.outcome === 'STALE') throw new AsyncOperationsApplicationError('RESOURCE_VERSION_CONFLICT', 'The dead-letter record changed concurrently.');
    if (result.outcome === 'NOT_FOUND') throw new AsyncOperationsApplicationError('RESOURCE_NOT_FOUND', 'The dead-letter record was not found.');
    if (result.outcome === 'NOT_DEAD_LETTER') throw new AsyncOperationsApplicationError('DEAD_LETTER_STATE_CONFLICT', 'Only dead-letter jobs may be resolved.');
    return jobResponse(result.job);
  }

  async listDueJobs(limit: number, principal: WorkerPrincipal | undefined): Promise<AsyncJobProps[]> {
    requireWorker(principal);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AsyncOperationsApplicationError('ASYNC_JOB_INVALID', 'Worker batch size is invalid.');
    return this.deps.repository.listDueJobs({ at: this.deps.clock.now(), limit });
  }

  async leaseJob(job: AsyncJobProps, leaseOwner: string, leaseSeconds: number, principal: WorkerPrincipal | undefined): Promise<AsyncJobProps> {
    requireWorker(principal);
    validateLeaseInput(leaseOwner, leaseSeconds);
    const result = await this.deps.repository.leaseJob({ jobId: job.id, expectedVersion: job.version, leaseOwner, at: this.deps.clock.now(), leaseSeconds });
    if (result.outcome === 'NOT_FOUND') throw new AsyncOperationsApplicationError('RESOURCE_NOT_FOUND', 'The async job was not found.');
    if (result.outcome === 'BUSY') throw new AsyncOperationsApplicationError('ASYNC_JOB_BUSY', 'The async job is already leased.');
    if (result.outcome === 'TERMINAL') throw new AsyncOperationsApplicationError('ASYNC_JOB_TERMINAL', 'The async job is terminal.');
    return result.job;
  }

  async finishJob(input: { job: AsyncJobProps; leaseOwner: string; outcome: 'SUCCEEDED' | 'FAILED'; retryable?: boolean; failureCategory?: string | null }, principal: WorkerPrincipal | undefined): Promise<AsyncJobProps | null> {
    requireWorker(principal);
    const at = this.deps.clock.now();
    if (!input.job.leaseExpiresAt || input.job.leaseExpiresAt.getTime() <= at.getTime()) return null;
    const failureCategory = input.outcome === 'FAILED' ? sanitizedFailureCategory(input.failureCategory ?? 'WORKER_HANDLER_FAILED') : null;
    return this.deps.repository.finishJob({
      jobId: input.job.id,
      expectedVersion: input.job.version,
      leaseOwner: input.leaseOwner,
      outcome: input.outcome,
      retryable: input.retryable ?? true,
      failureCategory,
      at,
    });
  }
}
