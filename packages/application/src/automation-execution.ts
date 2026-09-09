import type {
  AutomationAction,
  AutomationActionExecutionRecord,
  AutomationActionType,
  AutomationExecutionRecord,
  AutomationScalar,
  AutomationVersionRecord,
} from '@insurance/domain';
import type { ClockPort, HashPort, IdGeneratorPort } from './index.js';

export interface AutomationTriggerContext {
  eventType: string;
  triggerIdentity: string;
  contextType: string;
  contextId: string;
  attributes: Readonly<Record<string, AutomationScalar>>;
  correlationId?: string;
}

export type AutomationActionCapability =
  | 'claims.tasks.manage'
  | 'claims.pipeline.transition'
  | 'communications.send'
  | 'automation.tags.manage'
  | 'automation.operator.notify'
  | 'automation.execution.pause'
  | 'automation.approved_fields.update'
  | 'automation.schedule';

export interface AutomationRuntimePrincipal {
  context: 'automation';
  automationVersionId: string;
  executionId: string;
  actionType: AutomationActionType;
  capabilities: readonly AutomationActionCapability[];
}

export interface AutomationActionExecutorResult {
  outcome: 'SUCCEEDED' | 'FAILED';
  targetReference?: string | null;
  failureCategory?: string | null;
  resultMetadata?: Readonly<Record<string, AutomationScalar>>;
}

export interface AutomationActionExecutorPort {
  execute(input: {
    action: AutomationAction;
    context: Pick<AutomationTriggerContext, 'contextType' | 'contextId' | 'correlationId'>;
    principal: AutomationRuntimePrincipal;
    idempotencyKey: string;
  }): Promise<AutomationActionExecutorResult>;
}

export interface AutomationSchedulePort {
  schedule(input: { executionId: string; automationVersionId: string; dueAt: Date; correlationId: string | null }): Promise<void>;
}

