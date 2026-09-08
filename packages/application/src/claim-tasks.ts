import {
  ApplicationError,
  type ActorContext,
  type ClaimRepository,
  type ClockPort,
  type HashPort,
  type IdGeneratorPort,
  type IdempotencyPort,
  type IdempotencyRecord,
  type RequestContext,
} from './index.js';
import {
  ClaimTask,
  ClaimTaskStateConflictError,
  ClaimTaskVersionConflictError,
  InvalidClaimTaskStateError,
  type ClaimTaskActorType,
  type ClaimTaskCancellationReason,
  type ClaimTaskPriority,
  type ClaimTaskProps,
  type ClaimTaskQueue,
  type ClaimTaskStatus,
  type ClaimTaskType,
} from '@insurance/domain/claim-task';

export type ClaimTaskApplicationErrorCode =
  | 'TASK_NOT_FOUND'
  | 'TASK_STATE_CONFLICT'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'INVALID_TASK_STATE';

export class ClaimTaskApplicationError extends Error {
  constructor(
    readonly code: ClaimTaskApplicationErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ClaimTaskApplicationError';
  }
}

export type ClaimTaskHistoryEventType = 'CREATED' | 'ASSIGNED' | 'UPDATED' | 'COMPLETED' | 'CANCELLED';

export interface ClaimTaskHistoryRecord {
  id: string;
  taskId: string;
  eventType: ClaimTaskHistoryEventType;
  fromStatus: ClaimTaskStatus | null;
  toStatus: ClaimTaskStatus | null;
  previousAssignedOperatorId: string | null;
  newAssignedOperatorId: string | null;
  previousPriority: ClaimTaskPriority | null;
  newPriority: ClaimTaskPriority | null;
  previousDueAt: Date | null;
  newDueAt: Date | null;
  actorType: ClaimTaskActorType;
  actorId: string | null;
  correlationId: string | null;
  occurredAt: Date;
  metadata: Record<string, unknown> | null;
}

