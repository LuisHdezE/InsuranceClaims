import { randomUUID } from 'node:crypto';
import type {
  PipelineDefinitionRecord,
  PipelineMovementAuditRecord,
  PipelineWorkItemHistoryRecord,
  PipelineWorkItemRepository,
} from '@insurance/application/claim-pipeline';
import type {
  PipelineAdminAuditRecord,
  PipelineAdminMutationResult,
  PipelineAdminRepository,
  PipelineAdminVersionRecord,
} from '@insurance/application/pipeline-admin';
import {
  PipelineWorkItemVersionConflictError,
  type PipelineConsumerType,
  type PipelineStageDefinition,
  type PipelineVersionDefinition,
  type PipelineWorkItemProps,
} from '@insurance/domain';

function clone<T>(value: T): T { return structuredClone(value); }

function workItemKey(consumerType: PipelineConsumerType, consumerId: string): string {
  return `${consumerType}:${consumerId}`;
}

function toRuntimeVersion(
  record: PipelineAdminVersionRecord,
  consumerType: PipelineConsumerType,
  existing?: PipelineVersionDefinition,
): PipelineVersionDefinition {
  const existingIds = new Map(existing?.stages.map((stage) => [stage.key, stage.id]) ?? []);
  return {
    id: record.id,
    definitionId: record.definitionId,
    consumerType,
    versionNumber: record.versionNumber,
    status: record.status,
    stages: record.stages.map((stage) => ({
      id: existingIds.get(stage.stageKey) ?? randomUUID(),
      key: stage.stageKey,
      displayName: stage.displayName,
      sortOrder: stage.sortOrder,
      allowedNextStageKeys: [...stage.allowedNextStageKeys],
    })),
  };
}

function seededAdminVersion(version: PipelineVersionDefinition, createdAt: Date): PipelineAdminVersionRecord {
  return {
    id: version.id,
    definitionId: version.definitionId,
    versionNumber: version.versionNumber,
    status: version.status,
    createdByType: 'SYSTEM',
    createdById: null,
    sourceClassification: 'SYNTHETIC_TEST_SEED',
    createdAt,
    activatedAt: version.status === 'ACTIVE' ? createdAt : null,
    retiredAt: version.status === 'RETIRED' ? createdAt : null,
    stages: version.stages.map((stage) => ({
      stageKey: stage.key,
      displayName: stage.displayName,
      sortOrder: stage.sortOrder,
      reportingFlags: {},
      allowedNextStageKeys: [...stage.allowedNextStageKeys],
    })),
  };
}

export class MemoryPipelineStore implements PipelineWorkItemRepository, PipelineAdminRepository {
  private readonly definitions = new Map<string, PipelineDefinitionRecord>();
  private readonly adminVersions = new Map<string, PipelineAdminVersionRecord>();
  private readonly runtimeVersions = new Map<string, PipelineVersionDefinition>();
  private readonly workItems = new Map<string, PipelineWorkItemProps>();
  private readonly history: PipelineWorkItemHistoryRecord[] = [];

  constructor(private readonly auditWriter?: (audit: PipelineMovementAuditRecord | PipelineAdminAuditRecord) => Promise<void>) {}

  seedActivePipeline(input: { definition: PipelineDefinitionRecord; version: PipelineVersionDefinition }): void {
    if (!input.definition.enabled || input.definition.activeVersionId !== input.version.id || input.version.status !== 'ACTIVE') {
      throw new Error('Synthetic pipeline seed must contain one enabled definition pointing to an ACTIVE version.');
    }
    if (input.definition.id !== input.version.definitionId || input.definition.consumerType !== input.version.consumerType) {
      throw new Error('Synthetic pipeline seed definition/version mismatch.');
    }
    this.definitions.set(input.definition.id, clone(input.definition));
    this.runtimeVersions.set(input.version.id, clone(input.version));
    this.adminVersions.set(input.version.id, seededAdminVersion(input.version, input.definition.createdAt));
  }

  seedPinnedVersion(version: PipelineVersionDefinition): void {
    this.runtimeVersions.set(version.id, clone(version));
    const definition = this.definitions.get(version.definitionId);
    if (definition && !this.adminVersions.has(version.id)) {
      this.adminVersions.set(version.id, seededAdminVersion(version, definition.createdAt));
    }
  }

  async findActiveVersionForConsumer(consumerType: PipelineConsumerType): Promise<PipelineVersionDefinition | null> {
    const eligible = [...this.definitions.values()].filter((definition) =>
      definition.consumerType === consumerType && definition.enabled && definition.activeVersionId,
    );
    if (eligible.length === 0) return null;
    if (eligible.length > 1) throw new Error(`Multiple enabled active pipelines exist for consumer ${consumerType}.`);
    const version = this.runtimeVersions.get(eligible[0]!.activeVersionId!);
    return version ? clone(version) : null;
  }

