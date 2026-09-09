import { isClaimStatus } from '@insurance/domain';
import {
  ApplicationError,
  type ActorContext,
  type ClockPort,
  type HashPort,
  type IdGeneratorPort,
  type RequestContext,
} from './index.js';

export type BulkActionType = 'transitionClaimStatus';
export type BulkItemOutcome = 'SUCCEEDED' | 'FAILED';

export interface BulkClaimTransitionItem {
  claimId: string;
  expectedFromStatus: string;
}

export interface ExecuteBulkOperationInput {
  idempotencyKey: string;
  actionType: string;
  action: { toStatus: string };
  items: readonly BulkClaimTransitionItem[];
}

export interface BulkOperationItemResult {
  index: number;
  resourceType: 'CLAIM';
  resourceId: string;
  outcome: BulkItemOutcome;
  code: string | null;
  fromStatus: string | null;
  toStatus: string | null;
}

export interface BulkOperationResponse {
  bulkOperationId: string;
  actionType: BulkActionType;
  selectedItemCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: 0;
  allSucceeded: boolean;
  results: BulkOperationItemResult[];
  completedAt: string;
}

export type BulkActionsErrorCode = 'BULK_ACTION_INVALID';

export class BulkActionsError extends Error {
  constructor(readonly code: BulkActionsErrorCode, message: string) {
    super(message);
    this.name = 'BulkActionsError';
  }
}

export interface BulkAuditRecord {
  id: string;
  eventCode: 'BULK_OPERATION_REQUESTED' | 'BULK_OPERATION_COMPLETED';
  occurredAt: Date;
  actorType: 'SUPERVISOR';
  actorId: string;
  targetType: 'BULK_OPERATION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface BulkReservationInput {
  scope: 'executeBulkOperation';
  keyHash: string;
  requestFingerprint: string;
  bulkOperationId: string;
  createdAt: Date;
  expiresAt: Date;
  requestedAudit: BulkAuditRecord;
}

export type BulkBeginResult =
  | { outcome: 'STARTED' }
  | { outcome: 'REPLAY'; response: BulkOperationResponse }
  | { outcome: 'CONFLICT' }
  | { outcome: 'IN_PROGRESS' };

export interface BulkOperationRepository {
  begin(input: BulkReservationInput): Promise<BulkBeginResult>;
  complete(input: {
    scope: 'executeBulkOperation';
    keyHash: string;
    response: BulkOperationResponse;
    completedAudit: BulkAuditRecord;
  }): Promise<void>;
}

export interface ClaimTransitionCommandPort {
  transitionClaimStatus(
    input: { claimId: string; expectedFromStatus: string; toStatus: string },
    actor?: ActorContext,
    context?: RequestContext,
  ): Promise<{
    claimId: string;
    fromStatus: string;
    toStatus: string;
    status: string;
  }>;
}

export interface BulkActionsDependencies {
  repository: BulkOperationRepository;
  claims: ClaimTransitionCommandPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  hash: HashPort;
}

function requireSupervisor(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new ApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (actor.role !== 'CLAIMS_SUPERVISOR' || !actor.permissions.includes('bulk.execute')) {
    throw new ApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  }
  return actor;
}

function requireIdempotencyKey(value: string): string {
  if (!value || value.length < 16 || value.length > 128) {
    throw new ApplicationError('VALIDATION_ERROR', 'Idempotency-Key must contain 16 to 128 characters.');
  }
  return value;
}

function validateRequest(input: ExecuteBulkOperationInput): {
  actionType: BulkActionType;
  toStatus: string;
  items: BulkClaimTransitionItem[];
} {
  if (input.actionType !== 'transitionClaimStatus') {
    throw new BulkActionsError('BULK_ACTION_INVALID', 'The requested bulk action type is not allowlisted.');
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    throw new BulkActionsError('BULK_ACTION_INVALID', 'Bulk operations require between 1 and 100 selected items.');
  }
  if (!input.action || !isClaimStatus(input.action.toStatus)) {
    throw new BulkActionsError('BULK_ACTION_INVALID', 'The Claim transition target status is not valid.');
  }
  const ids = new Set<string>();
  const items = input.items.map((item) => ({
    claimId: item.claimId,
    expectedFromStatus: item.expectedFromStatus,
  }));
  for (const item of items) {
    if (!item.claimId || ids.has(item.claimId)) {
      throw new BulkActionsError('BULK_ACTION_INVALID', 'Bulk selections must contain unique Claim identifiers.');
    }
    ids.add(item.claimId);
  }
  return { actionType: 'transitionClaimStatus', toStatus: input.action.toStatus, items };
}

function safeItemFailure(error: unknown): { code: string } {
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    return { code: (error as { code: string }).code };
  }
  return { code: 'SERVICE_DEPENDENCY_UNAVAILABLE' };
}