export interface AutomationExecutionAuditRecord {
  id: string;
  eventCode: 'AUTOMATION_EXECUTION_SUCCEEDED' | 'AUTOMATION_EXECUTION_FAILED';
  occurredAt: Date;
  actorType: 'AUTOMATION';
  actorId: string;
  targetType: 'AUTOMATION_EXECUTION';
  targetId: string;
  outcome: 'SUCCESS' | 'FAILURE';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface AutomationExecutionRepository {
  listEnabledVersionsForEvent(eventType: string): Promise<AutomationVersionRecord[]>;
  getVersion(versionId: string): Promise<AutomationVersionRecord | null>;
  getExecution(executionId: string): Promise<AutomationExecutionRecord | null>;
  findExecutionByIdempotencyKey(idempotencyKey: string): Promise<AutomationExecutionRecord | null>;
  createExecution(input: { execution: AutomationExecutionRecord; actions: AutomationActionExecutionRecord[] }): Promise<'CREATED' | 'DUPLICATE'>;
  markExecutionRunning(input: { executionId: string; expectedVersion: number; at: Date }): Promise<AutomationExecutionRecord | null>;
  completeAction(input: {
    executionId: string;
    actionKey: string;
    idempotencyKey: string;
    outcome: 'SUCCEEDED' | 'FAILED';
    targetReference: string | null;
    failureCategory: string | null;
    resultMetadata: Readonly<Record<string, AutomationScalar>>;
    at: Date;
  }): Promise<void>;
  finishExecution(input: { executionId: string; expectedVersion: number; status: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'; failureCategory: string | null; at: Date; audit: AutomationExecutionAuditRecord | null }): Promise<AutomationExecutionRecord>;
}

export interface AutomationExecutionDependencies {
  repository: AutomationExecutionRepository;
  actionExecutor: AutomationActionExecutorPort;
  scheduler: AutomationSchedulePort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  hash: HashPort;
}

const CAPABILITY_BY_ACTION: Readonly<Record<AutomationActionType, AutomationActionCapability>> = {
  CREATE_TASK: 'claims.tasks.manage',
  MOVE_OPERATIONAL_STAGE: 'claims.pipeline.transition',
  REQUEST_COMMUNICATION: 'communications.send',
  ADD_OPERATIONAL_TAG: 'automation.tags.manage',
  NOTIFY_OPERATOR: 'automation.operator.notify',
  PAUSE_AUTOMATION: 'automation.execution.pause',
  UPDATE_APPROVED_FIELD: 'automation.approved_fields.update',
  SCHEDULE_CHECK: 'automation.schedule',
};

function scalarEquals(left: AutomationScalar | undefined, right: AutomationScalar): boolean {
  return left === right;
}

function matches(version: AutomationVersionRecord, context: AutomationTriggerContext): boolean {
  for (const condition of version.content.if) {
    const actual = context.attributes[condition.field];
    if (condition.operator === 'EXISTS' && actual === undefined) return false;
    if (condition.operator === 'NOT_EXISTS' && actual !== undefined) return false;
    if (condition.operator === 'EQ' && !scalarEquals(actual, condition.value as AutomationScalar)) return false;
    if (condition.operator === 'NEQ' && scalarEquals(actual, condition.value as AutomationScalar)) return false;
    if (condition.operator === 'IN') {
      const values = condition.value as readonly AutomationScalar[];
      if (!values.some((value) => scalarEquals(actual, value))) return false;
    }
    if (condition.operator === 'NOT_IN') {
      const values = condition.value as readonly AutomationScalar[];
      if (values.some((value) => scalarEquals(actual, value))) return false;
    }
  }
  return true;
}

function executionProjection(execution: AutomationExecutionRecord) {
  return {
    executionId: execution.id,
    automationVersionId: execution.automationVersionId,
    triggerIdentity: execution.triggerIdentity,
    contextType: execution.contextType,
    contextId: execution.contextId,
    status: execution.status,
    correlationId: execution.correlationId,
    startedAt: execution.startedAt.toISOString(),
    completedAt: execution.completedAt?.toISOString() ?? null,
    failureCategory: execution.failureCategory,
  };
}

function terminalAudit(input: {
  id: string;
  version: AutomationVersionRecord;
  execution: AutomationExecutionRecord;
  status: 'SUCCEEDED' | 'FAILED';
  failureCategory: string | null;
  completedActionCount: number;
  at: Date;
}): AutomationExecutionAuditRecord {
  return {
    id: input.id,
    eventCode: input.status === 'SUCCEEDED' ? 'AUTOMATION_EXECUTION_SUCCEEDED' : 'AUTOMATION_EXECUTION_FAILED',
    occurredAt: input.at,
    actorType: 'AUTOMATION',
    actorId: input.version.id,
    targetType: 'AUTOMATION_EXECUTION',
    targetId: input.execution.id,
    outcome: input.status === 'SUCCEEDED' ? 'SUCCESS' : 'FAILURE',
    requestId: input.execution.correlationId,
    metadata: {
      automationVersionId: input.version.id,
      triggerType: input.version.content.when.eventType,
      triggerIdentity: input.execution.triggerIdentity,
      completedActionCount: input.completedActionCount,
      failureCategory: input.failureCategory,
    },
  };
}

export class AutomationExecutionApplication {
  constructor(private readonly deps: AutomationExecutionDependencies) {}

  async handleTrigger(context: AutomationTriggerContext) {
    if (!context.triggerIdentity || context.triggerIdentity.length > 220) throw new Error('Automation trigger identity is invalid.');
    if (!context.contextType || context.contextType.length > 80 || !context.contextId || context.contextId.length > 120) throw new Error('Automation trigger context is invalid.');
    const versions = await this.deps.repository.listEnabledVersionsForEvent(context.eventType);
    const outcomes = [];
    for (const version of versions) {
      if (!matches(version, context)) continue;
      outcomes.push(await this.createOrReplayExecution(version, context));
    }
    return outcomes;
  }

  private async createOrReplayExecution(version: AutomationVersionRecord, context: AutomationTriggerContext) {
    const idempotencyKey = await this.deps.hash.sha256(`${version.id}:${context.triggerIdentity}`);
    const existing = await this.deps.repository.findExecutionByIdempotencyKey(idempotencyKey);
    if (existing) return { ...executionProjection(existing), replayed: true };

    const at = this.deps.clock.now();
    const execution: AutomationExecutionRecord = {
      id: this.deps.ids.uuid(),
      automationVersionId: version.id,
      triggerIdentity: context.triggerIdentity,
      idempotencyKey,
      contextType: context.contextType,
      contextId: context.contextId,
      status: version.content.wait ? 'PENDING' : 'RUNNING',
      correlationId: context.correlationId ?? null,
      startedAt: at,
      completedAt: null,
      failureCategory: null,
      version: 1,
    };
    const actions: AutomationActionExecutionRecord[] = [];
    for (const action of version.content.then) {
      actions.push({
        id: this.deps.ids.uuid(), executionId: execution.id, actionKey: action.key, actionType: action.type, targetReference: null,
        idempotencyKey: await this.deps.hash.sha256(`${idempotencyKey}:${action.key}`), status: 'PENDING', attemptCount: 0,
        startedAt: null, completedAt: null, failureCategory: null, resultMetadata: {},
      });
    }
    const created = await this.deps.repository.createExecution({ execution, actions });
    if (created === 'DUPLICATE') {
      const raced = await this.deps.repository.findExecutionByIdempotencyKey(idempotencyKey);
      if (!raced) throw new Error('Automation execution duplicate disappeared after idempotency race.');
      return { ...executionProjection(raced), replayed: true };
    }

    if (version.content.wait) {
      await this.deps.scheduler.schedule({
        executionId: execution.id,
        automationVersionId: version.id,
        dueAt: new Date(at.getTime() + version.content.wait.delaySeconds * 1000),
        correlationId: execution.correlationId,
      });
      return { ...executionProjection(execution), replayed: false };
    }

    const finished = await this.executeActions(execution, version, context);
    return { ...executionProjection(finished), replayed: false };
  }

  async resumeExecution(executionId: string) {
    const execution = await this.deps.repository.getExecution(executionId);
    if (!execution) throw new Error('Automation execution was not found.');
    if (execution.status === 'SUCCEEDED' || execution.status === 'FAILED' || execution.status === 'SKIPPED') return executionProjection(execution);
    const version = await this.deps.repository.getVersion(execution.automationVersionId);
    if (!version || version.status !== 'ACTIVE') {
      return executionProjection(await this.deps.repository.finishExecution({
        executionId: execution.id, expectedVersion: execution.version, status: 'SKIPPED', failureCategory: 'AUTOMATION_VERSION_NOT_ACTIVE', at: this.deps.clock.now(), audit: null,
      }));
    }
    const running = execution.status === 'PENDING'
      ? await this.deps.repository.markExecutionRunning({ executionId: execution.id, expectedVersion: execution.version, at: this.deps.clock.now() })
      : execution;
    if (!running) {
      const current = await this.deps.repository.getExecution(execution.id);
      if (!current) throw new Error('Automation execution disappeared during resume.');
      return executionProjection(current);
    }
    return executionProjection(await this.executeActions(running, version, {
      eventType: version.content.when.eventType,
      triggerIdentity: running.triggerIdentity,
      contextType: running.contextType,
      contextId: running.contextId,
      attributes: {},
      correlationId: running.correlationId ?? undefined,
    }));
  }

  private async executeActions(execution: AutomationExecutionRecord, version: AutomationVersionRecord, context: AutomationTriggerContext): Promise<AutomationExecutionRecord> {
    let current = execution;
    let completedActionCount = 0;
    for (const action of version.content.then) {
      const actionIdempotencyKey = await this.deps.hash.sha256(`${execution.idempotencyKey}:${action.key}`);
      const principal: AutomationRuntimePrincipal = {
        context: 'automation', automationVersionId: version.id, executionId: execution.id, actionType: action.type,
        capabilities: [CAPABILITY_BY_ACTION[action.type]],
      };
      let result: AutomationActionExecutorResult;
      try {
        result = await this.deps.actionExecutor.execute({
          action,
          context: { contextType: context.contextType, contextId: context.contextId, correlationId: context.correlationId },
          principal,
          idempotencyKey: actionIdempotencyKey,
        });
      } catch {
        result = { outcome: 'FAILED', failureCategory: 'ACTION_EXECUTOR_EXCEPTION' };
      }
      const failureCategory = result.outcome === 'FAILED'
        ? (result.failureCategory ?? 'AUTOMATION_ACTION_FAILED').trim().slice(0, 80) || 'AUTOMATION_ACTION_FAILED'
        : null;
      await this.deps.repository.completeAction({
        executionId: execution.id, actionKey: action.key, idempotencyKey: actionIdempotencyKey, outcome: result.outcome,
        targetReference: result.targetReference ?? null, failureCategory, resultMetadata: result.resultMetadata ?? {}, at: this.deps.clock.now(),
      });
      completedActionCount += 1;
      if (result.outcome === 'FAILED') {
        const at = this.deps.clock.now();
        return this.deps.repository.finishExecution({
          executionId: execution.id, expectedVersion: current.version, status: 'FAILED', failureCategory, at,
          audit: terminalAudit({ id: this.deps.ids.uuid(), version, execution, status: 'FAILED', failureCategory, completedActionCount, at }),
        });
      }
    }
    const at = this.deps.clock.now();
    return this.deps.repository.finishExecution({
      executionId: execution.id, expectedVersion: current.version, status: 'SUCCEEDED', failureCategory: null, at,
      audit: terminalAudit({ id: this.deps.ids.uuid(), version, execution, status: 'SUCCEEDED', failureCategory: null, completedActionCount, at }),
    });
  }
}
