import type {
  AutomationAction,
  AutomationCondition,
  AutomationDefinitionRecord,
  AutomationRuleContent,
  AutomationScalar,
  AutomationVersionRecord,
} from '@insurance/domain';
import { type ActorContext, type ClockPort, type IdGeneratorPort, type RequestContext } from './index.js';

export type AutomationAdminErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'CONFIGURATION_VERSION_IMMUTABLE'
  | 'CONFIGURATION_ACTIVATION_CONFLICT'
  | 'AUTOMATION_DEFINITION_INVALID';

export class AutomationAdminApplicationError extends Error {
  constructor(readonly code: AutomationAdminErrorCode, message: string) {
    super(message);
    this.name = 'AutomationAdminApplicationError';
  }
}

export interface AutomationAdminAuditRecord {
  id: string;
  eventCode: 'AUTOMATION_VERSION_CREATED' | 'AUTOMATION_VERSION_ACTIVATED' | 'AUTOMATION_VERSION_DISABLED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR';
  actorId: string;
  targetType: 'AUTOMATION_DEFINITION' | 'AUTOMATION_VERSION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type AutomationAdminMutationResult =
  | { outcome: 'UPDATED'; definition: AutomationDefinitionRecord }
  | { outcome: 'STALE' }
  | { outcome: 'NOT_DRAFT' }
  | { outcome: 'ACTIVATION_CONFLICT' };

export interface AutomationAdminRepository {
  listDefinitions(input: { page: number; pageSize: number }): Promise<{ items: AutomationDefinitionRecord[]; totalItems: number }>;
  getDefinition(definitionId: string): Promise<AutomationDefinitionRecord | null>;
  findDefinitionByKey(key: string): Promise<AutomationDefinitionRecord | null>;
  listVersions(definitionId: string): Promise<AutomationVersionRecord[]>;
  getVersion(versionId: string): Promise<AutomationVersionRecord | null>;
  createDefinition(input: {
    definition: AutomationDefinitionRecord;
    version: AutomationVersionRecord;
    audit: AutomationAdminAuditRecord;
  }): Promise<void>;
  createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: AutomationVersionRecord;
    audit: AutomationAdminAuditRecord;
  }): Promise<AutomationAdminMutationResult>;
  activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: AutomationAdminAuditRecord;
  }): Promise<AutomationAdminMutationResult>;
  updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    disableAudit: AutomationAdminAuditRecord | null;
  }): Promise<AutomationAdminMutationResult>;
}

export interface AutomationAdminDependencies {
  repository: AutomationAdminRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

export const AUTOMATION_TRIGGER_EVENTS = [
  'CLAIM_CREATED',
  'CLAIM_STATE_TRANSITIONED',
  'CLAIM_TASK_COMPLETED',
  'COMMUNICATION_DELIVERED',
  'INBOUND_EVENT_PROCESSED',
  'SCHEDULED_CHECK',
] as const;

const ACTION_TYPES = new Set([
  'CREATE_TASK',
  'MOVE_OPERATIONAL_STAGE',
  'REQUEST_COMMUNICATION',
  'ADD_OPERATIONAL_TAG',
  'NOTIFY_OPERATOR',
  'PAUSE_AUTOMATION',
  'UPDATE_APPROVED_FIELD',
  'SCHEDULE_CHECK',
]);
const CONDITION_OPERATORS = new Set(['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS']);
const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const FIELD_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

function requireAdmin(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new AutomationAdminApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('automations.admin')) {
    throw new AutomationAdminApplicationError('FORBIDDEN', 'The caller is not authorized to administer automations.');
  }
  return actor;
}

function boundedText(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', `${name} is required and must be at most ${max} characters.`);
  }
  return normalized;
}

function requireExpectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'expectedDefinitionVersion must be a positive integer.');
  }
  return value;
}

