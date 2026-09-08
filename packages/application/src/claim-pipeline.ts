import {
  InvalidOperationalStageTransitionError,
  PipelineWorkItem,
  PipelineWorkItemVersionConflictError,
  type PipelineActorType,
  type PipelineConsumerType,
  type PipelineStageDefinition,
  type PipelineVersionDefinition,
  type PipelineWorkItemProps,
} from '@insurance/domain';
import {
  actorTypeForStaffRole,
  type ActorContext,
  type ClaimRepository,
  type ClockPort,
  type IdGeneratorPort,
  type RequestContext,
} from './index.js';

export type PipelineApplicationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'INVALID_OPERATIONAL_STAGE_TRANSITION';

export class PipelineApplicationError extends Error {
  constructor(readonly code: PipelineApplicationErrorCode, message: string) {
    super(message);
    this.name = 'PipelineApplicationError';
  }
}

export interface PipelineDefinitionRecord {
  id: string;
  key: string;
  consumerType: PipelineConsumerType;
  displayName: string;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineWorkItemHistoryRecord {
  id: string;
  workItemId: string;
  fromStageId: string | null;
  toStageId: string;
  pipelineVersionId: string;
  actorType: PipelineActorType;
  actorId: string | null;
  correlationId: string | null;
  occurredAt: Date;
}

export interface PipelineMovementAuditRecord {
  id: string;
  eventCode: 'PIPELINE_STAGE_MOVED';
  occurredAt: Date;
  actorType: 'OPERATOR' | 'SUPERVISOR' | 'ADMINISTRATOR';
  actorId: string;
  targetType: 'PIPELINE_WORK_ITEM';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface PipelineWorkItemRepository {
  findActiveVersionForConsumer(consumerType: PipelineConsumerType): Promise<PipelineVersionDefinition | null>;
  findVersion(versionId: string): Promise<PipelineVersionDefinition | null>;
  findWorkItemForConsumer(consumerType: PipelineConsumerType, consumerId: string): Promise<PipelineWorkItemProps | null>;
  createWorkItemIfAbsent(workItem: PipelineWorkItemProps, history: PipelineWorkItemHistoryRecord): Promise<PipelineWorkItemProps>;
  moveWorkItem(
    workItem: PipelineWorkItemProps,
    expectedVersion: number,
    history: PipelineWorkItemHistoryRecord,
    audit: PipelineMovementAuditRecord,
  ): Promise<void>;
  listHistory(workItemId: string): Promise<PipelineWorkItemHistoryRecord[]>;
}

export interface ClaimPipelineApplicationDependencies {
  claims: Pick<ClaimRepository, 'getById'>;
  pipelines: PipelineWorkItemRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

function requirePermission(actor: ActorContext | undefined, permission: 'claims.pipeline.transition'): ActorContext {
  if (!actor) throw new PipelineApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) throw new PipelineApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  return actor;
}

function initialStage(version: PipelineVersionDefinition): PipelineStageDefinition | null {
  if (version.status !== 'ACTIVE' || version.stages.length === 0) return null;
  return [...version.stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))[0] ?? null;
}

export class ClaimPipelineApplication {
  constructor(private readonly deps: ClaimPipelineApplicationDependencies) {}

  async ensureInitialClaimProjection(input: { claimId: string; correlationId?: string | null }) {
    const claim = await this.deps.claims.getById(input.claimId);
    if (!claim) return null;
    const existing = await this.deps.pipelines.findWorkItemForConsumer('CLAIM', input.claimId);
    if (existing) return this.toProjection(existing, claim.claim.status);

    const version = await this.deps.pipelines.findActiveVersionForConsumer('CLAIM');
    if (!version) return null;
    const stage = initialStage(version);
    if (!stage) return null;

    const at = this.deps.clock.now();
    const workItem = PipelineWorkItem.create({
      id: this.deps.ids.uuid(),
      consumerType: 'CLAIM',
      consumerId: input.claimId,
      pipelineDefinitionId: version.definitionId,
      pipelineVersionId: version.id,
      currentStageId: stage.id,
      createdAt: at,
      updatedAt: at,
    }).snapshot();
    const persisted = await this.deps.pipelines.createWorkItemIfAbsent(workItem, {
      id: this.deps.ids.uuid(),
      workItemId: workItem.id,
      fromStageId: null,
      toStageId: stage.id,
      pipelineVersionId: version.id,
      actorType: 'SYSTEM',
      actorId: null,
      correlationId: input.correlationId ?? null,
      occurredAt: at,
    });
    return this.toProjection(persisted, claim.claim.status);
  }