export interface ClaimTaskRepository {
  createIfAbsent(task: ClaimTaskProps, history?: ClaimTaskHistoryRecord): Promise<ClaimTaskProps>;
  list(input: {
    page: number;
    pageSize: number;
    status?: ClaimTaskStatus;
    type?: ClaimTaskType;
    claimId?: string;
    priority?: ClaimTaskPriority;
    assignedOperatorId?: string;
    overdueBefore?: Date;
  }): Promise<{ items: ClaimTaskProps[]; totalItems: number }>;
  getById(taskId: string): Promise<ClaimTaskProps | null>;
  listHistory(taskId: string): Promise<ClaimTaskHistoryRecord[]>;
  update(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void>;
  complete(task: ClaimTaskProps, expectedStatus: ClaimTaskStatus, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void>;
  cancel(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void>;
}

export interface ClaimTasksDependencies {
  claims: ClaimRepository;
  tasks: ClaimTaskRepository;
  idempotency: IdempotencyPort;
  hash: HashPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

/**
 * R3 changes the public permission names for tasks. The staff RBAC expansion is
 * delivered in the next cross-cutting increment. Until that lands, the
 * historical operator grants remain the compatibility proof for this vertical.
 */
function requireTaskPermission(actor: ActorContext | undefined, mode: 'read' | 'manage'): ActorContext {
  if (!actor) throw new ApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  const compatibilityPermission = mode === 'read' ? 'claims.backoffice.read' : 'claims.backoffice.transition';
  if (!actor.permissions.includes(compatibilityPermission)) {
    throw new ApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  }
  return actor;
}

function requireText(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new ApplicationError('VALIDATION_ERROR', `${name} is required and must be at most ${max} characters.`, { field: name });
  }
  return normalized;
}

function optionalText(name: string, value: string | null | undefined, max: number): string | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const normalized = value.trim();
  if (normalized.length > max) throw new ApplicationError('VALIDATION_ERROR', `${name} must be at most ${max} characters.`, { field: name });
  return normalized;
}

function taskProjection(task: ClaimTaskProps, claim: Awaited<ReturnType<ClaimRepository['getById']>>) {
  return {
    taskId: task.id,
    claimId: task.claimId,
    trackingCode: claim?.claim.trackingCode ?? null,
    policyReference: claim?.claim.policyReference ?? null,
    vehicleReference: claim?.claim.vehicleReference ?? null,
    type: task.type,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    queue: task.queue,
    assignedOperatorId: task.assignedOperatorId,
    dueAt: task.dueAt?.toISOString() ?? null,
    version: task.version,
    createdByType: task.createdByType,
    createdById: task.createdById,
    correlationId: task.correlationId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    completedById: task.completedById,
    cancelledAt: task.cancelledAt?.toISOString() ?? null,
    cancelledById: task.cancelledById,
    cancellationReason: task.cancellationReason,
  };
}

function history(input: Omit<ClaimTaskHistoryRecord, 'id'>, ids: IdGeneratorPort): ClaimTaskHistoryRecord {
  return { id: ids.uuid(), ...input };
}

export class ClaimTasksApplication {
  constructor(private readonly deps: ClaimTasksDependencies) {}

  async ensureInitialTasksForClaim(input: { claimId: string; evidenceCount: number; correlationId?: string | null }): Promise<void> {
    const detail = await this.deps.claims.getById(input.claimId);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');

    const createdAt = this.deps.clock.now();
    const definitions = [
      {
        type: 'CLAIM_REVIEW' as const,
        title: 'Revisar siniestro reportado',
        sourceKey: `${input.claimId}:initial:CLAIM_REVIEW`,
      },
      ...(input.evidenceCount > 0 ? [{
        type: 'EVIDENCE_REVIEW' as const,
        title: 'Revisar evidencia adjunta',
        sourceKey: `${input.claimId}:initial:EVIDENCE_REVIEW`,
      }] : []),
    ];

    for (const definition of definitions) {
      const task = ClaimTask.create({
        id: this.deps.ids.uuid(),
        claimId: input.claimId,
        type: definition.type,
        title: definition.title,
        description: null,
        priority: 'NORMAL',
        queue: 'CLAIMS',
        assignedOperatorId: null,
        dueAt: null,
        createdByType: 'SYSTEM',
        createdById: null,
        sourceKey: definition.sourceKey,
        correlationId: input.correlationId ?? null,
        createdAt,
      });
      const snapshot = task.snapshot();
      await this.deps.tasks.createIfAbsent(snapshot, history({
        taskId: snapshot.id,
        eventType: 'CREATED',
        fromStatus: null,
        toStatus: 'OPEN',
        previousAssignedOperatorId: null,
        newAssignedOperatorId: null,
        previousPriority: null,
        newPriority: snapshot.priority,
        previousDueAt: null,
        newDueAt: snapshot.dueAt,
        actorType: 'SYSTEM',
        actorId: null,
        correlationId: input.correlationId ?? null,
        occurredAt: createdAt,
        metadata: { source: 'INITIAL_CLAIM_TASK' },
      }, this.deps.ids));
    }
  }

  async listTasks(input: {
    page?: number;
    pageSize?: number;
    status?: ClaimTaskStatus;
    type?: ClaimTaskType;
    claimId?: string;
    priority?: ClaimTaskPriority;
    assignedOperatorId?: string;
    overdue?: boolean;
  }, actor?: ActorContext) {
    requireTaskPermission(actor, 'read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid task pagination parameters.');
    }
    const result = await this.deps.tasks.list({
      page,
      pageSize,
      status: input.status,
      type: input.type,
      claimId: input.claimId,
      priority: input.priority,
      assignedOperatorId: input.assignedOperatorId,
      overdueBefore: input.overdue === true ? this.deps.clock.now() : undefined,
    });
    const items = await Promise.all(result.items.map(async (task) => taskProjection(task, await this.deps.claims.getById(task.claimId))));
    return {
      items,
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async listClaimTasks(claimId: string, actor?: ActorContext) {
    requireTaskPermission(actor, 'read');
    const detail = await this.deps.claims.getById(claimId);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');
    const result = await this.deps.tasks.list({ page: 1, pageSize: 100, claimId });
    return Promise.all(result.items.map((task) => Promise.resolve(taskProjection(task, detail))));
  }

  async getTask(taskId: string, actor?: ActorContext) {
    requireTaskPermission(actor, 'read');
    const record = await this.deps.tasks.getById(taskId);
    if (!record) throw new ClaimTaskApplicationError('TASK_NOT_FOUND', 'The task could not be found.');
    return taskProjection(record, await this.deps.claims.getById(record.claimId));
  }

  async getTaskHistory(taskId: string, actor?: ActorContext) {
    requireTaskPermission(actor, 'read');
    const record = await this.deps.tasks.getById(taskId);
    if (!record) throw new ClaimTaskApplicationError('TASK_NOT_FOUND', 'The task could not be found.');
    return (await this.deps.tasks.listHistory(taskId)).map((item) => ({
      ...item,
      previousDueAt: item.previousDueAt?.toISOString() ?? null,
      newDueAt: item.newDueAt?.toISOString() ?? null,
      occurredAt: item.occurredAt.toISOString(),
    }));
  }

  async createTask(input: {
    claimId: string;
    idempotencyKey: string;
    type: ClaimTaskType;
    title: string;
    description?: string | null;
    priority?: ClaimTaskPriority;
    queue?: ClaimTaskQueue;
    assignedOperatorId?: string | null;
    dueAt?: string | null;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireTaskPermission(actor, 'manage');
    if (!input.idempotencyKey || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128) {
      throw new ApplicationError('VALIDATION_ERROR', 'Idempotency-Key must contain 16 to 128 characters.');
    }
    const claim = await this.deps.claims.getById(input.claimId);
    if (!claim) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');

    const title = requireText('title', input.title, 160);
    const description = optionalText('description', input.description, 1000);
    const dueAt = input.dueAt ? new Date(input.dueAt) : null;
    if (dueAt && Number.isNaN(dueAt.getTime())) throw new ApplicationError('VALIDATION_ERROR', 'dueAt must be an RFC 3339 date-time.');
    const keyHash = await this.deps.hash.sha256(input.idempotencyKey);
    const scope = 'createClaimTask';
    const requestFingerprint = await this.deps.hash.sha256(JSON.stringify({
      claimId: input.claimId,
      type: input.type,
      title,
      description,
      priority: input.priority ?? 'NORMAL',
      queue: input.queue ?? 'CLAIMS',
      assignedOperatorId: input.assignedOperatorId ?? null,
      dueAt: dueAt?.toISOString() ?? null,
    }));

    const replay = async (record: IdempotencyRecord | null): Promise<any | null> => {
      if (!record) return null;
      if (record.requestFingerprint !== requestFingerprint) throw new ApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different request.');
      if (record.status === 'COMPLETED' && record.responseReference) return record.responseReference;
      if (record.status === 'IN_PROGRESS') throw new ApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
      return null;
    };

    const existing = await replay(await this.deps.idempotency.get(scope, keyHash));
    if (existing) return { response: existing, replayed: true };

    const now = this.deps.clock.now();
    const reserved = await this.deps.idempotency.reserve({
      scope,
      keyHash,
      requestFingerprint,
      status: 'IN_PROGRESS',
      claimId: input.claimId,
      responseReference: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
    if (!reserved) {
      const raced = await replay(await this.deps.idempotency.get(scope, keyHash));
      if (raced) return { response: raced, replayed: true };
      throw new ApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
    }

    try {
      const task = ClaimTask.create({
        id: this.deps.ids.uuid(),
        claimId: input.claimId,
        type: input.type,
        title,
        description,
        priority: input.priority ?? 'NORMAL',
        queue: input.queue ?? 'CLAIMS',
        assignedOperatorId: input.assignedOperatorId ?? null,
        dueAt,
        createdByType: 'OPERATOR',
        createdById: authenticated.operatorId,
        sourceKey: `http:createClaimTask:${keyHash}`,
        correlationId: context.requestId ?? null,
        createdAt: now,
      });
      const snapshot = task.snapshot();
      const persisted = await this.deps.tasks.createIfAbsent(snapshot, history({
        taskId: snapshot.id,
        eventType: 'CREATED',
        fromStatus: null,
        toStatus: 'OPEN',
        previousAssignedOperatorId: null,
        newAssignedOperatorId: snapshot.assignedOperatorId,
        previousPriority: null,
        newPriority: snapshot.priority,
        previousDueAt: null,
        newDueAt: snapshot.dueAt,
        actorType: 'OPERATOR',
        actorId: authenticated.operatorId,
        correlationId: context.requestId ?? null,
        occurredAt: now,
        metadata: null,
      }, this.deps.ids));
      const response = taskProjection(persisted, claim);
      await this.deps.idempotency.complete(scope, keyHash, input.claimId, response);
      return { response, replayed: persisted.id !== snapshot.id };
    } catch (error) {
      await this.deps.idempotency.markRetryable(scope, keyHash).catch(() => undefined);
      throw error;
    }
  }

  async updateTask(input: {
    taskId: string;
    expectedVersion: number;
    assignedOperatorId?: string | null;
    queue?: ClaimTaskQueue;
    priority?: ClaimTaskPriority;
    dueAt?: string | null;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireTaskPermission(actor, 'manage');
    const record = await this.deps.tasks.getById(input.taskId);
    if (!record) throw new ClaimTaskApplicationError('TASK_NOT_FOUND', 'The task could not be found.');
    const dueAt = input.dueAt === undefined || input.dueAt === null ? input.dueAt : new Date(input.dueAt);
    if (dueAt instanceof Date && Number.isNaN(dueAt.getTime())) throw new ApplicationError('VALIDATION_ERROR', 'dueAt must be an RFC 3339 date-time.');
    if (input.assignedOperatorId === undefined && input.queue === undefined && input.priority === undefined && input.dueAt === undefined) {
      throw new ApplicationError('VALIDATION_ERROR', 'At least one mutable task field is required.');
    }
    try {
      const aggregate = ClaimTask.rehydrate(record);
      aggregate.update(input.expectedVersion, {
        assignedOperatorId: input.assignedOperatorId,
        queue: input.queue,
        priority: input.priority,
        dueAt,
      }, this.deps.clock.now());
      const snapshot = aggregate.snapshot();
      const eventType: ClaimTaskHistoryEventType = record.assignedOperatorId !== snapshot.assignedOperatorId ? 'ASSIGNED' : 'UPDATED';
      const entry = history({
        taskId: snapshot.id,
        eventType,
        fromStatus: record.status,
        toStatus: snapshot.status,
        previousAssignedOperatorId: record.assignedOperatorId,
        newAssignedOperatorId: snapshot.assignedOperatorId,
        previousPriority: record.priority,
        newPriority: snapshot.priority,
        previousDueAt: record.dueAt,
        newDueAt: snapshot.dueAt,
        actorType: 'OPERATOR',
        actorId: authenticated.operatorId,
        correlationId: context.requestId ?? null,
        occurredAt: snapshot.updatedAt,
        metadata: null,
      }, this.deps.ids);
      await this.deps.tasks.update(snapshot, input.expectedVersion, entry);
      return taskProjection(snapshot, await this.deps.claims.getById(snapshot.claimId));
    } catch (error) {
      this.rethrowMutationConflict(error);
    }
  }

  async completeTask(input: { taskId: string; expectedStatus: ClaimTaskStatus }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireTaskPermission(actor, 'manage');
    const record = await this.deps.tasks.getById(input.taskId);
    if (!record) throw new ClaimTaskApplicationError('TASK_NOT_FOUND', 'The task could not be found.');
    try {
      const task = ClaimTask.rehydrate(record);
      task.complete(input.expectedStatus, authenticated.operatorId, this.deps.clock.now());
      const snapshot = task.snapshot();
      await this.deps.tasks.complete(snapshot, input.expectedStatus, record.version, history({
        taskId: snapshot.id,
        eventType: 'COMPLETED',
        fromStatus: record.status,
        toStatus: snapshot.status,
        previousAssignedOperatorId: record.assignedOperatorId,
        newAssignedOperatorId: snapshot.assignedOperatorId,
        previousPriority: record.priority,
        newPriority: snapshot.priority,
        previousDueAt: record.dueAt,
        newDueAt: snapshot.dueAt,
        actorType: 'OPERATOR',
        actorId: authenticated.operatorId,
        correlationId: context.requestId ?? null,
        occurredAt: snapshot.updatedAt,
        metadata: null,
      }, this.deps.ids));
      return taskProjection(snapshot, await this.deps.claims.getById(snapshot.claimId));
    } catch (error) {
      this.rethrowMutationConflict(error);
    }
  }

  async cancelTask(input: { taskId: string; expectedVersion: number; reason: ClaimTaskCancellationReason }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireTaskPermission(actor, 'manage');
    const record = await this.deps.tasks.getById(input.taskId);
    if (!record) throw new ClaimTaskApplicationError('TASK_NOT_FOUND', 'The task could not be found.');
    try {
      const task = ClaimTask.rehydrate(record);
      task.cancel(input.expectedVersion, authenticated.operatorId, input.reason, this.deps.clock.now());
      const snapshot = task.snapshot();
      await this.deps.tasks.cancel(snapshot, input.expectedVersion, history({
        taskId: snapshot.id,
        eventType: 'CANCELLED',
        fromStatus: record.status,
        toStatus: snapshot.status,
        previousAssignedOperatorId: record.assignedOperatorId,
        newAssignedOperatorId: snapshot.assignedOperatorId,
        previousPriority: record.priority,
        newPriority: snapshot.priority,
        previousDueAt: record.dueAt,
        newDueAt: snapshot.dueAt,
        actorType: 'OPERATOR',
        actorId: authenticated.operatorId,
        correlationId: context.requestId ?? null,
        occurredAt: snapshot.updatedAt,
        metadata: { reason: input.reason },
      }, this.deps.ids));
      return taskProjection(snapshot, await this.deps.claims.getById(snapshot.claimId));
    } catch (error) {
      this.rethrowMutationConflict(error);
    }
  }

  private rethrowMutationConflict(error: unknown): never {
    if (error instanceof ClaimTaskVersionConflictError) {
      throw new ClaimTaskApplicationError('RESOURCE_VERSION_CONFLICT', 'The task changed before this action was committed.', {
        expectedVersion: error.expectedVersion,
        actualVersion: error.actualVersion,
      });
    }
    if (error instanceof ClaimTaskStateConflictError) {
      throw new ClaimTaskApplicationError('TASK_STATE_CONFLICT', 'The task changed before this action was committed.', {
        expectedStatus: error.expectedStatus,
        actualStatus: error.actualStatus,
      });
    }
    if (error instanceof InvalidClaimTaskStateError) {
      throw new ClaimTaskApplicationError('INVALID_TASK_STATE', 'The task cannot be mutated from its current state.', {
        actualStatus: error.actualStatus,
      });
    }
    throw error;
  }
}