function normalizeScalar(value: AutomationScalar, name: string): AutomationScalar {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', `${name} must be finite.`);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 500) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', `${name} is too long.`);
    const lowered = value.toLowerCase();
    if (lowered.includes('javascript:') || lowered.startsWith('http://') || lowered.startsWith('https://')) {
      throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', `${name} contains an unsupported executable or outbound target.`);
    }
    return value;
  }
  throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', `${name} must be a scalar.`);
}

function normalizeCondition(condition: AutomationCondition): AutomationCondition {
  const field = boundedText('condition.field', condition.field, 80);
  if (!FIELD_PATTERN.test(field)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'condition.field contains unsupported characters.');
  if (!CONDITION_OPERATORS.has(condition.operator)) {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'condition.operator is not supported.');
  }
  const needsNoValue = condition.operator === 'EXISTS' || condition.operator === 'NOT_EXISTS';
  if (needsNoValue) return { field, operator: condition.operator };
  if (condition.value === undefined) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'condition.value is required for this operator.');
  if (Array.isArray(condition.value)) {
    if (!['IN', 'NOT_IN'].includes(condition.operator) || condition.value.length < 1 || condition.value.length > 20) {
      throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'condition list value is invalid for this operator.');
    }
    return { field, operator: condition.operator, value: condition.value.map((item, index) => normalizeScalar(item, `condition.value[${index}]`)) };
  }
  if (condition.operator === 'IN' || condition.operator === 'NOT_IN') {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'IN and NOT_IN require an array value.');
  }
  return { field, operator: condition.operator, value: normalizeScalar(condition.value as AutomationScalar, 'condition.value') };
}

function normalizeAction(action: AutomationAction): AutomationAction {
  const key = boundedText('action.key', action.key, 80);
  if (!KEY_PATTERN.test(key)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'action.key contains unsupported characters.');
  if (!ACTION_TYPES.has(action.type)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'action.type is not supported by R3.');
  const entries = Object.entries(action.parameters ?? {});
  if (entries.length > 20) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'action.parameters exceeds the approved bound.');
  const parameters: Record<string, AutomationScalar> = {};
  for (const [parameterKey, raw] of entries) {
    if (!KEY_PATTERN.test(parameterKey)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'action parameter key contains unsupported characters.');
    if (/(url|uri|sql|script|code|secret|token|password)/i.test(parameterKey)) {
      throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'action parameters cannot declare executable, credential, SQL, or outbound URL fields.');
    }
    parameters[parameterKey] = normalizeScalar(raw, `action.parameters.${parameterKey}`);
  }
  return { key, type: action.type, parameters };
}

export function normalizeAutomationContent(content: AutomationRuleContent): AutomationRuleContent {
  if (!content || typeof content !== 'object') throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'Automation content is required.');
  const eventType = boundedText('when.eventType', content.when?.eventType, 80);
  if (!(AUTOMATION_TRIGGER_EVENTS as readonly string[]).includes(eventType)) {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'when.eventType is not in the approved R3 trigger allowlist.');
  }
  const conditions = [...(content.if ?? [])];
  if (conditions.length > 20) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'An automation may contain at most 20 conditions.');
  const normalizedConditions = conditions.map(normalizeCondition);
  let wait = null;
  if (content.wait) {
    if (!Number.isInteger(content.wait.delaySeconds) || content.wait.delaySeconds < 60 || content.wait.delaySeconds > 2_592_000) {
      throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'wait.delaySeconds must be between 60 seconds and 30 days.');
    }
    wait = { delaySeconds: content.wait.delaySeconds };
  }
  const actions = [...(content.then ?? [])];
  if (actions.length < 1 || actions.length > 20) {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'An automation must contain between 1 and 20 approved actions.');
  }
  const normalizedActions = actions.map(normalizeAction);
  if (new Set(normalizedActions.map((action) => action.key)).size !== normalizedActions.length) {
    throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'Automation action keys must be unique inside a version.');
  }
  return { when: { eventType }, if: normalizedConditions, wait, then: normalizedActions };
}

