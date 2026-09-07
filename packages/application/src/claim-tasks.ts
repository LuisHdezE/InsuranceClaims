import {
  ApplicationError,
  type ActorContext,
  type ClaimRepository,
  type ClockPort,
  type IdGeneratorPort,
} from './index.js';
import {
  ClaimTask,
  ClaimTaskStateConflictError,
  type ClaimTaskProps,
  type ClaimTaskStatus,
  type ClaimTaskType,
} from '@insurance/domain/claim-task';

export type ClaimTaskApplicationErrorCode = 'TASK_NOT_FOUND' | 'TASK_STATE_CONFLICT';

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

export interface ClaimTaskRepository {
  createIfAbsent(task: ClaimTaskProps): Promise<ClaimTaskProps>;
  list(input: {
    page: number;
    pageSize: number;
    status?: ClaimTaskStatus;
    type?: ClaimTaskType;
    claimId?: string;
  }): Promise<{ items: ClaimTaskProps[]; totalItems: number }>;
  getById(taskId: string): Promise<ClaimTaskProps | null>;
  complete(task: ClaimTaskProps, expectedStatus: ClaimTaskStatus): Promise<void>;
}

export interface ClaimTasksDependencies {
  claims: ClaimRepository;
  tasks: ClaimTaskRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

function requirePermission(actor: ActorContext | undefined, permission: 'claims.backoffice.read' | 'claims.backoffice.transition'): ActorContext {
  if (!actor) throw new ApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) throw new ApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  return actor;
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
    status: task.status,
    priority: task.priority,
    queue: task.queue,
    assignedOperatorId: task.assignedOperatorId,
    dueAt: task.dueAt?.toISOString() ?? null,
    createdByType: task.createdByType,
    createdById: task.createdById,
    correlationId: task.correlationId,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    completedById: task.completedById,
  };
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
      await this.deps.tasks.createIfAbsent(task.snapshot());
    }
  }

  async listTasks(input: { page?: number; pageSize?: number; status?: ClaimTaskStatus; type?: ClaimTaskType; claimId?: string }, actor?: ActorContext) {
    requirePermission(actor, 'claims.backoffice.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid task pagination parameters.');
    }
    const result = await this.deps.tasks.list({ page, pageSize, status: input.status, type: input.type, claimId: input.claimId });
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
    requirePermission(actor, 'claims.backoffice.read');
    const detail = await this.deps.claims.getById(claimId);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');
    const result = await this.deps.tasks.list({ page: 1, pageSize: 100, claimId });
    return Promise.all(result.items.map((task) => Promise.resolve(taskProjection(task, detail))));
  }

  async completeTask(input: { taskId: string; expectedStatus: ClaimTaskStatus }, actor?: ActorContext) {
    const authenticated = requirePermission(actor, 'claims.backoffice.transition');
    const record = await this.deps.tasks.getById(input.taskId);
    if (!record) throw new ClaimTaskApplicationError('TASK_NOT_FOUND', 'The task could not be found.');
    try {
      const task = ClaimTask.rehydrate(record);
      task.complete(input.expectedStatus, authenticated.operatorId, this.deps.clock.now());
      const snapshot = task.snapshot();
      await this.deps.tasks.complete(snapshot, input.expectedStatus);
      const claim = await this.deps.claims.getById(snapshot.claimId);
      return taskProjection(snapshot, claim);
    } catch (error) {
      if (error instanceof ClaimTaskStateConflictError) {
        throw new ClaimTaskApplicationError('TASK_STATE_CONFLICT', 'The task changed before this action was committed.', {
          expectedStatus: error.expectedStatus,
          actualStatus: error.actualStatus,
        });
      }
      throw error;
    }
  }
}