export class BulkActionsApplication {
  constructor(private readonly deps: BulkActionsDependencies) {}

  async executeBulkOperation(
    input: ExecuteBulkOperationInput,
    actor?: ActorContext,
    context: RequestContext = {},
  ): Promise<{ response: BulkOperationResponse; replayed: boolean }> {
    const supervisor = requireSupervisor(actor);
    const idempotencyKey = requireIdempotencyKey(input.idempotencyKey);
    const request = validateRequest(input);
    const keyHash = await this.deps.hash.sha256(idempotencyKey);
    const requestFingerprint = await this.deps.hash.sha256(JSON.stringify({
      actionType: request.actionType,
      action: { toStatus: request.toStatus },
      items: request.items,
    }));
    const bulkOperationId = this.deps.ids.uuid();
    const startedAt = this.deps.clock.now();

    let begin: BulkBeginResult;
    try {
      begin = await this.deps.repository.begin({
        scope: 'executeBulkOperation',
        keyHash,
        requestFingerprint,
        bulkOperationId,
        createdAt: startedAt,
        expiresAt: new Date(startedAt.getTime() + 24 * 60 * 60 * 1000),
        requestedAudit: {
          id: this.deps.ids.uuid(),
          eventCode: 'BULK_OPERATION_REQUESTED',
          occurredAt: startedAt,
          actorType: 'SUPERVISOR',
          actorId: supervisor.operatorId,
          targetType: 'BULK_OPERATION',
          targetId: bulkOperationId,
          outcome: 'SUCCESS',
          requestId: context.requestId ?? null,
          metadata: {
            actionType: request.actionType,
            selectedItemCount: request.items.length,
            bulkRequestIdentity: bulkOperationId,
          },
        },
      });
    } catch {
      throw new ApplicationError('SERVICE_DEPENDENCY_UNAVAILABLE', 'The bulk operation could not be reserved safely.');
    }

    if (begin.outcome === 'REPLAY') return { response: begin.response, replayed: true };
    if (begin.outcome === 'CONFLICT') {
      throw new ApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different request.');
    }
    if (begin.outcome === 'IN_PROGRESS') {
      throw new ApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original bulk request is still being processed.');
    }

    const results: BulkOperationItemResult[] = [];
    for (let index = 0; index < request.items.length; index += 1) {
      const item = request.items[index]!;
      try {
        const result = await this.deps.claims.transitionClaimStatus({
          claimId: item.claimId,
          expectedFromStatus: item.expectedFromStatus,
          toStatus: request.toStatus,
        }, supervisor, context);
        results.push({
          index,
          resourceType: 'CLAIM',
          resourceId: item.claimId,
          outcome: 'SUCCEEDED',
          code: null,
          fromStatus: result.fromStatus,
          toStatus: result.toStatus,
        });
      } catch (error) {
        const failure = safeItemFailure(error);
        results.push({
          index,
          resourceType: 'CLAIM',
          resourceId: item.claimId,
          outcome: 'FAILED',
          code: failure.code,
          fromStatus: null,
          toStatus: null,
        });
      }
    }

    const succeededCount = results.filter((item) => item.outcome === 'SUCCEEDED').length;
    const failedCount = results.length - succeededCount;
    const completedAt = this.deps.clock.now();
    const response: BulkOperationResponse = {
      bulkOperationId,
      actionType: request.actionType,
      selectedItemCount: results.length,
      succeededCount,
      failedCount,
      skippedCount: 0,
      allSucceeded: failedCount === 0,
      results,
      completedAt: completedAt.toISOString(),
    };

    try {
      await this.deps.repository.complete({
        scope: 'executeBulkOperation',
        keyHash,
        response,
        completedAudit: {
          id: this.deps.ids.uuid(),
          eventCode: 'BULK_OPERATION_COMPLETED',
          occurredAt: completedAt,
          actorType: 'SUPERVISOR',
          actorId: supervisor.operatorId,
          targetType: 'BULK_OPERATION',
          targetId: bulkOperationId,
          outcome: 'SUCCESS',
          requestId: context.requestId ?? null,
          metadata: {
            actionType: request.actionType,
            selectedItemCount: results.length,
            succeededCount,
            failedCount,
            skippedCount: 0,
            allSucceeded: failedCount === 0,
            bulkRequestIdentity: bulkOperationId,
          },
        },
      });
    } catch {
      // Fail closed. The reservation intentionally remains IN_PROGRESS so a retry cannot
      // duplicate already-applied single-item effects when final persistence is uncertain.
      throw new ApplicationError('SERVICE_DEPENDENCY_UNAVAILABLE', 'The bulk operation result could not be finalized safely.');
    }

    return { response, replayed: false };
  }
}
