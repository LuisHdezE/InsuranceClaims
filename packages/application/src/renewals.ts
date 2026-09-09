import {
  InvalidOperationalStageTransitionError,
  InvalidRenewalCaseTransitionError,
  PipelineWorkItem,
  PipelineWorkItemVersionConflictError,
  RenewalCase,
  RenewalCaseVersionConflictError,
  allowedRenewalCaseTransitions,
  isRenewalCaseTerminalStatus,
  type PipelineStageDefinition,
  type RenewalCaseProps,
  type RenewalCaseTerminalStatus,
} from '@insurance/domain';
import {
  actorTypeForStaffRole,
  type ActorContext,
  type ClockPort,
  type IdGeneratorPort,
  type RequestContext,
} from './index.js';
import type { CustomerPolicyRepository } from './customer-policy.js';
import type {
  PipelineMovementAuditRecord,
  PipelineWorkItemHistoryRecord,
  PipelineWorkItemRepository,
} from './claim-pipeline.js';

export type RenewalApplicationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'INVALID_OPERATIONAL_STAGE_TRANSITION'
  | 'VALIDATION_ERROR';

export class RenewalApplicationError extends Error {
  constructor(readonly code: RenewalApplicationErrorCode, message: string) {
    super(message);
    this.name = 'RenewalApplicationError';
  }
}

export interface RenewalCaseAuditRecord {
  id: string;
  eventCode: 'RENEWAL_CASE_COMPLETED' | 'RENEWAL_CASE_CANCELLED';
  occurredAt: Date;
  actorType: 'OPERATOR' | 'SUPERVISOR';
  actorId: string;
  targetType: 'RENEWAL_CASE';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type RenewalMutationResult =
  | { outcome: 'UPDATED' }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'STALE'; actualVersion: number };

export interface RenewalCaseRepository {
  list(input: { page: number; pageSize: number }): Promise<{ items: RenewalCaseProps[]; totalItems: number }>;
  getById(renewalId: string): Promise<RenewalCaseProps | null>;
  transition(caseRecord: RenewalCaseProps, expectedVersion: number, audit: RenewalCaseAuditRecord): Promise<RenewalMutationResult>;
}

export interface RenewalsApplicationDependencies {
  renewals: RenewalCaseRepository;
  customerPolicy: Pick<CustomerPolicyRepository, 'getCustomer' | 'getPolicy'>;
  pipelines: PipelineWorkItemRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

function requirePermission(actor: ActorContext | undefined, permission: 'renewals.read' | 'renewals.manage'): ActorContext {
  if (!actor) throw new RenewalApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) {
    throw new RenewalApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  }
  return actor;
}

function pagination(input: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RenewalApplicationError('VALIDATION_ERROR', 'Invalid pagination parameters.');
  }
  return { page, pageSize };
}

export class RenewalsApplication {
  constructor(private readonly deps: RenewalsApplicationDependencies) {}