  async moveClaimOperationalStage(
    input: { claimId: string; toStageKey: string; expectedVersion: number },
    actor?: ActorContext,
    context: RequestContext = {},
  ) {
    const authenticated = requirePermission(actor, 'claims.pipeline.transition');
    const claim = await this.deps.claims.getById(input.claimId);
    if (!claim) throw new PipelineApplicationError('RESOURCE_NOT_FOUND', 'The operational work item could not be found.');
    const current = await this.deps.pipelines.findWorkItemForConsumer('CLAIM', input.claimId);
    if (!current) throw new PipelineApplicationError('RESOURCE_NOT_FOUND', 'The operational work item could not be found.');
    const version = await this.deps.pipelines.findVersion(current.pipelineVersionId);
    if (!version) throw new PipelineApplicationError('RESOURCE_NOT_FOUND', 'The pinned pipeline version could not be found.');

    const aggregate = PipelineWorkItem.rehydrate(current);
    const at = this.deps.clock.now();
    let movement: { fromStage: PipelineStageDefinition; toStage: PipelineStageDefinition };
    try {
      movement = aggregate.move({
        toStageKey: input.toStageKey,
        expectedVersion: input.expectedVersion,
        pipelineVersion: version,
        at,
      });
    } catch (error) {
      if (error instanceof PipelineWorkItemVersionConflictError) {
        throw new PipelineApplicationError('RESOURCE_VERSION_CONFLICT', 'The operational work item changed before this move could be applied.');
      }
      if (error instanceof InvalidOperationalStageTransitionError) {
        throw new PipelineApplicationError('INVALID_OPERATIONAL_STAGE_TRANSITION', 'The requested operational stage movement is not allowed by the pinned pipeline version.');
      }
      throw error;
    }

    const snapshot = aggregate.snapshot();
    const actorType = actorTypeForStaffRole(authenticated.role);
    const history: PipelineWorkItemHistoryRecord = {
      id: this.deps.ids.uuid(),
      workItemId: snapshot.id,
      fromStageId: movement.fromStage.id,
      toStageId: movement.toStage.id,
      pipelineVersionId: snapshot.pipelineVersionId,
      actorType,
      actorId: authenticated.operatorId,
      correlationId: context.requestId ?? null,
      occurredAt: at,
    };
    const audit: PipelineMovementAuditRecord = {
      id: this.deps.ids.uuid(),
      eventCode: 'PIPELINE_STAGE_MOVED',
      occurredAt: at,
      actorType,
      actorId: authenticated.operatorId,
      targetType: 'PIPELINE_WORK_ITEM',
      targetId: snapshot.id,
      outcome: 'SUCCESS',
      requestId: context.requestId ?? null,
      metadata: {
        claimId: input.claimId,
        pipelineDefinitionId: snapshot.pipelineDefinitionId,
        pipelineVersionId: snapshot.pipelineVersionId,
        fromStageKey: movement.fromStage.key,
        toStageKey: movement.toStage.key,
        version: snapshot.version,
      },
    };

    try {
      await this.deps.pipelines.moveWorkItem(snapshot, input.expectedVersion, history, audit);
    } catch (error) {
      if (error instanceof PipelineWorkItemVersionConflictError) {
        throw new PipelineApplicationError('RESOURCE_VERSION_CONFLICT', 'The operational work item changed before this move could be applied.');
      }
      throw error;
    }

    return this.toProjection(snapshot, claim.claim.status, version);
  }

  private async toProjection(workItem: PipelineWorkItemProps, claimStatus: string, knownVersion?: PipelineVersionDefinition) {
    const version = knownVersion ?? await this.deps.pipelines.findVersion(workItem.pipelineVersionId);
    const currentStage = version?.stages.find((stage) => stage.id === workItem.currentStageId) ?? null;
    return {
      workItemId: workItem.id,
      consumerType: workItem.consumerType,
      consumerId: workItem.consumerId,
      claimId: workItem.consumerId,
      pipelineDefinitionId: workItem.pipelineDefinitionId,
      pipelineVersionId: workItem.pipelineVersionId,
      currentStage: currentStage ? {
        stageKey: currentStage.key,
        displayName: currentStage.displayName,
        sortOrder: currentStage.sortOrder,
      } : null,
      allowedNextStageKeys: currentStage ? [...currentStage.allowedNextStageKeys] : [],
      version: workItem.version,
      claimStatus,
      createdAt: workItem.createdAt.toISOString(),
      updatedAt: workItem.updatedAt.toISOString(),
    };
  }
}
