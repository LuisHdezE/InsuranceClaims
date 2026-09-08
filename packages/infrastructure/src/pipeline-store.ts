import type {
  PipelineDefinitionRecord,
  PipelineMovementAuditRecord,
  PipelineWorkItemHistoryRecord,
  PipelineWorkItemRepository,
} from '@insurance/application/claim-pipeline';
import {
  PipelineWorkItemVersionConflictError,
  type PipelineConsumerType,
  type PipelineStageDefinition,
  type PipelineVersionDefinition,
  type PipelineWorkItemProps,
} from '@insurance/domain';

function clone<T>(value: T): T { return structuredClone(value); }

function configurationKey(consumerType: PipelineConsumerType): string {
  return consumerType;
}

function workItemKey(consumerType: PipelineConsumerType, consumerId: string): string {
  return `${consumerType}:${consumerId}`;
}

export class MemoryPipelineStore implements PipelineWorkItemRepository {
  private readonly activeDefinitions = new Map<string, PipelineDefinitionRecord>();
  private readonly versions = new Map<string, PipelineVersionDefinition>();
  private readonly workItems = new Map<string, PipelineWorkItemProps>();
  private readonly history: PipelineWorkItemHistoryRecord[] = [];

  constructor(private readonly auditWriter?: (audit: PipelineMovementAuditRecord) => Promise<void>) {}

  seedActivePipeline(input: { definition: PipelineDefinitionRecord; version: PipelineVersionDefinition }): void {
    if (!input.definition.enabled || input.definition.activeVersionId !== input.version.id || input.version.status !== 'ACTIVE') {
      throw new Error('Synthetic pipeline seed must contain one enabled definition pointing to an ACTIVE version.');
    }
    if (input.definition.id !== input.version.definitionId || input.definition.consumerType !== input.version.consumerType) {
      throw new Error('Synthetic pipeline seed definition/version mismatch.');
    }
    this.activeDefinitions.set(configurationKey(input.definition.consumerType), clone(input.definition));
    this.versions.set(input.version.id, clone(input.version));
  }

  seedPinnedVersion(version: PipelineVersionDefinition): void {
    this.versions.set(version.id, clone(version));
  }

  async findActiveVersionForConsumer(consumerType: PipelineConsumerType): Promise<PipelineVersionDefinition | null> {
    const definition = this.activeDefinitions.get(configurationKey(consumerType));
    if (!definition?.activeVersionId) return null;
    const version = this.versions.get(definition.activeVersionId);
    return version ? clone(version) : null;
  }

  async findVersion(versionId: string): Promise<PipelineVersionDefinition | null> {
    const version = this.versions.get(versionId);
    return version ? clone(version) : null;
  }

  async findWorkItemForConsumer(consumerType: PipelineConsumerType, consumerId: string): Promise<PipelineWorkItemProps | null> {
    const item = this.workItems.get(workItemKey(consumerType, consumerId));
    return item ? clone(item) : null;
  }

  async createWorkItemIfAbsent(workItem: PipelineWorkItemProps, history: PipelineWorkItemHistoryRecord): Promise<PipelineWorkItemProps> {
    const key = workItemKey(workItem.consumerType, workItem.consumerId);
    const existing = this.workItems.get(key);
    if (existing) return clone(existing);
    this.workItems.set(key, clone(workItem));
    this.history.push(clone(history));
    return clone(workItem);
  }

  async moveWorkItem(
    workItem: PipelineWorkItemProps,
    expectedVersion: number,
    history: PipelineWorkItemHistoryRecord,
    audit: PipelineMovementAuditRecord,
  ): Promise<void> {
    const key = workItemKey(workItem.consumerType, workItem.consumerId);
    const current = this.workItems.get(key);
    if (!current) return;
    if (current.version !== expectedVersion) {
      throw new PipelineWorkItemVersionConflictError(expectedVersion, current.version);
    }
    if (this.auditWriter) await this.auditWriter(clone(audit));
    this.workItems.set(key, clone(workItem));
    this.history.push(clone(history));
  }

