import type {
  GuidanceAdminRepository,
  GuidanceAuditRecord,
  GuidanceMutationResult,
} from '@insurance/application/guidance-admin';
import type {
  InsurerGuidanceDefinitionProps,
  InsurerGuidanceVersionProps,
} from '@insurance/domain/guidance';

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

function definitionRow(row: any): InsurerGuidanceDefinitionProps {
  return {
    id: row.id,
    key: row.guidanceKey,
    enabled: Boolean(row.enabled),
    activeVersionId: row.activeVersionId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
}

function versionRow(row: any): InsurerGuidanceVersionProps {
  return {
    id: row.id,
    definitionId: row.guidanceDefinitionId,
    versionNumber: Number(row.versionNumber),
    insurerContextReference: row.insurerContextReference,
    guidanceCategory: row.guidanceCategory,
    documentCategories: stringArray(row.documentCategories),
    instructions: stringArray(row.instructions),
    assistanceMetadata: stringMap(row.assistanceMetadata),
    status: row.status,
    sourceClassification: row.sourceClassification,
    createdByType: row.createdByType,
    createdById: row.createdById ?? null,
    createdAt: toAppDate(row.createdAt),
    activatedAt: row.activatedAt ? toAppDate(row.activatedAt) : null,
    retiredAt: row.retiredAt ? toAppDate(row.retiredAt) : null,
  };
}

async function appendAudit(db: any, audit: GuidanceAuditRecord): Promise<void> {
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

class GuidanceTransactionAbort extends Error {
  constructor(readonly outcome: Exclude<GuidanceMutationResult, { outcome: 'UPDATED' }>['outcome']) {
    super(outcome);
    this.name = 'GuidanceTransactionAbort';
  }
}

export class MemoryGuidanceStore implements GuidanceAdminRepository {
  private readonly definitions = new Map<string, InsurerGuidanceDefinitionProps>();
  private readonly versions = new Map<string, InsurerGuidanceVersionProps>();
  private readonly audits: GuidanceAuditRecord[] = [];

  async listDefinitions(input: { page: number; pageSize: number }) {
    const all = [...this.definitions.values()].map(clone).sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }

  async getDefinition(definitionId: string) {
    const value = this.definitions.get(definitionId);
    return value ? clone(value) : null;
  }

  async findDefinitionByKey(key: string) {
    const value = [...this.definitions.values()].find((item) => item.key === key);
    return value ? clone(value) : null;
  }

  async listVersions(definitionId: string) {
    return [...this.versions.values()]
      .filter((item) => item.definitionId === definitionId)
      .map(clone)
      .sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id));
  }

  async getVersion(versionId: string) {
    const value = this.versions.get(versionId);
    return value ? clone(value) : null;
  }

  async createDefinition(input: {
    definition: InsurerGuidanceDefinitionProps;
    version: InsurerGuidanceVersionProps;
    audit: GuidanceAuditRecord;
  }): Promise<void> {
    this.definitions.set(input.definition.id, clone(input.definition));
    this.versions.set(input.version.id, clone(input.version));
    this.audits.push(clone(input.audit));
  }

  async createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: InsurerGuidanceVersionProps;
    audit: GuidanceAuditRecord;
  }): Promise<GuidanceMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    definition.version += 1;
    definition.updatedAt = input.definitionUpdatedAt;
    this.definitions.set(definition.id, clone(definition));
    this.versions.set(input.version.id, clone(input.version));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: GuidanceAuditRecord;
  }): Promise<GuidanceMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    const target = this.versions.get(input.versionId);
    if (!target || target.definitionId !== definition.id) return { outcome: 'ACTIVATION_CONFLICT' };
    if (target.status !== 'DRAFT') return { outcome: 'NOT_DRAFT' };
    if (definition.activeVersionId) {
      const previous = this.versions.get(definition.activeVersionId);
      if (previous?.status === 'ACTIVE') {
        previous.status = 'RETIRED';
        previous.retiredAt = input.at;
        this.versions.set(previous.id, clone(previous));
      }
    }
    target.status = 'ACTIVE';
    target.activatedAt = input.at;
    target.retiredAt = null;
    this.versions.set(target.id, clone(target));
    definition.activeVersionId = target.id;
    definition.version += 1;
    definition.updatedAt = input.at;
    this.definitions.set(definition.id, clone(definition));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: GuidanceAuditRecord | null;
  }): Promise<GuidanceMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    if (input.enabled) {
      if (!definition.activeVersionId) return { outcome: 'ACTIVATION_CONFLICT' };
      const active = this.versions.get(definition.activeVersionId);
      if (!active || active.status !== 'ACTIVE') return { outcome: 'ACTIVATION_CONFLICT' };
      definition.enabled = true;
    } else {
      definition.enabled = false;
      if (definition.activeVersionId) {
        const active = this.versions.get(definition.activeVersionId);
        if (active?.status === 'ACTIVE') {
          active.status = 'RETIRED';
          active.retiredAt = input.at;
          this.versions.set(active.id, clone(active));
        }
        definition.activeVersionId = null;
        if (input.retirementAudit) this.audits.push(clone(input.retirementAudit));
      }
    }
    definition.version += 1;
    definition.updatedAt = input.at;
    this.definitions.set(definition.id, clone(definition));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  getAuditEvents(): GuidanceAuditRecord[] {
    return this.audits.map(clone);
  }
}