  async listRenewalCases(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requirePermission(actor, 'renewals.read');
    const { page, pageSize } = pagination(input);
    const result = await this.deps.renewals.list({ page, pageSize });
    return {
      items: await Promise.all(result.items.map((item) => this.toCaseProjection(item))),
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async getRenewalCase(renewalId: string, actor?: ActorContext) {
    requirePermission(actor, 'renewals.read');
    const item = await this.deps.renewals.getById(renewalId);
    if (!item) throw new RenewalApplicationError('RESOURCE_NOT_FOUND', 'The renewal case could not be found.');
    return this.toCaseProjection(item);
  }

  async transitionRenewalCase(
    input: { renewalId: string; toStatus: string; expectedVersion: number },
    actor?: ActorContext,
    context: RequestContext = {},
  ) {
    const authenticated = requirePermission(actor, 'renewals.manage');
    if (!isRenewalCaseTerminalStatus(input.toStatus)) {
      throw new RenewalApplicationError('VALIDATION_ERROR', 'toStatus must be COMPLETED or CANCELLED.');
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new RenewalApplicationError('VALIDATION_ERROR', 'expectedVersion must be a positive integer.');
    }

    const current = await this.deps.renewals.getById(input.renewalId);
    if (!current) throw new RenewalApplicationError('RESOURCE_NOT_FOUND', 'The renewal case could not be found.');

    const aggregate = RenewalCase.rehydrate(current);
    const at = this.deps.clock.now();
    let transition: { fromStatus: 'OPEN'; toStatus: RenewalCaseTerminalStatus };
    try {
      transition = aggregate.transition(input.toStatus, input.expectedVersion, at);
    } catch (error) {
      if (error instanceof RenewalCaseVersionConflictError) {
        throw new RenewalApplicationError('RESOURCE_VERSION_CONFLICT', 'The renewal case changed before this transition could be applied.');
      }
      if (error instanceof InvalidRenewalCaseTransitionError) {
        throw new RenewalApplicationError('INVALID_STATE_TRANSITION', 'The requested renewal case transition is not allowed.');
      }
      throw error;
    }

    const snapshot = aggregate.snapshot();
    const actorType = actorTypeForStaffRole(authenticated.role);
    if (actorType === 'ADMINISTRATOR') {
      throw new RenewalApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
    }
    const audit: RenewalCaseAuditRecord = {
      id: this.deps.ids.uuid(),
      eventCode: transition.toStatus === 'COMPLETED' ? 'RENEWAL_CASE_COMPLETED' : 'RENEWAL_CASE_CANCELLED',
      occurredAt: at,
      actorType,
      actorId: authenticated.operatorId,
      targetType: 'RENEWAL_CASE',
      targetId: snapshot.id,
      outcome: 'SUCCESS',
      requestId: context.requestId ?? null,
      metadata: {
        customerId: snapshot.customerId,
        policyId: snapshot.policyId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        version: snapshot.version,
        sourceClassification: 'SYNTHETIC_DEMO',
      },
    };

    const result = await this.deps.renewals.transition(snapshot, input.expectedVersion, audit);
    if (result.outcome === 'NOT_FOUND') {
      throw new RenewalApplicationError('RESOURCE_NOT_FOUND', 'The renewal case could not be found.');
    }
    if (result.outcome === 'STALE') {
      throw new RenewalApplicationError('RESOURCE_VERSION_CONFLICT', 'The renewal case changed before this transition could be applied.');
    }
    return this.toCaseProjection(snapshot);
  }

  async moveRenewalOperationalStage(
    input: { renewalId: string; toStageKey: string; expectedVersion: number },
    actor?: ActorContext,
    context: RequestContext = {},
  ) {
    const authenticated = requirePermission(actor, 'renewals.manage');
    const renewal = await this.deps.renewals.getById(input.renewalId);
    if (!renewal) throw new RenewalApplicationError('RESOURCE_NOT_FOUND', 'The renewal case could not be found.');
    const current = await this.deps.pipelines.findWorkItemForConsumer('RENEWAL', input.renewalId);
    if (!current) throw new RenewalApplicationError('RESOURCE_NOT_FOUND', 'The renewal operational work item could not be found.');
    const version = await this.deps.pipelines.findVersion(current.pipelineVersionId);
    if (!version) throw new RenewalApplicationError('RESOURCE_NOT_FOUND', 'The pinned pipeline version could not be found.');

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
        throw new RenewalApplicationError('RESOURCE_VERSION_CONFLICT', 'The renewal operational work item changed before this move could be applied.');
      }
      if (error instanceof InvalidOperationalStageTransitionError) {
        throw new RenewalApplicationError('INVALID_OPERATIONAL_STAGE_TRANSITION', 'The requested operational stage movement is not allowed by the pinned pipeline version.');
      }
      throw error;
    }

    const snapshot = aggregate.snapshot();
    const actorType = actorTypeForStaffRole(authenticated.role);
    if (actorType === 'ADMINISTRATOR') {
      throw new RenewalApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
    }
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
        consumerType: 'RENEWAL',
        renewalId: input.renewalId,
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
        throw new RenewalApplicationError('RESOURCE_VERSION_CONFLICT', 'The renewal operational work item changed before this move could be applied.');
      }
      throw error;
    }

    return this.toPipelineProjection(snapshot, version.stages);
  }

  private async toCaseProjection(item: RenewalCaseProps) {
    const [customer, policy, workItem] = await Promise.all([
      this.deps.customerPolicy.getCustomer(item.customerId),
      this.deps.customerPolicy.getPolicy(item.policyId),
      this.deps.pipelines.findWorkItemForConsumer('RENEWAL', item.id),
    ]);
    const pipelineVersion = workItem ? await this.deps.pipelines.findVersion(workItem.pipelineVersionId) : null;
    return {
      renewalId: item.id,
      customerId: item.customerId,
      policyId: item.policyId,
      status: item.status,
      allowedTransitions: [...allowedRenewalCaseTransitions(item.status)],
      version: item.version,
      customer: customer ? {
        customerRef: customer.customerRef,
        displayName: customer.displayName,
        status: customer.status,
      } : null,
      policy: policy ? {
        policyReference: policy.policyReference,
        insurerReference: policy.insurerReference,
        recordStatus: policy.recordStatus,
      } : null,
      pipeline: workItem && pipelineVersion ? this.toPipelineProjection(workItem, pipelineVersion.stages) : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      completedAt: item.completedAt?.toISOString() ?? null,
      cancelledAt: item.cancelledAt?.toISOString() ?? null,
    };
  }

  private toPipelineProjection(workItem: ReturnType<PipelineWorkItem['snapshot']>, stages: readonly PipelineStageDefinition[]) {
    const currentStage = stages.find((stage) => stage.id === workItem.currentStageId) ?? null;
    return {
      workItemId: workItem.id,
      consumerType: workItem.consumerType,
      consumerId: workItem.consumerId,
      pipelineDefinitionId: workItem.pipelineDefinitionId,
      pipelineVersionId: workItem.pipelineVersionId,
      currentStage: currentStage ? {
        stageKey: currentStage.key,
        displayName: currentStage.displayName,
        sortOrder: currentStage.sortOrder,
      } : null,
      allowedNextStageKeys: currentStage ? [...currentStage.allowedNextStageKeys] : [],
      version: workItem.version,
      createdAt: workItem.createdAt.toISOString(),
      updatedAt: workItem.updatedAt.toISOString(),
    };
  }
}
