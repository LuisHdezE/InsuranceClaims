import type {
  AuditEventRecord,
  AuditPort,
  ClaimDetailRecord,
  ClaimRepository,
  EvidenceRecord,
  HistoryRecord,
  IdempotencyPort,
  IdempotencyRecord,
  OperatorRecord,
  OperatorRepository,
  TransactionContext,
  TransactionPort,
} from '@insurance/application';
import { ClaimStateConflictError, type ClaimProps, type ClaimStatus } from '@insurance/domain';

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

function claimRow(row: any): ClaimProps {
  return {
    id: row.id, trackingCode: row.trackingCode, policyReference: row.policyReference, vehicleReference: row.vehicleReference,
    verifiedCustomerLabel: row.verifiedCustomerLabel ?? null, eventType: row.eventType, occurredAt: toAppDate(row.occurredAt),
    locationText: row.locationText, description: row.description, status: row.status as ClaimStatus,
    createdAt: toAppDate(row.createdAt), updatedAt: toAppDate(row.updatedAt),
  };
}
function evidenceRow(row: any): EvidenceRecord {
  return { evidenceId: row.id, claimId: row.claimId, storageKey: row.storageKey, mediaType: row.mediaType, sizeBytes: Number(row.sizeBytes), displayFilename: row.displayFilename ?? null, createdAt: toAppDate(row.createdAt) };
}
function historyRow(row: any): HistoryRecord {
  return { historyId: row.id, claimId: row.claimId, fromStatus: row.fromStatus ?? null, toStatus: row.toStatus, actorType: row.actorType, actorId: row.actorId ?? null, occurredAt: toAppDate(row.occurredAt) };
}
function auditRow(row: any): AuditEventRecord {
  return { id: row.id, eventCode: row.eventCode, occurredAt: toAppDate(row.occurredAt), actorType: row.actorType, actorId: row.actorId ?? null, targetType: row.targetType ?? null, targetId: row.targetId ?? null, outcome: row.outcome, requestId: row.requestId ?? null, metadata: row.metadata ?? null };
}

export class PrismaWorkflowStore implements ClaimRepository, AuditPort, IdempotencyPort, OperatorRepository, TransactionPort {
  constructor(private readonly db: any) {}

  async create(claim: ClaimProps, evidence: EvidenceRecord[], initialHistory: HistoryRecord): Promise<void> {
    await this.db.orm.public.Claim.create({
      id: claim.id, trackingCode: claim.trackingCode, policyReference: claim.policyReference, vehicleReference: claim.vehicleReference,
      verifiedCustomerLabel: claim.verifiedCustomerLabel, eventType: claim.eventType, occurredAt: toDbInstant(claim.occurredAt),
      locationText: claim.locationText, description: claim.description, status: claim.status,
      createdAt: toDbInstant(claim.createdAt), updatedAt: toDbInstant(claim.updatedAt),
    });
    if (evidence.length) await this.db.orm.public.ClaimEvidence.createAll(evidence.map((item) => ({
      id: item.evidenceId, claimId: item.claimId, storageKey: item.storageKey, mediaType: item.mediaType,
      sizeBytes: BigInt(item.sizeBytes), displayFilename: item.displayFilename, createdAt: toDbInstant(item.createdAt),
    })));
    await this.db.orm.public.ClaimStatusHistory.create({
      id: initialHistory.historyId, claimId: initialHistory.claimId, fromStatus: initialHistory.fromStatus,
      toStatus: initialHistory.toStatus, actorType: initialHistory.actorType, actorId: initialHistory.actorId,
      occurredAt: toDbInstant(initialHistory.occurredAt),
    });
  }

  async findByTrackingProof(trackingCode: string, policyReference: string): Promise<ClaimDetailRecord | null> {
    const row = await this.db.orm.public.Claim.first({ trackingCode, policyReference });
    return row ? this.detailFromRow(row) : null;
  }

  async list(input: { page: number; pageSize: number; status?: ClaimStatus }) {
    let query = this.db.orm.public.Claim.orderBy((c: any) => c.createdAt.desc());
    if (input.status) query = query.where({ status: input.status });
    const rows = await query.all();
    const start = (input.page - 1) * input.pageSize;
    return { items: rows.slice(start, start + input.pageSize).map(claimRow), totalItems: rows.length };
  }

  async getById(claimId: string): Promise<ClaimDetailRecord | null> {
    const row = await this.db.orm.public.Claim.first({ id: claimId });
    return row ? this.detailFromRow(row) : null;
  }

  private async detailFromRow(row: any): Promise<ClaimDetailRecord> {
    const evidence = await this.db.orm.public.ClaimEvidence.where({ claimId: row.id }).orderBy((e: any) => e.createdAt.asc()).all();
    const history = await this.db.orm.public.ClaimStatusHistory.where({ claimId: row.id }).orderBy((h: any) => h.occurredAt.asc()).all();
    return { claim: claimRow(row), evidence: evidence.map(evidenceRow), history: history.map(historyRow) };
  }

