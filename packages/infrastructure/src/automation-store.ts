import type {
  AutomationAdminAuditRecord,
  AutomationAdminMutationResult,
  AutomationAdminRepository,
} from '@insurance/application/automation-admin';
import type {
  AutomationActionExecutorPort,
  AutomationExecutionAuditRecord,
  AutomationExecutionRepository,
  AutomationSchedulePort,
} from '@insurance/application/automation-execution';
import type { ClockPort, IdGeneratorPort } from '@insurance/application';
import type {
  AutomationActionExecutionRecord,
  AutomationDefinitionRecord,
  AutomationExecutionRecord,
  AutomationRuleContent,
  AutomationScalar,
  AutomationVersionRecord,
} from '@insurance/domain';

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

function definitionRow(row: any): AutomationDefinitionRecord {
  return {
    id: row.id,
    key: row.ruleKey,
    displayName: row.displayName,
    enabled: Boolean(row.enabled),
    activeVersionId: row.activeVersionId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function contentRow(row: any): AutomationRuleContent {
  return {
    when: clone(row.triggerSchema ?? { eventType: '' }),
    if: clone(Array.isArray(row.conditionSchema) ? row.conditionSchema : []),
    wait: row.waitSchema ? clone(row.waitSchema) : null,
    then: clone(Array.isArray(row.actionList) ? row.actionList : []),
  } as AutomationRuleContent;
}

function versionRow(row: any): AutomationVersionRecord {
  return {
    id: row.id,
    definitionId: row.automationDefinitionId,
    versionNumber: Number(row.versionNumber),
    status: row.status,
    content: contentRow(row),
    sourceClassification: row.sourceClassification,
    createdByType: row.createdByType,
    createdById: row.createdById ?? null,
    createdAt: toAppDate(row.createdAt),
    activatedAt: row.activatedAt ? toAppDate(row.activatedAt) : null,
    retiredAt: row.retiredAt ? toAppDate(row.retiredAt) : null,
  };
}

function executionRow(row: any): AutomationExecutionRecord {
  return {
    id: row.id,
    automationVersionId: row.automationVersionId,
    triggerIdentity: row.triggerIdentity,
    idempotencyKey: row.idempotencyKey,
    contextType: row.contextType,
    contextId: row.contextId,
    status: row.status,
    correlationId: row.correlationId ?? null,
    startedAt: toAppDate(row.startedAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    failureCategory: row.failureCategory ?? null,
    version: Number(row.version),
  };
}

async function appendAudit(db: any, audit: AutomationAdminAuditRecord | AutomationExecutionAuditRecord): Promise<void> {
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

class AutomationTransactionAbort extends Error {
  constructor(readonly outcome: Exclude<AutomationAdminMutationResult, { outcome: 'UPDATED' }>['outcome']) {
    super(outcome);
    this.name = 'AutomationTransactionAbort';
  }
}

export class MemoryAutomationStore implements AutomationAdminRepository, AutomationExecutionRepository {
  private readonly definitions = new Map<string, AutomationDefinitionRecord>();
  private readonly versions = new Map<string, AutomationVersionRecord>();
  private readonly executions = new Map<string, AutomationExecutionRecord>();
  private readonly actionExecutions = new Map<string, AutomationActionExecutionRecord>();
  readonly audits: AutomationAdminAuditRecord[] = [];
  readonly executionAudits: AutomationExecutionAuditRecord[] = [];

  async listDefinitions(input: { page: number; pageSize: number }) {
    const all = [...this.definitions.values()].map(clone).sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }
  async getDefinition(definitionId: string) { const value = this.definitions.get(definitionId); return value ? clone(value) : null; }
  async findDefinitionByKey(key: string) {
    const value = [...this.definitions.values()].find((item) => item.key === key);
    return value ? clone(value) : null;
  }
  async listVersions(definitionId: string) {
    return [...this.versions.values()].filter((item) => item.definitionId === definitionId).map(clone).sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id));
  }
  async getVersion(versionId: string) { const value = this.versions.get(versionId); return value ? clone(value) : null; }

  async createDefinition(input: { definition: AutomationDefinitionRecord; version: AutomationVersionRecord; audit: AutomationAdminAuditRecord }) {
    this.definitions.set(input.definition.id, clone(input.definition));
    this.versions.set(input.version.id, clone(input.version));
    this.audits.push(clone(input.audit));
  }

  async createVersion(input: { definitionId: string; expectedDefinitionVersion: number; definitionUpdatedAt: Date; version: AutomationVersionRecord; audit: AutomationAdminAuditRecord }): Promise<AutomationAdminMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    definition.version += 1;
    definition.updatedAt = input.definitionUpdatedAt;
    this.definitions.set(definition.id, clone(definition));
    this.versions.set(input.version.id, clone(input.version));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async activateVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number; at: Date; audit: AutomationAdminAuditRecord }): Promise<AutomationAdminMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    const target = this.versions.get(input.versionId);
    if (!target || target.definitionId !== definition.id) return { outcome: 'ACTIVATION_CONFLICT' };
    if (target.status !== 'DRAFT') return { outcome: 'NOT_DRAFT' };
    if (definition.activeVersionId) {
      const previous = this.versions.get(definition.activeVersionId);
      if (previous?.status === 'ACTIVE') {
        previous.status = 'RETIRED'; previous.retiredAt = input.at;
        this.versions.set(previous.id, clone(previous));
      }
    }
    target.status = 'ACTIVE'; target.activatedAt = input.at; target.retiredAt = null;
    this.versions.set(target.id, clone(target));
    definition.activeVersionId = target.id; definition.version += 1; definition.updatedAt = input.at;
    this.definitions.set(definition.id, clone(definition));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async updateState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number; at: Date; disableAudit: AutomationAdminAuditRecord | null }): Promise<AutomationAdminMutationResult> {
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
          active.status = 'RETIRED'; active.retiredAt = input.at;
          this.versions.set(active.id, clone(active));
        }
        definition.activeVersionId = null;
        if (input.disableAudit) this.audits.push(clone(input.disableAudit));
      }
    }
    definition.version += 1; definition.updatedAt = input.at;
    this.definitions.set(definition.id, clone(definition));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async listEnabledVersionsForEvent(eventType: string) {
    const result: AutomationVersionRecord[] = [];
    for (const definition of this.definitions.values()) {
      if (!definition.enabled || !definition.activeVersionId) continue;
      const version = this.versions.get(definition.activeVersionId);
      if (version?.status === 'ACTIVE' && version.content.when.eventType === eventType) result.push(clone(version));
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }

  async getExecution(executionId: string) { const value = this.executions.get(executionId); return value ? clone(value) : null; }
  async findExecutionByIdempotencyKey(idempotencyKey: string) {
    const value = [...this.executions.values()].find((item) => item.idempotencyKey === idempotencyKey);
    return value ? clone(value) : null;
  }

  async createExecution(input: { execution: AutomationExecutionRecord; actions: AutomationActionExecutionRecord[] }): Promise<'CREATED' | 'DUPLICATE'> {
    if ([...this.executions.values()].some((item) => item.idempotencyKey === input.execution.idempotencyKey)) return 'DUPLICATE';
    this.executions.set(input.execution.id, clone(input.execution));
    for (const action of input.actions) this.actionExecutions.set(`${action.executionId}:${action.actionKey}`, clone(action));
    return 'CREATED';
  }

  async markExecutionRunning(input: { executionId: string; expectedVersion: number; at: Date }) {
    const execution = this.executions.get(input.executionId);
    if (!execution || execution.version !== input.expectedVersion || execution.status !== 'PENDING') return null;
    execution.status = 'RUNNING'; execution.version += 1;
    this.executions.set(execution.id, clone(execution));
    return clone(execution);
  }

  async completeAction(input: { executionId: string; actionKey: string; idempotencyKey: string; outcome: 'SUCCEEDED' | 'FAILED'; targetReference: string | null; failureCategory: string | null; resultMetadata: Readonly<Record<string, AutomationScalar>>; at: Date }) {
    const key = `${input.executionId}:${input.actionKey}`;
    const action = this.actionExecutions.get(key);
    if (!action || action.idempotencyKey !== input.idempotencyKey) throw new Error('Automation action execution state is missing.');
    if (action.status === 'SUCCEEDED' || action.status === 'FAILED') return;
    action.status = input.outcome; action.targetReference = input.targetReference; action.failureCategory = input.failureCategory;
    action.attemptCount += 1; action.startedAt ??= input.at; action.completedAt = input.at; action.resultMetadata = clone(input.resultMetadata);
    this.actionExecutions.set(key, clone(action));
  }

  async finishExecution(input: { executionId: string; expectedVersion: number; status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'; failureCategory: string | null; at: Date; audit: AutomationExecutionAuditRecord | null }) {
    const execution = this.executions.get(input.executionId);
    if (!execution) throw new Error('Automation execution was not found.');
    if (execution.version !== input.expectedVersion) throw new Error('Automation execution changed concurrently.');
    if (execution.status === 'SUCCEEDED' || execution.status === 'FAILED' || execution.status === 'SKIPPED') return clone(execution);
    execution.status = input.status; execution.failureCategory = input.failureCategory; execution.completedAt = input.at; execution.version += 1;
    this.executions.set(execution.id, clone(execution));
    if (input.audit) this.executionAudits.push(clone(input.audit));
    return clone(execution);
  }

  listActionExecutions(executionId: string) {
    return [...this.actionExecutions.values()].filter((item) => item.executionId === executionId).map(clone).sort((a, b) => a.actionKey.localeCompare(b.actionKey));
  }
}

export class PrismaAutomationStore implements AutomationAdminRepository, AutomationExecutionRepository {
  constructor(private readonly db: any) {}

  async listDefinitions(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.AutomationDefinition.all();
    const all = rows.map(definitionRow).sort((a: AutomationDefinitionRecord, b: AutomationDefinitionRecord) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }
  async getDefinition(definitionId: string) { const row = await this.db.orm.public.AutomationDefinition.first({ id: definitionId }); return row ? definitionRow(row) : null; }
  async findDefinitionByKey(key: string) { const row = await this.db.orm.public.AutomationDefinition.first({ ruleKey: key }); return row ? definitionRow(row) : null; }
  async listVersions(definitionId: string) {
    const rows = await this.db.orm.public.AutomationVersion.all({ automationDefinitionId: definitionId });
    return rows.map(versionRow).sort((a: AutomationVersionRecord, b: AutomationVersionRecord) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id));
  }
  async getVersion(versionId: string) { const row = await this.db.orm.public.AutomationVersion.first({ id: versionId }); return row ? versionRow(row) : null; }

  async createDefinition(input: { definition: AutomationDefinitionRecord; version: AutomationVersionRecord; audit: AutomationAdminAuditRecord }) {
    await this.db.transaction(async (txDb: any) => {
      await txDb.orm.public.AutomationDefinition.create({
        id: input.definition.id, ruleKey: input.definition.key, displayName: input.definition.displayName, enabled: input.definition.enabled,
        activeVersionId: null, createdAt: toDbInstant(input.definition.createdAt), updatedAt: toDbInstant(input.definition.updatedAt), version: input.definition.version,
      });
      await txDb.orm.public.AutomationVersion.create({
        id: input.version.id, automationDefinitionId: input.version.definitionId, versionNumber: input.version.versionNumber, status: input.version.status,
        triggerSchema: input.version.content.when, conditionSchema: input.version.content.if, waitSchema: input.version.content.wait, actionList: input.version.content.then,
        sourceClassification: input.version.sourceClassification, createdByType: input.version.createdByType, createdById: input.version.createdById,
        createdAt: toDbInstant(input.version.createdAt), activatedAt: null, retiredAt: null,
      });
      await appendAudit(txDb, input.audit);
    });
  }

  async createVersion(input: { definitionId: string; expectedDefinitionVersion: number; definitionUpdatedAt: Date; version: AutomationVersionRecord; audit: AutomationAdminAuditRecord }): Promise<AutomationAdminMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const updated = await txDb.orm.public.AutomationDefinition.where({ id: input.definitionId, version: input.expectedDefinitionVersion }).updateAndCount({
          version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.definitionUpdatedAt),
        });
        if (updated !== 1) throw new AutomationTransactionAbort('STALE');
        await txDb.orm.public.AutomationVersion.create({
          id: input.version.id, automationDefinitionId: input.version.definitionId, versionNumber: input.version.versionNumber, status: input.version.status,
          triggerSchema: input.version.content.when, conditionSchema: input.version.content.if, waitSchema: input.version.content.wait, actionList: input.version.content.then,
          sourceClassification: input.version.sourceClassification, createdByType: input.version.createdByType, createdById: input.version.createdById,
          createdAt: toDbInstant(input.version.createdAt), activatedAt: null, retiredAt: null,
        });
        await appendAudit(txDb, input.audit);
        const row = await txDb.orm.public.AutomationDefinition.first({ id: input.definitionId });
        if (!row) throw new Error('Automation definition disappeared while creating a version.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof AutomationTransactionAbort) return { outcome: error.outcome };
      throw error;
    }
  }

  async activateVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number; at: Date; audit: AutomationAdminAuditRecord }): Promise<AutomationAdminMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const rawDefinition = await txDb.orm.public.AutomationDefinition.first({ id: input.definitionId });
        if (!rawDefinition || Number(rawDefinition.version) !== input.expectedDefinitionVersion) throw new AutomationTransactionAbort('STALE');
        const rawTarget = await txDb.orm.public.AutomationVersion.first({ id: input.versionId });
        if (!rawTarget || rawTarget.automationDefinitionId !== input.definitionId) throw new AutomationTransactionAbort('ACTIVATION_CONFLICT');
        if (rawTarget.status !== 'DRAFT') throw new AutomationTransactionAbort('NOT_DRAFT');
        if (rawDefinition.activeVersionId) {
          await txDb.orm.public.AutomationVersion.where({ id: rawDefinition.activeVersionId, status: 'ACTIVE' }).updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
        }
        const activated = await txDb.orm.public.AutomationVersion.where({ id: input.versionId, status: 'DRAFT' }).updateAndCount({
          status: 'ACTIVE', activatedAt: toDbInstant(input.at), retiredAt: null,
        });
        if (activated !== 1) throw new AutomationTransactionAbort('NOT_DRAFT');
        const updated = await txDb.orm.public.AutomationDefinition.where({ id: input.definitionId, version: input.expectedDefinitionVersion }).updateAndCount({
          activeVersionId: input.versionId, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at),
        });
        if (updated !== 1) throw new AutomationTransactionAbort('STALE');
        await appendAudit(txDb, input.audit);
        const changed = await txDb.orm.public.AutomationDefinition.first({ id: input.definitionId });
        if (!changed) throw new Error('Automation definition disappeared while activating a version.');
        return { outcome: 'UPDATED', definition: definitionRow(changed) } as const;
      });
    } catch (error) {
      if (error instanceof AutomationTransactionAbort) return { outcome: error.outcome };
      throw error;
    }
  }

  async updateState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number; at: Date; disableAudit: AutomationAdminAuditRecord | null }): Promise<AutomationAdminMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.AutomationDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new AutomationTransactionAbort('STALE');
        if (input.enabled) {
          if (!raw.activeVersionId) throw new AutomationTransactionAbort('ACTIVATION_CONFLICT');
          const active = await txDb.orm.public.AutomationVersion.first({ id: raw.activeVersionId });
          if (!active || active.status !== 'ACTIVE') throw new AutomationTransactionAbort('ACTIVATION_CONFLICT');
          const updated = await txDb.orm.public.AutomationDefinition.where({ id: input.definitionId, version: input.expectedDefinitionVersion }).updateAndCount({
            enabled: true, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at),
          });
          if (updated !== 1) throw new AutomationTransactionAbort('STALE');
        } else {
          if (raw.activeVersionId) {
            await txDb.orm.public.AutomationVersion.where({ id: raw.activeVersionId, status: 'ACTIVE' }).updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
          }
          const updated = await txDb.orm.public.AutomationDefinition.where({ id: input.definitionId, version: input.expectedDefinitionVersion }).updateAndCount({
            enabled: false, activeVersionId: null, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at),
          });
          if (updated !== 1) throw new AutomationTransactionAbort('STALE');
          if (input.disableAudit) await appendAudit(txDb, input.disableAudit);
        }
        const changed = await txDb.orm.public.AutomationDefinition.first({ id: input.definitionId });
        if (!changed) throw new Error('Automation definition disappeared while updating state.');
        return { outcome: 'UPDATED', definition: definitionRow(changed) } as const;
      });
    } catch (error) {
      if (error instanceof AutomationTransactionAbort) return { outcome: error.outcome };
      throw error;
    }
  }

  async listEnabledVersionsForEvent(eventType: string) {
    const definitions = await this.db.orm.public.AutomationDefinition.all();
    const result: AutomationVersionRecord[] = [];
    for (const rawDefinition of definitions) {
      if (!rawDefinition.enabled || !rawDefinition.activeVersionId) continue;
      const rawVersion = await this.db.orm.public.AutomationVersion.first({ id: rawDefinition.activeVersionId });
      if (!rawVersion || rawVersion.status !== 'ACTIVE') continue;
      const version = versionRow(rawVersion);
      if (version.content.when.eventType === eventType) result.push(version);
    }
    return result.sort((a, b) => a.id.localeCompare(b.id));
  }

  async getExecution(executionId: string) { const row = await this.db.orm.public.AutomationExecution.first({ id: executionId }); return row ? executionRow(row) : null; }
  async findExecutionByIdempotencyKey(idempotencyKey: string) { const row = await this.db.orm.public.AutomationExecution.first({ idempotencyKey }); return row ? executionRow(row) : null; }

  async createExecution(input: { execution: AutomationExecutionRecord; actions: AutomationActionExecutionRecord[] }): Promise<'CREATED' | 'DUPLICATE'> {
    try {
      await this.db.transaction(async (txDb: any) => {
        await txDb.orm.public.AutomationExecution.create({
          id: input.execution.id, automationVersionId: input.execution.automationVersionId, triggerIdentity: input.execution.triggerIdentity,
          idempotencyKey: input.execution.idempotencyKey, contextType: input.execution.contextType, contextId: input.execution.contextId,
          status: input.execution.status, correlationId: input.execution.correlationId, startedAt: toDbInstant(input.execution.startedAt), completedAt: null,
          failureCategory: null, version: input.execution.version,
        });
        for (const action of input.actions) {
          await txDb.orm.public.AutomationActionExecution.create({
            id: action.id, automationExecutionId: action.executionId, actionKey: action.actionKey, actionType: action.actionType,
            targetReference: action.targetReference, idempotencyKey: action.idempotencyKey, status: action.status, attemptCount: action.attemptCount,
            startedAt: null, completedAt: null, failureCategory: null, resultMetadata: action.resultMetadata,
          });
        }
      });
      return 'CREATED';
    } catch (error) {
      const existing = await this.findExecutionByIdempotencyKey(input.execution.idempotencyKey);
      if (existing) return 'DUPLICATE';
      throw error;
    }
  }

  async markExecutionRunning(input: { executionId: string; expectedVersion: number; at: Date }) {
    const updated = await this.db.orm.public.AutomationExecution.where({ id: input.executionId, version: input.expectedVersion, status: 'PENDING' }).updateAndCount({
      status: 'RUNNING', version: input.expectedVersion + 1,
    });
    if (updated !== 1) return null;
    const row = await this.db.orm.public.AutomationExecution.first({ id: input.executionId });
    return row ? executionRow(row) : null;
  }

  async completeAction(input: { executionId: string; actionKey: string; idempotencyKey: string; outcome: 'SUCCEEDED' | 'FAILED'; targetReference: string | null; failureCategory: string | null; resultMetadata: Readonly<Record<string, AutomationScalar>>; at: Date }) {
    const action = await this.db.orm.public.AutomationActionExecution.first({ automationExecutionId: input.executionId, actionKey: input.actionKey });
    if (!action || action.idempotencyKey !== input.idempotencyKey) throw new Error('Automation action execution state is missing.');
    if (action.status === 'SUCCEEDED' || action.status === 'FAILED') return;
    await this.db.orm.public.AutomationActionExecution.where({ id: action.id, status: 'PENDING' }).updateAndCount({
      status: input.outcome, targetReference: input.targetReference, attemptCount: Number(action.attemptCount) + 1,
      startedAt: action.startedAt ?? toDbInstant(input.at), completedAt: toDbInstant(input.at), failureCategory: input.failureCategory,
      resultMetadata: input.resultMetadata,
    });
  }

  async finishExecution(input: { executionId: string; expectedVersion: number; status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'; failureCategory: string | null; at: Date; audit: AutomationExecutionAuditRecord | null }) {
    return this.db.transaction(async (txDb: any) => {
      const current = await txDb.orm.public.AutomationExecution.first({ id: input.executionId });
      if (!current) throw new Error('Automation execution was not found.');
      if (['SUCCEEDED', 'FAILED', 'SKIPPED'].includes(current.status)) return executionRow(current);
      const updated = await txDb.orm.public.AutomationExecution.where({ id: input.executionId, version: input.expectedVersion }).updateAndCount({
        status: input.status, failureCategory: input.failureCategory, completedAt: toDbInstant(input.at), version: input.expectedVersion + 1,
      });
      if (updated !== 1) throw new Error('Automation execution changed concurrently.');
      if (input.audit) await appendAudit(txDb, input.audit);
      const changed = await txDb.orm.public.AutomationExecution.first({ id: input.executionId });
      if (!changed) throw new Error('Automation execution disappeared while finishing.');
      return executionRow(changed);
    });
  }
}