export class PrismaGuidanceStore implements GuidanceAdminRepository {
  constructor(private readonly db: any) {}

  async listDefinitions(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.InsurerGuidanceDefinition.all();
    const all = rows.map(definitionRow).sort((a: InsurerGuidanceDefinitionProps, b: InsurerGuidanceDefinitionProps) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }

  async getDefinition(definitionId: string) {
    const row = await this.db.orm.public.InsurerGuidanceDefinition.first({ id: definitionId });
    return row ? definitionRow(row) : null;
  }

  async findDefinitionByKey(key: string) {
    const row = await this.db.orm.public.InsurerGuidanceDefinition.first({ guidanceKey: key });
    return row ? definitionRow(row) : null;
  }

  async listVersions(definitionId: string) {
    const rows = await this.db.orm.public.InsurerGuidanceVersion
      .where({ guidanceDefinitionId: definitionId })
      .orderBy((item: any) => item.versionNumber.asc())
      .orderBy((item: any) => item.id.asc())
      .all();
    return rows.map((row: any) => versionRow(row));
  }

  async getVersion(versionId: string) {
    const row = await this.db.orm.public.InsurerGuidanceVersion.first({ id: versionId });
    return row ? versionRow(row) : null;
  }

  async createDefinition(input: {
    definition: InsurerGuidanceDefinitionProps;
    version: InsurerGuidanceVersionProps;
    audit: GuidanceAuditRecord;
  }): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      await txDb.orm.public.InsurerGuidanceDefinition.create({
        id: input.definition.id,
        guidanceKey: input.definition.key,
        enabled: false,
        activeVersionId: null,
        createdAt: toDbInstant(input.definition.createdAt),
        updatedAt: toDbInstant(input.definition.updatedAt),
        version: input.definition.version,
      });
      await txDb.orm.public.InsurerGuidanceVersion.create({
        id: input.version.id,
        guidanceDefinitionId: input.version.definitionId,
        versionNumber: input.version.versionNumber,
        insurerContextReference: input.version.insurerContextReference,
        guidanceCategory: input.version.guidanceCategory,
        documentCategories: [...input.version.documentCategories],
        instructions: [...input.version.instructions],
        assistanceMetadata: { ...input.version.assistanceMetadata },
        status: 'DRAFT',
        sourceClassification: input.version.sourceClassification,
        createdByType: input.version.createdByType,
        createdById: input.version.createdById,
        createdAt: toDbInstant(input.version.createdAt),
        activatedAt: null,
        retiredAt: null,
      });
      await appendAudit(txDb, input.audit);
    });
  }

  async createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: InsurerGuidanceVersionProps;
    audit: GuidanceAuditRecord;
  }): Promise<GuidanceMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const updated = await txDb.orm.public.InsurerGuidanceDefinition
        .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
        .updateAndCount({ version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.definitionUpdatedAt) });
      if (updated !== 1) return { outcome: 'STALE' } as const;
      await txDb.orm.public.InsurerGuidanceVersion.create({
        id: input.version.id,
        guidanceDefinitionId: input.version.definitionId,
        versionNumber: input.version.versionNumber,
        insurerContextReference: input.version.insurerContextReference,
        guidanceCategory: input.version.guidanceCategory,
        documentCategories: [...input.version.documentCategories],
        instructions: [...input.version.instructions],
        assistanceMetadata: { ...input.version.assistanceMetadata },
        status: 'DRAFT',
        sourceClassification: input.version.sourceClassification,
        createdByType: input.version.createdByType,
        createdById: input.version.createdById,
        createdAt: toDbInstant(input.version.createdAt),
        activatedAt: null,
        retiredAt: null,
      });
      await appendAudit(txDb, input.audit);
      const row = await txDb.orm.public.InsurerGuidanceDefinition.first({ id: input.definitionId });
      if (!row) throw new Error('Insurer guidance definition disappeared.');
      return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
    });
  }

  async activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: GuidanceAuditRecord;
  }): Promise<GuidanceMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.InsurerGuidanceDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new GuidanceTransactionAbort('STALE');
        const target = await txDb.orm.public.InsurerGuidanceVersion.first({ id: input.versionId });
        if (!target || target.guidanceDefinitionId !== input.definitionId) throw new GuidanceTransactionAbort('ACTIVATION_CONFLICT');
        if (target.status !== 'DRAFT') throw new GuidanceTransactionAbort('NOT_DRAFT');
        const previous = raw.activeVersionId ?? null;
        const updated = await txDb.orm.public.InsurerGuidanceDefinition
          .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
          .updateAndCount({ activeVersionId: input.versionId, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
        if (updated !== 1) throw new GuidanceTransactionAbort('STALE');
        if (previous && previous !== input.versionId) {
          await txDb.orm.public.InsurerGuidanceVersion
            .where({ id: previous, status: 'ACTIVE' })
            .updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
        }
        const activated = await txDb.orm.public.InsurerGuidanceVersion
          .where({ id: input.versionId, status: 'DRAFT' })
          .updateAndCount({ status: 'ACTIVE', activatedAt: toDbInstant(input.at), retiredAt: null });
        if (activated !== 1) throw new GuidanceTransactionAbort('NOT_DRAFT');
        await appendAudit(txDb, input.audit);
        const row = await txDb.orm.public.InsurerGuidanceDefinition.first({ id: input.definitionId });
        if (!row) throw new Error('Insurer guidance definition disappeared.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof GuidanceTransactionAbort) return { outcome: error.outcome } as GuidanceMutationResult;
      throw error;
    }
  }

  async updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: GuidanceAuditRecord | null;
  }): Promise<GuidanceMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.InsurerGuidanceDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new GuidanceTransactionAbort('STALE');
        const current = definitionRow(raw);
        if (input.enabled) {
          if (!current.activeVersionId) throw new GuidanceTransactionAbort('ACTIVATION_CONFLICT');
          const active = await txDb.orm.public.InsurerGuidanceVersion.first({ id: current.activeVersionId });
          if (!active || active.status !== 'ACTIVE') throw new GuidanceTransactionAbort('ACTIVATION_CONFLICT');
          if (!current.enabled) {
            const updated = await txDb.orm.public.InsurerGuidanceDefinition
              .where({ id: current.id, version: input.expectedDefinitionVersion })
              .updateAndCount({ enabled: true, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
            if (updated !== 1) throw new GuidanceTransactionAbort('STALE');
          }
        } else {
          const previous = current.activeVersionId;
          const updated = await txDb.orm.public.InsurerGuidanceDefinition
            .where({ id: current.id, version: input.expectedDefinitionVersion })
            .updateAndCount({ enabled: false, activeVersionId: null, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
          if (updated !== 1) throw new GuidanceTransactionAbort('STALE');
          if (previous) {
            await txDb.orm.public.InsurerGuidanceVersion
              .where({ id: previous, status: 'ACTIVE' })
              .updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
          }
          if (input.retirementAudit) await appendAudit(txDb, input.retirementAudit);
        }
        const row = await txDb.orm.public.InsurerGuidanceDefinition.first({ id: current.id });
        if (!row) throw new Error('Insurer guidance definition disappeared.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof GuidanceTransactionAbort) return { outcome: error.outcome } as GuidanceMutationResult;
      throw error;
    }
  }
}