  async listHistory(workItemId: string): Promise<PipelineWorkItemHistoryRecord[]> {
    return clone(this.history.filter((entry) => entry.workItemId === workItemId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()));
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

function stageRow(row: any): PipelineStageDefinition {
  const allowed = Array.isArray(row.allowedNextStageKeys) ? row.allowedNextStageKeys : [];
  return {
    id: row.id,
    key: row.stageKey,
    displayName: row.displayName,
    sortOrder: Number(row.sortOrder),
    allowedNextStageKeys: allowed.filter((value: unknown): value is string => typeof value === 'string'),
  };
}

async function versionRow(db: any, row: any): Promise<PipelineVersionDefinition> {
  const definition = await db.orm.public.PipelineDefinition.first({ id: row.pipelineDefinitionId });
  if (!definition) throw new Error('Pipeline version references a missing definition.');
  const stages = await db.orm.public.PipelineStage
    .where({ pipelineVersionId: row.id })
    .orderBy((stage: any) => stage.sortOrder.asc())
    .orderBy((stage: any) => stage.id.asc())
    .all();
  return {
    id: row.id,
    definitionId: row.pipelineDefinitionId,
    consumerType: definition.consumerType,
    versionNumber: Number(row.versionNumber),
    status: row.status,
    stages: stages.map(stageRow),
  };
}

function workItemRow(row: any): PipelineWorkItemProps {
  return {
    id: row.id,
    consumerType: row.consumerType,
    consumerId: row.consumerId,
    pipelineDefinitionId: row.pipelineDefinitionId,
    pipelineVersionId: row.pipelineVersionId,
    currentStageId: row.currentStageId,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function historyRow(row: any): PipelineWorkItemHistoryRecord {
  return {
    id: row.id,
    workItemId: row.workItemId,
    fromStageId: row.fromStageId ?? null,
    toStageId: row.toStageId,
    pipelineVersionId: row.pipelineVersionId,
    actorType: row.actorType,
    actorId: row.actorId ?? null,
    correlationId: row.correlationId ?? null,
    occurredAt: toAppDate(row.occurredAt),
  };
}

async function appendHistory(db: any, entry: PipelineWorkItemHistoryRecord): Promise<void> {
  await db.orm.public.PipelineWorkItemHistory.create({
    id: entry.id,
    workItemId: entry.workItemId,
    fromStageId: entry.fromStageId,
    toStageId: entry.toStageId,
    pipelineVersionId: entry.pipelineVersionId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    correlationId: entry.correlationId,
    occurredAt: toDbInstant(entry.occurredAt),
  });
}

async function appendAudit(db: any, audit: PipelineMovementAuditRecord): Promise<void> {
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

export class PrismaPipelineStore implements PipelineWorkItemRepository {
  constructor(private readonly db: any) {}

  async findActiveVersionForConsumer(consumerType: PipelineConsumerType): Promise<PipelineVersionDefinition | null> {
    const definitions = await this.db.orm.public.PipelineDefinition.where({ consumerType, enabled: true }).all();
    const eligible = definitions.filter((definition: any) => definition.activeVersionId);
    if (eligible.length === 0) return null;
    if (eligible.length > 1) throw new Error(`Multiple enabled active pipelines exist for consumer ${consumerType}.`);
    const version = await this.db.orm.public.PipelineVersion.first({ id: eligible[0]!.activeVersionId });
    return version ? versionRow(this.db, version) : null;
  }

  async findVersion(versionId: string): Promise<PipelineVersionDefinition | null> {
    const row = await this.db.orm.public.PipelineVersion.first({ id: versionId });
    return row ? versionRow(this.db, row) : null;
  }

  async findWorkItemForConsumer(consumerType: PipelineConsumerType, consumerId: string): Promise<PipelineWorkItemProps | null> {
    const rows = await this.db.orm.public.PipelineWorkItem.where({ consumerType, consumerId }).all();
    if (rows.length === 0) return null;
    if (rows.length > 1) throw new Error(`Multiple operational work items exist for ${consumerType}:${consumerId}.`);
    return workItemRow(rows[0]);
  }

  async createWorkItemIfAbsent(workItem: PipelineWorkItemProps, history: PipelineWorkItemHistoryRecord): Promise<PipelineWorkItemProps> {
    const existing = await this.findWorkItemForConsumer(workItem.consumerType, workItem.consumerId);
    if (existing) return existing;
    try {
      return await this.db.transaction(async (txDb: any) => {
        const row = await txDb.orm.public.PipelineWorkItem.create({
          id: workItem.id,
          consumerType: workItem.consumerType,
          consumerId: workItem.consumerId,
          pipelineDefinitionId: workItem.pipelineDefinitionId,
          pipelineVersionId: workItem.pipelineVersionId,
          currentStageId: workItem.currentStageId,
          version: workItem.version,
          createdAt: toDbInstant(workItem.createdAt),
          updatedAt: toDbInstant(workItem.updatedAt),
        });
        await appendHistory(txDb, history);
        return workItemRow(row);
      });
    } catch (error) {
      const raced = await this.findWorkItemForConsumer(workItem.consumerType, workItem.consumerId);
      if (raced) return raced;
      throw error;
    }
  }

  async moveWorkItem(
    workItem: PipelineWorkItemProps,
    expectedVersion: number,
    history: PipelineWorkItemHistoryRecord,
    audit: PipelineMovementAuditRecord,
  ): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      const updatedCount = await txDb.orm.public.PipelineWorkItem
        .where({ id: workItem.id, version: expectedVersion })
        .updateAndCount({
          currentStageId: workItem.currentStageId,
          version: workItem.version,
          updatedAt: toDbInstant(workItem.updatedAt),
        });
      if (updatedCount !== 1) {
        const current = await txDb.orm.public.PipelineWorkItem.first({ id: workItem.id });
        throw new PipelineWorkItemVersionConflictError(expectedVersion, Number(current?.version ?? expectedVersion));
      }
      await appendHistory(txDb, history);
      await appendAudit(txDb, audit);
    });
  }

  async listHistory(workItemId: string): Promise<PipelineWorkItemHistoryRecord[]> {
    const rows = await this.db.orm.public.PipelineWorkItemHistory
      .where({ workItemId })
      .orderBy((entry: any) => entry.occurredAt.asc())
      .orderBy((entry: any) => entry.id.asc())
      .all();
    return rows.map(historyRow);
  }
}
