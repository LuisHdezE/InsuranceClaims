import type {
  RenewalCaseAuditRecord,
  RenewalCaseRepository,
  RenewalMutationResult,
} from '@insurance/application/renewals';
import type { RenewalCaseProps } from '@insurance/domain';

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

function renewalRow(row: any): RenewalCaseProps {
  return {
    id: row.id,
    customerId: row.customerId,
    policyId: row.policyId,
    status: row.status,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    cancelledAt: row.cancelledAt ? toAppDate(row.cancelledAt) : null,
  };
}

export class MemoryRenewalCaseStore implements RenewalCaseRepository {
  private readonly cases = new Map<string, RenewalCaseProps>();
  readonly audits: RenewalCaseAuditRecord[] = [];

  seed(item: RenewalCaseProps): void {
    this.cases.set(item.id, clone(item));
  }

  async list(input: { page: number; pageSize: number }) {
    const all = [...this.cases.values()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(offset, offset + input.pageSize)), totalItems: all.length };
  }

  async getById(renewalId: string): Promise<RenewalCaseProps | null> {
    const item = this.cases.get(renewalId);
    return item ? clone(item) : null;
  }

  async transition(caseRecord: RenewalCaseProps, expectedVersion: number, audit: RenewalCaseAuditRecord): Promise<RenewalMutationResult> {
    const current = this.cases.get(caseRecord.id);
    if (!current) return { outcome: 'NOT_FOUND' };
    if (current.version !== expectedVersion) return { outcome: 'STALE', actualVersion: current.version };
    this.cases.set(caseRecord.id, clone(caseRecord));
    this.audits.push(clone(audit));
    return { outcome: 'UPDATED' };
  }
}

async function appendAudit(db: any, audit: RenewalCaseAuditRecord): Promise<void> {
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

export class PrismaRenewalCaseStore implements RenewalCaseRepository {
  constructor(private readonly db: any) {}

  async list(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.RenewalCase.all();
    const ordered = rows
      .map(renewalRow)
      .sort((a: RenewalCaseProps, b: RenewalCaseProps) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: ordered.slice(offset, offset + input.pageSize), totalItems: ordered.length };
  }

  async getById(renewalId: string): Promise<RenewalCaseProps | null> {
    const row = await this.db.orm.public.RenewalCase.first({ id: renewalId });
    return row ? renewalRow(row) : null;
  }

  async transition(caseRecord: RenewalCaseProps, expectedVersion: number, audit: RenewalCaseAuditRecord): Promise<RenewalMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const updatedCount = await txDb.orm.public.RenewalCase
        .where({ id: caseRecord.id, version: expectedVersion })
        .updateAndCount({
          status: caseRecord.status,
          version: caseRecord.version,
          updatedAt: toDbInstant(caseRecord.updatedAt),
          completedAt: caseRecord.completedAt ? toDbInstant(caseRecord.completedAt) : null,
          cancelledAt: caseRecord.cancelledAt ? toDbInstant(caseRecord.cancelledAt) : null,
        });
      if (updatedCount !== 1) {
        const current = await txDb.orm.public.RenewalCase.first({ id: caseRecord.id });
        if (!current) return { outcome: 'NOT_FOUND' } as RenewalMutationResult;
        return { outcome: 'STALE', actualVersion: Number(current.version) } as RenewalMutationResult;
      }
      await appendAudit(txDb, audit);
      return { outcome: 'UPDATED' } as RenewalMutationResult;
    });
  }
}