  async findVersion(versionId: string): Promise<PipelineVersionDefinition | null> {
    const version = this.runtimeVersions.get(versionId);
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

  async listDefinitions(input: { page: number; pageSize: number }) {
    const all = [...this.definitions.values()].sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(offset, offset + input.pageSize)), totalItems: all.length };
  }

  async getDefinition(definitionId: string): Promise<PipelineDefinitionRecord | null> {
    const definition = this.definitions.get(definitionId);
    return definition ? clone(definition) : null;
  }

  async findDefinitionByKey(key: string): Promise<PipelineDefinitionRecord | null> {
    const definition = [...this.definitions.values()].find((item) => item.key === key);
    return definition ? clone(definition) : null;
  }

  async listVersions(definitionId: string): Promise<PipelineAdminVersionRecord[]> {
    return clone([...this.adminVersions.values()]
      .filter((version) => version.definitionId === definitionId)
      .sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id)));
  }

  async getVersion(versionId: string): Promise<PipelineAdminVersionRecord | null> {
    const version = this.adminVersions.get(versionId);
    return version ? clone(version) : null;
  }

  async createDefinition(input: {
    definition: PipelineDefinitionRecord;
    version: PipelineAdminVersionRecord;
    audit: PipelineAdminAuditRecord;
  }): Promise<void> {
    if ([...this.definitions.values()].some((definition) => definition.key === input.definition.key)) {
      throw new Error('Pipeline definition key already exists.');
    }
    this.definitions.set(input.definition.id, clone(input.definition));
    this.adminVersions.set(input.version.id, clone(input.version));
    this.runtimeVersions.set(input.version.id, toRuntimeVersion(input.version, input.definition.consumerType));
    if (this.auditWriter) await this.auditWriter(clone(input.audit));
  }

  async createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: PipelineAdminVersionRecord;
    audit: PipelineAdminAuditRecord;
  }): Promise<PipelineAdminMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    const updated = { ...definition, version: definition.version + 1, updatedAt: input.definitionUpdatedAt };
    this.definitions.set(updated.id, clone(updated));
    this.adminVersions.set(input.version.id, clone(input.version));
    this.runtimeVersions.set(input.version.id, toRuntimeVersion(input.version, definition.consumerType));
    if (this.auditWriter) await this.auditWriter(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(updated) };
  }

  async activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: PipelineAdminAuditRecord;
  }): Promise<PipelineAdminMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    const target = this.adminVersions.get(input.versionId);
    if (!target || target.definitionId !== definition.id) return { outcome: 'ACTIVATION_CONFLICT' };
    if (target.status !== 'DRAFT') return { outcome: 'NOT_DRAFT' };

    if (definition.activeVersionId && definition.activeVersionId !== target.id) {
      const previous = this.adminVersions.get(definition.activeVersionId);
      if (previous?.status === 'ACTIVE') {
        const retired = { ...previous, status: 'RETIRED' as const, retiredAt: input.at };
        this.adminVersions.set(retired.id, clone(retired));
        const runtime = this.runtimeVersions.get(retired.id);
        if (runtime) this.runtimeVersions.set(retired.id, { ...clone(runtime), status: 'RETIRED' });
      }
    }

    const active = { ...target, status: 'ACTIVE' as const, activatedAt: input.at, retiredAt: null };
    this.adminVersions.set(active.id, clone(active));
    const targetRuntime = this.runtimeVersions.get(active.id);
    if (targetRuntime) this.runtimeVersions.set(active.id, { ...clone(targetRuntime), status: 'ACTIVE' });
    const updated = {
      ...definition,
      activeVersionId: active.id,
      version: definition.version + 1,
      updatedAt: input.at,
    };
    this.definitions.set(updated.id, clone(updated));
    if (this.auditWriter) await this.auditWriter(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(updated) };
  }

  async updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: PipelineAdminAuditRecord | null;
  }): Promise<PipelineAdminMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };

    if (input.enabled) {
      if (!definition.activeVersionId) return { outcome: 'ACTIVATION_CONFLICT' };
      const active = this.adminVersions.get(definition.activeVersionId);
      if (!active || active.status !== 'ACTIVE') return { outcome: 'ACTIVATION_CONFLICT' };
      const conflicting = [...this.definitions.values()].some((item) =>
        item.id !== definition.id
        && item.consumerType === definition.consumerType
        && item.enabled
        && item.activeVersionId,
      );
      if (conflicting) return { outcome: 'ACTIVATION_CONFLICT' };
      if (definition.enabled) return { outcome: 'UPDATED', definition: clone(definition) };
      const updated = { ...definition, enabled: true, version: definition.version + 1, updatedAt: input.at };
      this.definitions.set(updated.id, clone(updated));
      return { outcome: 'UPDATED', definition: clone(updated) };
    }

    if (!definition.enabled && !definition.activeVersionId) {
      return { outcome: 'UPDATED', definition: clone(definition) };
    }
    if (definition.activeVersionId) {
      const active = this.adminVersions.get(definition.activeVersionId);
      if (active?.status === 'ACTIVE') {
        const retired = { ...active, status: 'RETIRED' as const, retiredAt: input.at };
        this.adminVersions.set(retired.id, clone(retired));
        const runtime = this.runtimeVersions.get(retired.id);
        if (runtime) this.runtimeVersions.set(retired.id, { ...clone(runtime), status: 'RETIRED' });
      }
    }
    const updated = {
      ...definition,
      enabled: false,
      activeVersionId: null,
      version: definition.version + 1,
      updatedAt: input.at,
    };
    this.definitions.set(updated.id, clone(updated));
    if (input.retirementAudit && this.auditWriter) await this.auditWriter(clone(input.retirementAudit));
    return { outcome: 'UPDATED', definition: clone(updated) };
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
