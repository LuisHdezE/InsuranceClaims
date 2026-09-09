import {
  CollectionCase,
  CollectionCaseVersionConflictError,
  InvalidCollectionCaseTransitionError,
  InvalidCollectionPaymentStateError,
  InvalidOperationalStageTransitionError,
  PipelineWorkItem,
  PipelineWorkItemVersionConflictError,
  allowedCollectionCaseTransitions,
  isCollectionCaseTerminalStatus,
  type CollectionCaseProps,
  type CollectionCaseTerminalStatus,
  type PipelineStageDefinition,
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

export type CollectionApplicationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'INVALID_STATE_TRANSITION'
  | 'INVALID_OPERATIONAL_STAGE_TRANSITION'
  | 'VALIDATION_ERROR';

export class CollectionApplicationError extends Error {
  constructor(readonly code: CollectionApplicationErrorCode, message: string) {
    super(message);
    this.name = 'CollectionApplicationError';
  }
}

export interface CollectionCaseAuditRecord {
  id: string;
  eventCode: 'COLLECTION_CASE_COMPLETED' | 'COLLECTION_CASE_CANCELLED' | 'COLLECTION_PAYMENT_STATE_CHANGED';
  occurredAt: Date;
  actorType: 'OPERATOR' | 'SUPERVISOR';
  actorId: string;
  targetType: 'COLLECTION_CASE';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type CollectionMutationResult =
  | { outcome: 'UPDATED' }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'STALE'; actualVersion: number };

export interface CollectionCaseRepository {
  list(input: { page: number; pageSize: number }): Promise<{ items: CollectionCaseProps[]; totalItems: number }>;
  getById(collectionId: string): Promise<CollectionCaseProps | null>;
  transition(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult>;
  updatePaymentState(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult>;
}

export type CollectionPaymentStateVerificationResult =
  | { approved: false }
  | { approved: true; paymentState: string; verificationPolicy: string };

export interface CollectionPaymentStateVerifier {
  verify(input: {
    collection: CollectionCaseProps;
    requestedPaymentState: string;
    actor: ActorContext;
    requestId: string | null;
  }): Promise<CollectionPaymentStateVerificationResult>;
}

export interface CollectionsApplicationDependencies {
  collections: CollectionCaseRepository;
  paymentStateVerifier: CollectionPaymentStateVerifier;
  customerPolicy: Pick<CustomerPolicyRepository, 'getCustomer' | 'getPolicy'>;
  pipelines: PipelineWorkItemRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

function requirePermission(actor: ActorContext | undefined, permission: 'collections.read' | 'collections.manage'): ActorContext {
  if (!actor) throw new CollectionApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) {
    throw new CollectionApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  }
  return actor;
}

function pagination(input: { page?: number; pageSize?: number }): { page: number; pageSize: number } {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new CollectionApplicationError('VALIDATION_ERROR', 'Invalid pagination parameters.');
  }
  return { page, pageSize };
}

function requireExpectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new CollectionApplicationError('VALIDATION_ERROR', 'expectedVersion must be a positive integer.');
  }
  return value;
}

function requirePaymentState(value: string): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > 80) {
    throw new CollectionApplicationError('VALIDATION_ERROR', 'paymentState must be a non-empty approved value of at most 80 characters.');
  }
  return normalized;
}

export class CollectionsApplication {
  constructor(private readonly deps: CollectionsApplicationDependencies) {}