  async getEvidence(claimId: string, evidenceId: string): Promise<EvidenceRecord | null> {
    const row = await this.db.orm.public.ClaimEvidence.first({ id: evidenceId, claimId });
    return row ? evidenceRow(row) : null;
  }

  async applyTransition(claim: ClaimProps, history: HistoryRecord): Promise<void> {
    if (!history.fromStatus) throw new Error('Transition history requires a source status.');
    const updatedCount = await this.db.orm.public.Claim
      .where({ id: claim.id, status: history.fromStatus })
      .updateAndCount({ status: claim.status, updatedAt: toDbInstant(claim.updatedAt) });
    if (updatedCount !== 1) {
      const current = await this.db.orm.public.Claim.first({ id: claim.id });
      const actualStatus = (current?.status ?? history.fromStatus) as ClaimStatus;
      throw new ClaimStateConflictError(history.fromStatus, actualStatus);
    }
    await this.db.orm.public.ClaimStatusHistory.create({
      id: history.historyId, claimId: history.claimId, fromStatus: history.fromStatus, toStatus: history.toStatus,
      actorType: history.actorType, actorId: history.actorId, occurredAt: toDbInstant(history.occurredAt),
    });
  }

  async append(event: AuditEventRecord): Promise<void> {
    await this.db.orm.public.AuditEvent.create({
      id: event.id, eventCode: event.eventCode, occurredAt: toDbInstant(event.occurredAt), actorType: event.actorType,
      actorId: event.actorId, targetType: event.targetType, targetId: event.targetId, outcome: event.outcome,
      requestId: event.requestId, metadata: event.metadata, createdAt: toDbInstant(event.occurredAt),
    });
  }

  async listForTarget(targetType: string, targetId: string): Promise<AuditEventRecord[]> {
    const rows = await this.db.orm.public.AuditEvent.where({ targetType, targetId }).orderBy((a: any) => a.occurredAt.asc()).all();
    return rows.map(auditRow);
  }

  async get(scope: string, keyHash: string): Promise<IdempotencyRecord | null> {
    const row = await this.db.orm.public.IdempotencyRecord.first({ scope, idempotencyKeyHash: keyHash });
    return row ? {
      scope: row.scope,
      keyHash: row.idempotencyKeyHash,
      requestFingerprint: row.requestFingerprint,
      status: row.status,
      claimId: row.claimId ?? null,
      responseReference: row.responseReference ?? null,
      createdAt: toAppDate(row.createdAt),
      expiresAt: toAppDate(row.expiresAt),
    } : null;
  }

  async reserve(record: IdempotencyRecord): Promise<boolean> {
    try {
      await this.db.orm.public.IdempotencyRecord.create({
        scope: record.scope, idempotencyKeyHash: record.keyHash, requestFingerprint: record.requestFingerprint,
        status: record.status, claimId: record.claimId, responseReference: record.responseReference,
        createdAt: toDbInstant(record.createdAt), expiresAt: toDbInstant(record.expiresAt),
      });
      return true;
    } catch { return false; }
  }

  async complete(scope: string, keyHash: string, claimId: string, responseReference: unknown): Promise<void> {
    await this.db.orm.public.IdempotencyRecord.where({ scope, idempotencyKeyHash: keyHash }).update({ status: 'COMPLETED', claimId, responseReference });
  }
  async markRetryable(scope: string, keyHash: string): Promise<void> {
    await this.db.orm.public.IdempotencyRecord.where({ scope, idempotencyKeyHash: keyHash }).update({ status: 'FAILED_RETRYABLE' });
  }

  async findByLogin(normalizedLogin: string): Promise<OperatorRecord | null> {
    const row = await this.db.orm.public.Operator.first({ login: normalizedLogin });
    return row ? { id: row.id, login: row.login, passwordHash: row.passwordHash, role: row.role, isActive: row.isActive } : null;
  }

  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.db.transaction(async (txDb: any) => {
      const txStore = new PrismaWorkflowStore(txDb);
      return work({ claims: txStore, audits: txStore, idempotency: txStore });
    });
  }

  async seedOperator(operator: OperatorRecord, now: Date): Promise<void> {
    const current = await this.db.orm.public.Operator.first({ login: operator.login });
    if (current) return;
    await this.db.orm.public.Operator.create({
      id: operator.id,
      login: operator.login,
      passwordHash: operator.passwordHash,
      role: operator.role,
      isActive: operator.isActive,
      createdAt: toDbInstant(now),
      updatedAt: toDbInstant(now),
    });
  }
}
