import type {
  CollectionCaseAuditRecord,
  CollectionCaseRepository,
  CollectionMutationResult,
} from '@insurance/application/collections';
import type { CollectionCaseProps } from '@insurance/domain';

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

function collectionRow(row: any): CollectionCaseProps {
  return {
    id: row.id,
    customerId: row.customerId,
    policyId: row.policyId,
    status: row.status,
    paymentState: row.paymentState ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    cancelledAt: row.cancelledAt ? toAppDate(row.cancelledAt) : null,
  };
}

export class MemoryCollectionCaseStore implements CollectionCaseRepository {
  private readonly cases = new Map<string, CollectionCaseProps>();
  readonly audits: CollectionCaseAuditRecord[] = [];

  seed(item: CollectionCaseProps): void {
    this.cases.set(item.id, clone(item));
  }

  async list(input: { page: number; pageSize: number }) {
    const all = [...this.cases.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(offset, offset + input.pageSize)), totalItems: all.length };
  }

  async getById(collectionId: string): Promise<CollectionCaseProps | null> {
    const item = this.cases.get(collectionId);
    return item ? clone(item) : null;
  }

  async transition(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult> {
    return this.applyMutation(caseRecord, expectedVersion, audit);
  }

  async updatePaymentState(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult> {
    return this.applyMutation(caseRecord, expectedVersion, audit);
  }

  private async applyMutation(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult> {
    const current = this.cases.get(caseRecord.id);
    if (!current) return { outcome: 'NOT_FOUND' };
    if (current.version !== expectedVersion) return { outcome: 'STALE', actualVersion: current.version };
    this.cases.set(caseRecord.id, clone(caseRecord));
    this.audits.push(clone(audit));
    return { outcome: 'UPDATED' };
  }
}

async function appendAudit(db: any, audit: CollectionCaseAuditRecord): Promise<void> {
  await db.orm.public.AuditEvent.create({
    id: audit.id,
    eventCode: audit.eventCode,
    occurredAt: toDbInstant(audit.occurredAt),
    actorType: audit.actorType,
    actorId: audit.actorId,
    targetType: audit.targetType,
    targetId: audit.targetId,
    outcome: audit.outcome,
    requestId: audit.requestId,
    metadata: audit.metadata,
    createdAt: toDbInstant(audit.occurredAt),
  });
}

export class PrismaCollectionCaseStore implements CollectionCaseRepository {
  constructor(private readonly db: any) {}

  async list(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.CollectionCase.all();
    const ordered = rows
      .map(collectionRow)
      .sort((a: CollectionCaseProps, b: CollectionCaseProps) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: ordered.slice(offset, offset + input.pageSize), totalItems: ordered.length };
  }

  async getById(collectionId: string): Promise<CollectionCaseProps | null> {
    const row = await this.db.orm.public.CollectionCase.first({ id: collectionId });
    return row ? collectionRow(row) : null;
  }

  async transition(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult> {
    return this.applyMutation(caseRecord, expectedVersion, audit);
  }

  async updatePaymentState(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult> {
    return this.applyMutation(caseRecord, expectedVersion, audit);
  }

  private async applyMutation(caseRecord: CollectionCaseProps, expectedVersion: number, audit: CollectionCaseAuditRecord): Promise<CollectionMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const updatedCount = await txDb.orm.public.CollectionCase
        .where({ id: caseRecord.id, version: expectedVersion })
        .updateAndCount({
          status: caseRecord.status,
          paymentState: caseRecord.paymentState,
          version: caseRecord.version,
          updatedAt: toDbInstant(caseRecord.updatedAt),
          completedAt: caseRecord.completedAt ? toDbInstant(caseRecord.completedAt) : null,
          cancelledAt: caseRecord.cancelledAt ? toDbInstant(caseRecord.cancelledAt) : null,
        });
      if (updatedCount !== 1) {
        const current = await txDb.orm.public.CollectionCase.first({ id: caseRecord.id });
        if (!current) return { outcome: 'NOT_FOUND' } as CollectionMutationResult;
        return { outcome: 'STALE', actualVersion: Number(current.version) } as CollectionMutationResult;
      }
      await appendAudit(txDb, audit);
      return { outcome: 'UPDATED' } as CollectionMutationResult;
    });
  }
}