export class FailClosedAutomationActionExecutor implements AutomationActionExecutorPort {
  async execute(input: Parameters<AutomationActionExecutorPort['execute']>[0]) {
    if (input.principal.capabilities.length !== 1) throw new Error('Automation runtime capability must be action-scoped.');
    return {
      outcome: 'FAILED' as const,
      targetReference: null,
      failureCategory: 'AUTOMATION_ACTION_NOT_BOUND',
      resultMetadata: { adapter: 'FAIL_CLOSED', actionType: input.action.type },
    };
  }
}

export class MemoryAutomationScheduleAdapter implements AutomationSchedulePort {
  readonly scheduled: Array<{ executionId: string; automationVersionId: string; dueAt: Date; correlationId: string | null }> = [];
  async schedule(input: { executionId: string; automationVersionId: string; dueAt: Date; correlationId: string | null }) {
    if (!this.scheduled.some((item) => item.executionId === input.executionId)) this.scheduled.push(clone(input));
  }
}

export class PrismaAutomationScheduleAdapter implements AutomationSchedulePort {
  constructor(private readonly db: any, private readonly ids: IdGeneratorPort, private readonly clock: ClockPort) {}
  async schedule(input: { executionId: string; automationVersionId: string; dueAt: Date; correlationId: string | null }) {
    const identity = `automation:${input.executionId}`;
    const existing = await this.db.orm.public.AsyncJob.first({ jobType: 'RESUME_AUTOMATION_EXECUTION', idempotencyIdentity: identity });
    if (existing) return;
    const now = this.clock.now();
    try {
      await this.db.orm.public.AsyncJob.create({
        id: this.ids.uuid(), jobType: 'RESUME_AUTOMATION_EXECUTION', idempotencyIdentity: identity,
        payload: { executionId: input.executionId, automationVersionId: input.automationVersionId }, status: 'PENDING', attemptCount: 0, maxAttempts: 3,
        availableAt: toDbInstant(input.dueAt), leaseOwner: null, leaseExpiresAt: null, correlationId: input.correlationId,
        lastFailureCategory: null, createdAt: toDbInstant(now), updatedAt: toDbInstant(now), completedAt: null, version: 1,
      });
    } catch (error) {
      const raced = await this.db.orm.public.AsyncJob.first({ jobType: 'RESUME_AUTOMATION_EXECUTION', idempotencyIdentity: identity });
      if (raced) return;
      throw error;
    }
  }
}
