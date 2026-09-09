import type {
  CustomFieldAdminRepository,
  CustomFieldAuditRecord,
  CustomFieldMutationResult,
} from '@insurance/application/custom-field-admin';
import type {
  CustomFieldDefinitionProps,
  CustomFieldValidationScalar,
  CustomFieldVersionProps,
} from '@insurance/domain/custom-field';

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

function definitionRow(row: any): CustomFieldDefinitionProps {
  return {
    id: row.id,
    fieldKey: row.fieldKey,
    targetType: row.targetType,
    enabled: Boolean(row.enabled),
    activeVersionId: row.activeVersionId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function scalarMap(value: unknown): Record<string, CustomFieldValidationScalar> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, CustomFieldValidationScalar> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) result[key] = item;
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function versionRow(row: any): CustomFieldVersionProps {
  return {
    id: row.id,
    definitionId: row.customFieldDefinitionId,
    versionNumber: Number(row.versionNumber),
    valueType: row.valueType,
    displayName: row.displayName,
    validationMetadata: scalarMap(row.validationMetadata),
    enumValues: stringArray(row.enumValues),
    sensitivityClassification: row.sensitivityClassification,
    status: row.status,
    sourceClassification: row.sourceClassification,
    createdByType: 'ADMINISTRATOR',
    createdById: row.createdById,
    createdAt: toAppDate(row.createdAt),
    activatedAt: row.activatedAt ? toAppDate(row.activatedAt) : null,
    retiredAt: row.retiredAt ? toAppDate(row.retiredAt) : null,
  };
}

async function appendAudit(db: any, audit: CustomFieldAuditRecord): Promise<void> {
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

class CustomFieldTransactionAbort extends Error {
  constructor(readonly outcome: Exclude<CustomFieldMutationResult, { outcome: 'UPDATED' }>['outcome']) {
    super(outcome);
    this.name = 'CustomFieldTransactionAbort';
  }
}

export class MemoryCustomFieldStore implements CustomFieldAdminRepository {
  private readonly definitions = new Map<string, CustomFieldDefinitionProps>();
  private readonly versions = new Map<string, CustomFieldVersionProps>();
  private readonly audits: CustomFieldAuditRecord[] = [];

  async listDefinitions(input: { page: number; pageSize: number }) {
    const all = [...this.definitions.values()].map(clone).sort((a, b) => a.fieldKey.localeCompare(b.fieldKey) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }

  async getDefinition(definitionId: string) {
    const value = this.definitions.get(definitionId);
    return value ? clone(value) : null;
  }

  async findDefinitionByKey(fieldKey: string) {
    const value = [...this.definitions.values()].find((item) => item.fieldKey === fieldKey);
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

  async createDefinition(input: { definition: CustomFieldDefinitionProps; version: CustomFieldVersionProps; audit: CustomFieldAuditRecord }): Promise<void> {
    this.definitions.set(input.definition.id, clone(input.definition));
    this.versions.set(input.version.id, clone(input.version));
    this.audits.push(clone(input.audit));
  }

  async createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: CustomFieldVersionProps;
    audit: CustomFieldAuditRecord;
  }): Promise<CustomFieldMutationResult> {
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
    audit: CustomFieldAuditRecord;
  }): Promise<CustomFieldMutationResult> {
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
    retirementAudit: CustomFieldAuditRecord | null;
  }): Promise<CustomFieldMutationResult> {
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

  getAuditEvents(): CustomFieldAuditRecord[] { return this.audits.map(clone); }
}

export class PrismaCustomFieldStore implements CustomFieldAdminRepository {
  constructor(private readonly db: any) {}

  async listDefinitions(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.CustomFieldDefinition.all();
    const all = rows.map(definitionRow).sort((a: CustomFieldDefinitionProps, b: CustomFieldDefinitionProps) => a.fieldKey.localeCompare(b.fieldKey) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }

  async getDefinition(definitionId: string) {
    const row = await this.db.orm.public.CustomFieldDefinition.first({ id: definitionId });
    return row ? definitionRow(row) : null;
  }

  async findDefinitionByKey(fieldKey: string) {
    const row = await this.db.orm.public.CustomFieldDefinition.first({ fieldKey });
    return row ? definitionRow(row) : null;
  }

  async listVersions(definitionId: string) {
    const rows = await this.db.orm.public.CustomFieldVersion
      .where({ customFieldDefinitionId: definitionId })
      .orderBy((item: any) => item.versionNumber.asc())
      .orderBy((item: any) => item.id.asc())
      .all();
    return rows.map((row: any) => versionRow(row));
  }

  async getVersion(versionId: string) {
    const row = await this.db.orm.public.CustomFieldVersion.first({ id: versionId });
    return row ? versionRow(row) : null;
  }

  async createDefinition(input: { definition: CustomFieldDefinitionProps; version: CustomFieldVersionProps; audit: CustomFieldAuditRecord }): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      await txDb.orm.public.CustomFieldDefinition.create({
        id: input.definition.id,
        fieldKey: input.definition.fieldKey,
        targetType: input.definition.targetType,
        enabled: false,
        activeVersionId: null,
        createdAt: toDbInstant(input.definition.createdAt),
        updatedAt: toDbInstant(input.definition.updatedAt),
        version: input.definition.version,
      });
      await txDb.orm.public.CustomFieldVersion.create({
        id: input.version.id,
        customFieldDefinitionId: input.version.definitionId,
        versionNumber: input.version.versionNumber,
        valueType: input.version.valueType,
        displayName: input.version.displayName,
        validationMetadata: { ...input.version.validationMetadata },
        enumValues: [...input.version.enumValues],
        sensitivityClassification: input.version.sensitivityClassification,
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
    version: CustomFieldVersionProps;
    audit: CustomFieldAuditRecord;
  }): Promise<CustomFieldMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const updated = await txDb.orm.public.CustomFieldDefinition
        .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
        .updateAndCount({ version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.definitionUpdatedAt) });
      if (updated !== 1) return { outcome: 'STALE' } as const;
      await txDb.orm.public.CustomFieldVersion.create({
        id: input.version.id,
        customFieldDefinitionId: input.version.definitionId,
        versionNumber: input.version.versionNumber,
        valueType: input.version.valueType,
        displayName: input.version.displayName,
        validationMetadata: { ...input.version.validationMetadata },
        enumValues: [...input.version.enumValues],
        sensitivityClassification: input.version.sensitivityClassification,
        status: 'DRAFT',
        sourceClassification: input.version.sourceClassification,
        createdByType: input.version.createdByType,
        createdById: input.version.createdById,
        createdAt: toDbInstant(input.version.createdAt),
        activatedAt: null,
        retiredAt: null,
      });
      await appendAudit(txDb, input.audit);
      const row = await txDb.orm.public.CustomFieldDefinition.first({ id: input.definitionId });
      if (!row) throw new Error('Custom field definition disappeared.');
      return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
    });
  }

  async activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: CustomFieldAuditRecord;
  }): Promise<CustomFieldMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.CustomFieldDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new CustomFieldTransactionAbort('STALE');
        const target = await txDb.orm.public.CustomFieldVersion.first({ id: input.versionId });
        if (!target || target.customFieldDefinitionId !== input.definitionId) throw new CustomFieldTransactionAbort('ACTIVATION_CONFLICT');
        if (target.status !== 'DRAFT') throw new CustomFieldTransactionAbort('NOT_DRAFT');
        const previous = raw.activeVersionId ?? null;
        const updated = await txDb.orm.public.CustomFieldDefinition
          .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
          .updateAndCount({ activeVersionId: input.versionId, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
        if (updated !== 1) throw new CustomFieldTransactionAbort('STALE');
        if (previous && previous !== input.versionId) {
          await txDb.orm.public.CustomFieldVersion
            .where({ id: previous, status: 'ACTIVE' })
            .updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
        }
        const activated = await txDb.orm.public.CustomFieldVersion
          .where({ id: input.versionId, status: 'DRAFT' })
          .updateAndCount({ status: 'ACTIVE', activatedAt: toDbInstant(input.at), retiredAt: null });
        if (activated !== 1) throw new CustomFieldTransactionAbort('NOT_DRAFT');
        await appendAudit(txDb, input.audit);
        const row = await txDb.orm.public.CustomFieldDefinition.first({ id: input.definitionId });
        if (!row) throw new Error('Custom field definition disappeared.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof CustomFieldTransactionAbort) return { outcome: error.outcome } as CustomFieldMutationResult;
      throw error;
    }
  }

  async updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: CustomFieldAuditRecord | null;
  }): Promise<CustomFieldMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.CustomFieldDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new CustomFieldTransactionAbort('STALE');
        if (input.enabled) {
          if (!raw.activeVersionId) throw new CustomFieldTransactionAbort('ACTIVATION_CONFLICT');
          const active = await txDb.orm.public.CustomFieldVersion.first({ id: raw.activeVersionId });
          if (!active || active.status !== 'ACTIVE') throw new CustomFieldTransactionAbort('ACTIVATION_CONFLICT');
          const updated = await txDb.orm.public.CustomFieldDefinition
            .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
            .updateAndCount({ enabled: true, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
          if (updated !== 1) throw new CustomFieldTransactionAbort('STALE');
        } else {
          const updated = await txDb.orm.public.CustomFieldDefinition
            .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
            .updateAndCount({ enabled: false, activeVersionId: null, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
          if (updated !== 1) throw new CustomFieldTransactionAbort('STALE');
          if (raw.activeVersionId) {
            await txDb.orm.public.CustomFieldVersion
              .where({ id: raw.activeVersionId, status: 'ACTIVE' })
              .updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
            if (input.retirementAudit) await appendAudit(txDb, input.retirementAudit);
          }
        }
        const row = await txDb.orm.public.CustomFieldDefinition.first({ id: input.definitionId });
        if (!row) throw new Error('Custom field definition disappeared.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof CustomFieldTransactionAbort) return { outcome: error.outcome } as CustomFieldMutationResult;
      throw error;
    }
  }
}
