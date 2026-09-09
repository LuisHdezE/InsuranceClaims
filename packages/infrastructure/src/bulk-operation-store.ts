import type {
  AuditPort,
  IdempotencyPort,
  IdempotencyRecord,
  TransactionPort,
} from '@insurance/application';
import type {
  BulkBeginResult,
  BulkOperationRepository,
  BulkOperationResponse,
  BulkReservationInput,
} from '@insurance/application/bulk-actions';

export type BulkWorkflowStore = IdempotencyPort & AuditPort & TransactionPort;

function normalizeBulkResponse(value: unknown): BulkOperationResponse {
  const source = value as BulkOperationResponse;
  return {
    bulkOperationId: source.bulkOperationId,
    actionType: source.actionType,
    selectedItemCount: source.selectedItemCount,
    succeededCount: source.succeededCount,
    failedCount: source.failedCount,
    skippedCount: source.skippedCount,
    allSucceeded: source.allSucceeded,
    results: source.results.map((item) => ({
      index: item.index,
      resourceType: item.resourceType,
      resourceId: item.resourceId,
      outcome: item.outcome,
      code: item.code,
      fromStatus: item.fromStatus,
      toStatus: item.toStatus,
    })),
    completedAt: source.completedAt,
  };
}

function classifyExisting(
  record: IdempotencyRecord,
  requestFingerprint: string,
): BulkBeginResult {
  if (record.requestFingerprint !== requestFingerprint) return { outcome: 'CONFLICT' };
  if (record.status === 'COMPLETED' && record.responseReference) {
    // PostgreSQL JSONB preserves values but not object-key ordering. Rebuild the
    // response in contract order so an idempotent replay is transport-identical
    // to the original logical response rather than leaking storage representation.
    return { outcome: 'REPLAY', response: normalizeBulkResponse(record.responseReference) };
  }
  return { outcome: 'IN_PROGRESS' };
}

class BulkReservationRace extends Error {
  constructor() {
    super('Bulk reservation raced with another request.');
    this.name = 'BulkReservationRace';
  }
}

/**
 * Technical bulk orchestration persistence over the existing workflow store.
 * No Bulk domain table is introduced. Reservation/audit and completion/audit
 * are each committed atomically through the existing TransactionPort.
 */
export class WorkflowBulkOperationStore implements BulkOperationRepository {
  constructor(private readonly store: BulkWorkflowStore) {}

  async begin(input: BulkReservationInput): Promise<BulkBeginResult> {
    const existing = await this.store.get(input.scope, input.keyHash);
    if (existing) return classifyExisting(existing, input.requestFingerprint);

    try {
      await this.store.run(async (tx) => {
        const reserved = await tx.idempotency.reserve({
          scope: input.scope,
          keyHash: input.keyHash,
          requestFingerprint: input.requestFingerprint,
          status: 'IN_PROGRESS',
          claimId: null,
          responseReference: null,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        });
        if (!reserved) throw new BulkReservationRace();
        await tx.audits.append(input.requestedAudit as any);
      });
      return { outcome: 'STARTED' };
    } catch (error) {
      if (!(error instanceof BulkReservationRace)) throw error;
      const raced = await this.store.get(input.scope, input.keyHash);
      if (!raced) throw error;
      return classifyExisting(raced, input.requestFingerprint);
    }
  }

  async complete(input: {
    scope: 'executeBulkOperation';
    keyHash: string;
    response: BulkOperationResponse;
    completedAudit: import('@insurance/application/bulk-actions').BulkAuditRecord;
  }): Promise<void> {
    await this.store.run(async (tx) => {
      // The shared schema intentionally permits a null Claim relation for
      // non-Claim HTTP idempotency identities such as this bulk envelope.
      await tx.idempotency.complete(input.scope, input.keyHash, null as unknown as string, input.response);
      await tx.audits.append(input.completedAudit as any);
    });
  }
}