function project(definition: AutomationDefinitionRecord, versions: readonly AutomationVersionRecord[]) {
  return {
    definitionId: definition.id,
    key: definition.key,
    displayName: definition.displayName,
    enabled: definition.enabled,
    activeVersionId: definition.activeVersionId,
    version: definition.version,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    versions: [...versions].sort((a, b) => a.versionNumber - b.versionNumber).map((version) => ({
      versionId: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      content: structuredClone(version.content),
      sourceClassification: version.sourceClassification,
      createdByType: version.createdByType,
      createdById: version.createdById,
      createdAt: version.createdAt.toISOString(),
      activatedAt: version.activatedAt?.toISOString() ?? null,
      retiredAt: version.retiredAt?.toISOString() ?? null,
    })),
  };
}

export class AutomationAdminApplication {
  constructor(private readonly deps: AutomationAdminDependencies) {}

  async listAutomations(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requireAdmin(actor);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'Invalid automation pagination parameters.');
    }
    const result = await this.deps.repository.listDefinitions({ page, pageSize });
    const items = await Promise.all(result.items.map(async (definition) => project(definition, await this.deps.repository.listVersions(definition.id))));
    return { items, page, pageSize, totalItems: result.totalItems, totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)) };
  }

  async getAutomation(definitionId: string, actor?: ActorContext) {
    requireAdmin(actor);
    const definition = await this.deps.repository.getDefinition(definitionId);
    if (!definition) throw new AutomationAdminApplicationError('RESOURCE_NOT_FOUND', 'The automation definition could not be found.');
    return project(definition, await this.deps.repository.listVersions(definition.id));
  }

  async createAutomation(input: { key: string; displayName: string; sourceClassification: string; content: AutomationRuleContent }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    const key = boundedText('key', input.key, 80);
    if (!KEY_PATTERN.test(key)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'key contains unsupported characters.');
    if (await this.deps.repository.findDefinitionByKey(key)) throw new AutomationAdminApplicationError('AUTOMATION_DEFINITION_INVALID', 'Automation key must be unique.');
    const at = this.deps.clock.now();
    const definition: AutomationDefinitionRecord = {
      id: this.deps.ids.uuid(), key, displayName: boundedText('displayName', input.displayName, 160), enabled: false, activeVersionId: null,
      version: 1, createdAt: at, updatedAt: at,
    };
    const version: AutomationVersionRecord = {
      id: this.deps.ids.uuid(), definitionId: definition.id, versionNumber: 1, status: 'DRAFT', content: normalizeAutomationContent(input.content),
      sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdByType: 'ADMINISTRATOR', createdById: authenticated.operatorId, createdAt: at, activatedAt: null, retiredAt: null,
    };
    await this.deps.repository.createDefinition({ definition, version, audit: {
      id: this.deps.ids.uuid(), eventCode: 'AUTOMATION_VERSION_CREATED', occurredAt: at, actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
      targetType: 'AUTOMATION_VERSION', targetId: version.id, outcome: 'SUCCESS', requestId: context.requestId ?? null,
      metadata: { definitionId: definition.id, automationKey: key, versionNumber: 1 },
    } });
    return project(definition, [version]);
  }

  async createAutomationVersion(input: { definitionId: string; expectedDefinitionVersion: number; sourceClassification: string; content: AutomationRuleContent }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    requireExpectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new AutomationAdminApplicationError('RESOURCE_NOT_FOUND', 'The automation definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new AutomationAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The automation definition changed before the new version could be created.');
    const versions = await this.deps.repository.listVersions(definition.id);
    const version: AutomationVersionRecord = {
      id: this.deps.ids.uuid(), definitionId: definition.id, versionNumber: Math.max(0, ...versions.map((item) => item.versionNumber)) + 1,
      status: 'DRAFT', content: normalizeAutomationContent(input.content), sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdByType: 'ADMINISTRATOR', createdById: authenticated.operatorId, createdAt: this.deps.clock.now(), activatedAt: null, retiredAt: null,
    };
    const result = await this.deps.repository.createVersion({ definitionId: definition.id, expectedDefinitionVersion: input.expectedDefinitionVersion, definitionUpdatedAt: this.deps.clock.now(), version, audit: {
      id: this.deps.ids.uuid(), eventCode: 'AUTOMATION_VERSION_CREATED', occurredAt: this.deps.clock.now(), actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
      targetType: 'AUTOMATION_VERSION', targetId: version.id, outcome: 'SUCCESS', requestId: context.requestId ?? null,
      metadata: { definitionId: definition.id, automationKey: definition.key, versionNumber: version.versionNumber },
    } });
    if (result.outcome === 'STALE') throw new AutomationAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The automation definition changed before the new version could be created.');
    if (result.outcome !== 'UPDATED') throw new AutomationAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The automation version could not be created in the current configuration state.');
    return project(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async activateAutomationVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    requireExpectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new AutomationAdminApplicationError('RESOURCE_NOT_FOUND', 'The automation definition could not be found.');
    const version = await this.deps.repository.getVersion(input.versionId);
    if (!version || version.definitionId !== definition.id) throw new AutomationAdminApplicationError('RESOURCE_NOT_FOUND', 'The automation version could not be found.');
    if (version.status !== 'DRAFT') throw new AutomationAdminApplicationError('CONFIGURATION_VERSION_IMMUTABLE', 'Only a DRAFT automation version can be activated.');
    const at = this.deps.clock.now();
    const result = await this.deps.repository.activateVersion({ definitionId: definition.id, versionId: version.id, expectedDefinitionVersion: input.expectedDefinitionVersion, at, audit: {
      id: this.deps.ids.uuid(), eventCode: 'AUTOMATION_VERSION_ACTIVATED', occurredAt: at, actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
      targetType: 'AUTOMATION_VERSION', targetId: version.id, outcome: 'SUCCESS', requestId: context.requestId ?? null,
      metadata: { definitionId: definition.id, automationKey: definition.key, versionNumber: version.versionNumber },
    } });
    if (result.outcome === 'STALE') throw new AutomationAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The automation definition changed before activation.');
    if (result.outcome === 'NOT_DRAFT') throw new AutomationAdminApplicationError('CONFIGURATION_VERSION_IMMUTABLE', 'Only a DRAFT automation version can be activated.');
    if (result.outcome !== 'UPDATED') throw new AutomationAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The automation version cannot be activated in the current configuration state.');
    return project(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async updateAutomationState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    requireExpectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new AutomationAdminApplicationError('RESOURCE_NOT_FOUND', 'The automation definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new AutomationAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The automation definition changed before its state could be updated.');
    if (input.enabled && !definition.activeVersionId) throw new AutomationAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'An automation definition requires an active version before it can be enabled.');
    const at = this.deps.clock.now();
    const disableAudit = !input.enabled && definition.enabled ? {
      id: this.deps.ids.uuid(), eventCode: 'AUTOMATION_VERSION_DISABLED' as const, occurredAt: at, actorType: 'ADMINISTRATOR' as const, actorId: authenticated.operatorId,
      targetType: 'AUTOMATION_DEFINITION' as const, targetId: definition.id, outcome: 'SUCCESS' as const, requestId: context.requestId ?? null,
      metadata: { definitionId: definition.id, automationKey: definition.key, previousActiveVersionId: definition.activeVersionId },
    } : null;
    const result = await this.deps.repository.updateState({ definitionId: definition.id, enabled: input.enabled, expectedDefinitionVersion: input.expectedDefinitionVersion, at, disableAudit });
    if (result.outcome === 'STALE') throw new AutomationAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The automation definition changed before its state could be updated.');
    if (result.outcome !== 'UPDATED') throw new AutomationAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The automation definition cannot be updated in the current configuration state.');
    return project(result.definition, await this.deps.repository.listVersions(definition.id));
  }
}
