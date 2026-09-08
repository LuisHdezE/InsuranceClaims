import type {
  PipelineAdminAuditRecord,
  PipelineAdminMutationResult,
  PipelineAdminRepository,
  PipelineAdminVersionRecord,
  PipelineStageContent,
} from '@insurance/application/pipeline-admin';
import type { PipelineDefinitionRecord } from '@insurance/application/claim-pipeline';

class PipelineAdminTransactionAbort extends Error {
  constructor(readonly outcome: Exclude<PipelineAdminMutationResult, { outcome: 'UPDATED' }>['outcome']) {
    super(outcome);
    this.name = 'PipelineAdminTransactionAbort';
  }
}

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

function definitionRow(row: any): PipelineDefinitionRecord {
  return {
    id: row.id,
    key: row.pipelineKey,
    consumerType: row.consumerType,
    displayName: row.displayName,
    enabled: Boolean(row.enabled),
    activeVersionId: row.activeVersionId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function stageRow(row: any): PipelineStageContent {
  const allowed = Array.isArray(row.allowedNextStageKeys) ? row.allowedNextStageKeys : [];
  const flags = row.reportingFlags && typeof row.reportingFlags === 'object' && !Array.isArray(row.reportingFlags)
    ? row.reportingFlags as Record<string, unknown>
    : {};
  return {
    stageKey: row.stageKey,
    displayName: row.displayName,
    sortOrder: Number(row.sortOrder),
    reportingFlags: Object.fromEntries(
      Object.entries(flags).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'),
    ),
    allowedNextStageKeys: allowed.filter((value: unknown): value is string => typeof value === 'string'),
  };
}

async function versionRow(db: any, row: any): Promise<PipelineAdminVersionRecord> {
  const stages = await db.orm.public.PipelineStage
    .where({ pipelineVersionId: row.id })
    .orderBy((stage: any) => stage.sortOrder.asc())
    .orderBy((stage: any) => stage.id.asc())
    .all();
  return {
    id: row.id,
    definitionId: row.pipelineDefinitionId,
    versionNumber: Number(row.versionNumber),
    status: row.status,
    createdByType: row.createdByType,
    createdById: row.createdById ?? null,
    sourceClassification: row.sourceClassification,
    createdAt: toAppDate(row.createdAt),
    activatedAt: row.activatedAt ? toAppDate(row.activatedAt) : null,
    retiredAt: row.retiredAt ? toAppDate(row.retiredAt) : null,
    stages: stages.map(stageRow),
  };
}

async function createStages(db: any, versionId: string, stages: readonly PipelineStageContent[], at: Date): Promise<void> {
  for (const stage of stages) {
    await db.orm.public.PipelineStage.create({
      pipelineVersionId: versionId,
      stageKey: stage.stageKey,
      displayName: stage.displayName,
      sortOrder: stage.sortOrder,
      reportingFlags: { ...stage.reportingFlags },
      allowedNextStageKeys: [...stage.allowedNextStageKeys],
      createdAt: toDbInstant(at),
    });
  }
}

async function appendAudit(db: any, audit: PipelineAdminAuditRecord): Promise<void> {
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

export class PrismaPipelineAdminStore implements PipelineAdminRepository {
  constructor(private readonly db: any) {}

  async listDefinitions(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.PipelineDefinition.all();
    const all = rows
      .map(definitionRow)
      .sort((a: PipelineDefinitionRecord, b: PipelineDefinitionRecord) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }

  async getDefinition(definitionId: string): Promise<PipelineDefinitionRecord | null> {
    const row = await this.db.orm.public.PipelineDefinition.first({ id: definitionId });
    return row ? definitionRow(row) : null;
  }

  async findDefinitionByKey(key: string): Promise<PipelineDefinitionRecord | null> {
    const row = await this.db.orm.public.PipelineDefinition.first({ pipelineKey: key });
    return row ? definitionRow(row) : null;
  }

  async listVersions(definitionId: string): Promise<PipelineAdminVersionRecord[]> {
    const rows = await this.db.orm.public.PipelineVersion
      .where({ pipelineDefinitionId: definitionId })
      .orderBy((version: any) => version.versionNumber.asc())
      .orderBy((version: any) => version.id.asc())
      .all();
    return Promise.all(rows.map((row: any) => versionRow(this.db, row)));
  }

  async getVersion(versionId: string): Promise<PipelineAdminVersionRecord | null> {
    const row = await this.db.orm.public.PipelineVersion.first({ id: versionId });
    return row ? versionRow(this.db, row) : null;
  }

  async createDefinition(input: {
    definition: PipelineDefinitionRecord;
    version: PipelineAdminVersionRecord;
    audit: PipelineAdminAuditRecord;
  }): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      await txDb.orm.public.PipelineDefinition.create({
        id: input.definition.id,
        pipelineKey: input.definition.key,
        consumerType: input.definition.consumerType,
        displayName: input.definition.displayName,
        enabled: false,
        activeVersionId: null,
        version: input.definition.version,
        createdAt: toDbInstant(input.definition.createdAt),
        updatedAt: toDbInstant(input.definition.updatedAt),
      });
      await txDb.orm.public.PipelineVersion.create({
        id: input.version.id,
        pipelineDefinitionId: input.version.definitionId,
        versionNumber: input.version.versionNumber,
        status: 'DRAFT',
        createdByType: input.version.createdByType,
        createdById: input.version.createdById,
        sourceClassification: input.version.sourceClassification,
        createdAt: toDbInstant(input.version.createdAt),
        activatedAt: null,
        retiredAt: null,
      });
      await createStages(txDb, input.version.id, input.version.stages, input.version.createdAt);
      await appendAudit(txDb, input.audit);
    });
  }

  async createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: PipelineAdminVersionRecord;
    audit: PipelineAdminAuditRecord;
  }): Promise<PipelineAdminMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const updatedCount = await txDb.orm.public.PipelineDefinition
        .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
        .updateAndCount({
          version: input.expectedDefinitionVersion + 1,
          updatedAt: toDbInstant(input.definitionUpdatedAt),
        });
      if (updatedCount !== 1) return { outcome: 'STALE' } as const;
      await txDb.orm.public.PipelineVersion.create({
        id: input.version.id,
        pipelineDefinitionId: input.version.definitionId,
        versionNumber: input.version.versionNumber,
        status: 'DRAFT',
        createdByType: input.version.createdByType,
        createdById: input.version.createdById,
        sourceClassification: input.version.sourceClassification,
        createdAt: toDbInstant(input.version.createdAt),
        activatedAt: null,
        retiredAt: null,
      });
      await createStages(txDb, input.version.id, input.version.stages, input.version.createdAt);
      await appendAudit(txDb, input.audit);
      const updated = await txDb.orm.public.PipelineDefinition.first({ id: input.definitionId });
      if (!updated) throw new Error('Updated pipeline definition disappeared inside the transaction.');
      return { outcome: 'UPDATED', definition: definitionRow(updated) } as const;
    });
  }

  async activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: PipelineAdminAuditRecord;
  }): Promise<PipelineAdminMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.PipelineDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) {
          throw new PipelineAdminTransactionAbort('STALE');
        }
        const target = await txDb.orm.public.PipelineVersion.first({ id: input.versionId });
        if (!target || target.pipelineDefinitionId !== input.definitionId) {
          throw new PipelineAdminTransactionAbort('ACTIVATION_CONFLICT');
        }
        if (target.status !== 'DRAFT') throw new PipelineAdminTransactionAbort('NOT_DRAFT');

        const previousActiveVersionId = raw.activeVersionId ?? null;
        const definitionUpdated = await txDb.orm.public.PipelineDefinition
          .where({ id: input.definitionId, version: input.expectedDefinitionVersion })
          .updateAndCount({
            activeVersionId: input.versionId,
            version: input.expectedDefinitionVersion + 1,
            updatedAt: toDbInstant(input.at),
          });
        if (definitionUpdated !== 1) throw new PipelineAdminTransactionAbort('STALE');

        if (previousActiveVersionId && previousActiveVersionId !== input.versionId) {
          await txDb.orm.public.PipelineVersion
            .where({ id: previousActiveVersionId, status: 'ACTIVE' })
            .updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
        }
        const activated = await txDb.orm.public.PipelineVersion
          .where({ id: input.versionId, status: 'DRAFT' })
          .updateAndCount({ status: 'ACTIVE', activatedAt: toDbInstant(input.at), retiredAt: null });
        if (activated !== 1) throw new PipelineAdminTransactionAbort('NOT_DRAFT');

        await appendAudit(txDb, input.audit);
        const updated = await txDb.orm.public.PipelineDefinition.first({ id: input.definitionId });
        if (!updated) throw new Error('Activated pipeline definition disappeared inside the transaction.');
        return { outcome: 'UPDATED', definition: definitionRow(updated) } as const;
      });
    } catch (error) {
      if (error instanceof PipelineAdminTransactionAbort) return { outcome: error.outcome } as PipelineAdminMutationResult;
      throw error;
    }
  }

  async updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: PipelineAdminAuditRecord | null;
  }): Promise<PipelineAdminMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.PipelineDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) {
          throw new PipelineAdminTransactionAbort('STALE');
        }
        const current = definitionRow(raw);

        if (input.enabled) {
          if (!current.activeVersionId) throw new PipelineAdminTransactionAbort('ACTIVATION_CONFLICT');
          const active = await txDb.orm.public.PipelineVersion.first({ id: current.activeVersionId });
          if (!active || active.status !== 'ACTIVE') throw new PipelineAdminTransactionAbort('ACTIVATION_CONFLICT');
          const enabledDefinitions = await txDb.orm.public.PipelineDefinition
            .where({ consumerType: current.consumerType, enabled: true })
            .all();
          if (enabledDefinitions.some((candidate: any) => candidate.id !== current.id && candidate.activeVersionId)) {
            throw new PipelineAdminTransactionAbort('ACTIVATION_CONFLICT');
          }
          if (current.enabled) return { outcome: 'UPDATED', definition: current } as const;
          const updatedCount = await txDb.orm.public.PipelineDefinition
            .where({ id: current.id, version: input.expectedDefinitionVersion })
            .updateAndCount({
              enabled: true,
              version: input.expectedDefinitionVersion + 1,
              updatedAt: toDbInstant(input.at),
            });
          if (updatedCount !== 1) throw new PipelineAdminTransactionAbort('STALE');
        } else {
          if (!current.enabled && !current.activeVersionId) return { outcome: 'UPDATED', definition: current } as const;
          const previousActiveVersionId = current.activeVersionId;
          const updatedCount = await txDb.orm.public.PipelineDefinition
            .where({ id: current.id, version: input.expectedDefinitionVersion })
            .updateAndCount({
              enabled: false,
              activeVersionId: null,
              version: input.expectedDefinitionVersion + 1,
              updatedAt: toDbInstant(input.at),
            });
          if (updatedCount !== 1) throw new PipelineAdminTransactionAbort('STALE');
          if (previousActiveVersionId) {
            await txDb.orm.public.PipelineVersion
              .where({ id: previousActiveVersionId, status: 'ACTIVE' })
              .updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
          }
          if (input.retirementAudit) await appendAudit(txDb, input.retirementAudit);
        }

        const updated = await txDb.orm.public.PipelineDefinition.first({ id: current.id });
        if (!updated) throw new Error('Pipeline definition disappeared inside the transaction.');
        return { outcome: 'UPDATED', definition: definitionRow(updated) } as const;
      });
    } catch (error) {
      if (error instanceof PipelineAdminTransactionAbort) return { outcome: error.outcome } as PipelineAdminMutationResult;
      throw error;
    }
  }
}