  async listCollectionCases(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requirePermission(actor, 'collections.read');
    const { page, pageSize } = pagination(input);
    const result = await this.deps.collections.list({ page, pageSize });
    return {
      items: await Promise.all(result.items.map((item) => this.toCaseProjection(item))),
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async getCollectionCase(collectionId: string, actor?: ActorContext) {
    requirePermission(actor, 'collections.read');
    const item = await this.deps.collections.getById(collectionId);
    if (!item) throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The collection case could not be found.');
    return this.toCaseProjection(item);
  }

  async transitionCollectionCase(
    input: { collectionId: string; toStatus: string; expectedVersion: number },
    actor?: ActorContext,
    context: RequestContext = {},
  ) {
    const authenticated = requirePermission(actor, 'collections.manage');
    if (!isCollectionCaseTerminalStatus(input.toStatus)) {
      throw new CollectionApplicationError('VALIDATION_ERROR', 'toStatus must be COMPLETED or CANCELLED.');
    }
    requireExpectedVersion(input.expectedVersion);

    const current = await this.deps.collections.getById(input.collectionId);
    if (!current) throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The collection case could not be found.');

    const aggregate = CollectionCase.rehydrate(current);
    const at = this.deps.clock.now();
    let transition: { fromStatus: 'OPEN'; toStatus: CollectionCaseTerminalStatus };
    try {
      transition = aggregate.transition(input.toStatus, input.expectedVersion, at);
    } catch (error) {
      if (error instanceof CollectionCaseVersionConflictError) {
        throw new CollectionApplicationError('RESOURCE_VERSION_CONFLICT', 'The collection case changed before this transition could be applied.');
      }
      if (error instanceof InvalidCollectionCaseTransitionError) {
        throw new CollectionApplicationError('INVALID_STATE_TRANSITION', 'The requested collection case transition is not allowed.');
      }
      throw error;
    }

    const snapshot = aggregate.snapshot();
    const actorType = actorTypeForStaffRole(authenticated.role);
    if (actorType === 'ADMINISTRATOR') {
      throw new CollectionApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
    }
    const audit: CollectionCaseAuditRecord = {
      id: this.deps.ids.uuid(),
      eventCode: transition.toStatus === 'COMPLETED' ? 'COLLECTION_CASE_COMPLETED' : 'COLLECTION_CASE_CANCELLED',
      occurredAt: at,
      actorType,
      actorId: authenticated.operatorId,
      targetType: 'COLLECTION_CASE',
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

    const result = await this.deps.collections.transition(snapshot, input.expectedVersion, audit);
    this.assertMutationResult(result, 'transition');
    return this.toCaseProjection(snapshot);
  }

  async updateCollectionPaymentState(
    input: { collectionId: string; paymentState: string; expectedVersion: number },
    actor?: ActorContext,
    context: RequestContext = {},
  ) {
    const authenticated = requirePermission(actor, 'collections.manage');
    const requestedPaymentState = requirePaymentState(input.paymentState);
    requireExpectedVersion(input.expectedVersion);

    const current = await this.deps.collections.getById(input.collectionId);
    if (!current) throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The collection case could not be found.');
    if (current.version !== input.expectedVersion) {
      throw new CollectionApplicationError('RESOURCE_VERSION_CONFLICT', 'The collection case changed before this payment-state update could be applied.');
    }

    const verification = await this.deps.paymentStateVerifier.verify({
      collection: current,
      requestedPaymentState,
      actor: authenticated,
      requestId: context.requestId ?? null,
    });
    if (!verification.approved) {
      throw new CollectionApplicationError('VALIDATION_ERROR', 'The requested payment state could not be verified by the configured server policy.');
    }
    if (verification.paymentState === current.paymentState) {
      throw new CollectionApplicationError('VALIDATION_ERROR', 'The verified payment state is already current.');
    }

    const aggregate = CollectionCase.rehydrate(current);
    const at = this.deps.clock.now();
    let change: { fromPaymentState: string | null; toPaymentState: string };
    try {
      change = aggregate.changePaymentState(verification.paymentState, input.expectedVersion, at);
    } catch (error) {
      if (error instanceof CollectionCaseVersionConflictError) {
        throw new CollectionApplicationError('RESOURCE_VERSION_CONFLICT', 'The collection case changed before this payment-state update could be applied.');
      }
      if (error instanceof InvalidCollectionPaymentStateError) {
        throw new CollectionApplicationError('VALIDATION_ERROR', 'The verified payment state is invalid.');
      }
      throw error;
    }

    const snapshot = aggregate.snapshot();
    const actorType = actorTypeForStaffRole(authenticated.role);
    if (actorType === 'ADMINISTRATOR') {
      throw new CollectionApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
    }
    const audit: CollectionCaseAuditRecord = {
      id: this.deps.ids.uuid(),
      eventCode: 'COLLECTION_PAYMENT_STATE_CHANGED',
      occurredAt: at,
      actorType,
      actorId: authenticated.operatorId,
      targetType: 'COLLECTION_CASE',
      targetId: snapshot.id,
      outcome: 'SUCCESS',
      requestId: context.requestId ?? null,
      metadata: {
        customerId: snapshot.customerId,
        policyId: snapshot.policyId,
        fromPaymentState: change.fromPaymentState,
        toPaymentState: change.toPaymentState,
        version: snapshot.version,
        verificationPolicy: verification.verificationPolicy,
        sourceClassification: 'SYNTHETIC_DEMO',
      },
    };

    const result = await this.deps.collections.updatePaymentState(snapshot, input.expectedVersion, audit);
    this.assertMutationResult(result, 'payment-state update');
    return this.toCaseProjection(snapshot);
  }

  async moveCollectionOperationalStage(
    input: { collectionId: string; toStageKey: string; expectedVersion: number },
    actor?: ActorContext,
    context: RequestContext = {},
  ) {
    const authenticated = requirePermission(actor, 'collections.manage');
    const collection = await this.deps.collections.getById(input.collectionId);
    if (!collection) throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The collection case could not be found.');
    const current = await this.deps.pipelines.findWorkItemForConsumer('COLLECTION', input.collectionId);
    if (!current) throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The collection operational work item could not be found.');
    const version = await this.deps.pipelines.findVersion(current.pipelineVersionId);
    if (!version) throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The pinned pipeline version could not be found.');

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
        throw new CollectionApplicationError('RESOURCE_VERSION_CONFLICT', 'The collection operational work item changed before this move could be applied.');
      }
      if (error instanceof InvalidOperationalStageTransitionError) {
        throw new CollectionApplicationError('INVALID_OPERATIONAL_STAGE_TRANSITION', 'The requested operational stage movement is not allowed by the pinned pipeline version.');
      }
      throw error;
    }

    const snapshot = aggregate.snapshot();
    const actorType = actorTypeForStaffRole(authenticated.role);
    if (actorType === 'ADMINISTRATOR') {
      throw new CollectionApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
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
        consumerType: 'COLLECTION',
        collectionId: input.collectionId,
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
        throw new CollectionApplicationError('RESOURCE_VERSION_CONFLICT', 'The collection operational work item changed before this move could be applied.');
      }
      throw error;
    }

    return this.toPipelineProjection(snapshot, version.stages);
  }

  private assertMutationResult(result: CollectionMutationResult, operation: string): void {
    if (result.outcome === 'NOT_FOUND') {
      throw new CollectionApplicationError('RESOURCE_NOT_FOUND', 'The collection case could not be found.');
    }
    if (result.outcome === 'STALE') {
      throw new CollectionApplicationError('RESOURCE_VERSION_CONFLICT', `The collection case changed before this ${operation} could be applied.`);
    }
  }

  private async toCaseProjection(item: CollectionCaseProps) {
    const [customer, policy, workItem] = await Promise.all([
      this.deps.customerPolicy.getCustomer(item.customerId),
      this.deps.customerPolicy.getPolicy(item.policyId),
      this.deps.pipelines.findWorkItemForConsumer('COLLECTION', item.id),
    ]);
    const pipelineVersion = workItem ? await this.deps.pipelines.findVersion(workItem.pipelineVersionId) : null;
    return {
      collectionId: item.id,
      customerId: item.customerId,
      policyId: item.policyId,
      status: item.status,
      paymentState: item.paymentState,
      allowedTransitions: [...allowedCollectionCaseTransitions(item.status)],
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
