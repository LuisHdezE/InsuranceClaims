import type {
  CommunicationActorType,
  CommunicationChannel,
  CommunicationTemplateDefinitionProps,
  CommunicationTemplateVersionProps,
} from '@insurance/domain';
import {
  actorTypeForStaffRole,
  type ActorContext,
  type ClockPort,
  type IdGeneratorPort,
  type RequestContext,
} from './index.js';

export type CommunicationTemplateAdminErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'CONFIGURATION_VERSION_IMMUTABLE'
  | 'CONFIGURATION_ACTIVATION_CONFLICT'
  | 'VALIDATION_ERROR';

export class CommunicationTemplateAdminError extends Error {
  constructor(readonly code: CommunicationTemplateAdminErrorCode, message: string) {
    super(message);
    this.name = 'CommunicationTemplateAdminError';
  }
}

export interface CommunicationTemplateAuditRecord {
  id: string;
  eventCode: 'COMM_TEMPLATE_VERSION_CREATED' | 'COMM_TEMPLATE_VERSION_ACTIVATED' | 'COMM_TEMPLATE_VERSION_RETIRED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR';
  actorId: string;
  targetType: 'COMMUNICATION_TEMPLATE_DEFINITION' | 'COMMUNICATION_TEMPLATE_VERSION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type CommunicationTemplateMutationResult =
  | { outcome: 'UPDATED'; definition: CommunicationTemplateDefinitionProps }
  | { outcome: 'STALE' }
  | { outcome: 'NOT_DRAFT' }
  | { outcome: 'ACTIVATION_CONFLICT' };

export interface CommunicationTemplateAdminRepository {
  listDefinitions(input: { page: number; pageSize: number }): Promise<{ items: CommunicationTemplateDefinitionProps[]; totalItems: number }>;
  getDefinition(definitionId: string): Promise<CommunicationTemplateDefinitionProps | null>;
  findDefinitionByKey(key: string): Promise<CommunicationTemplateDefinitionProps | null>;
  listVersions(definitionId: string): Promise<CommunicationTemplateVersionProps[]>;
  getVersion(versionId: string): Promise<CommunicationTemplateVersionProps | null>;
  createDefinition(input: {
    definition: CommunicationTemplateDefinitionProps;
    version: CommunicationTemplateVersionProps;
    audit: CommunicationTemplateAuditRecord;
  }): Promise<void>;
  createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: CommunicationTemplateVersionProps;
    audit: CommunicationTemplateAuditRecord;
  }): Promise<CommunicationTemplateMutationResult>;
  activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: CommunicationTemplateAuditRecord;
  }): Promise<CommunicationTemplateMutationResult>;
  updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: CommunicationTemplateAuditRecord | null;
  }): Promise<CommunicationTemplateMutationResult>;
}

export interface CommunicationTemplateAdminDependencies {
  repository: CommunicationTemplateAdminRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const VARIABLE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const VARIABLE_TYPES = new Set(['STRING', 'NUMBER', 'BOOLEAN']);
const CHANNELS = new Set<CommunicationChannel>(['EMAIL', 'WHATSAPP']);

function requireAdmin(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new CommunicationTemplateAdminError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('communications.admin')) {
    throw new CommunicationTemplateAdminError('FORBIDDEN', 'The caller is not authorized to administer communication templates.');
  }
  return actor;
}

function boundedText(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new CommunicationTemplateAdminError('VALIDATION_ERROR', `${name} is required and must be at most ${max} characters.`);
  }
  return normalized;
}

function expectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'expectedDefinitionVersion must be a positive integer.');
  }
  return value;
}

function templateKey(value: string): string {
  const normalized = boundedText('key', value, 80);
  if (!KEY_PATTERN.test(normalized)) throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'key contains unsupported characters.');
  return normalized;
}

function normalizeVariableSchema(input: Readonly<Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'>>): Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'variableSchema must be an object.');
  }
  const entries = Object.entries(input);
  if (entries.length > 30) throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'variableSchema supports at most 30 variables.');
  const result: Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'> = {};
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!VARIABLE_KEY_PATTERN.test(key) || !VARIABLE_TYPES.has(value)) {
      throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'variableSchema contains an unsupported variable name or type.');
    }
    result[key] = value;
  }
  return result;
}

function normalizeContent(input: {
  channel: CommunicationChannel;
  subject?: string | null;
  body: string;
  variableSchema: Readonly<Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'>>;
}) {
  if (!CHANNELS.has(input.channel)) throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'Unsupported communication channel.');
  const body = boundedText('body', input.body, 8000);
  const subject = input.subject == null || input.subject.trim() === '' ? null : boundedText('subject', input.subject, 240);
  if (input.channel === 'EMAIL' && !subject) {
    throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'EMAIL templates require a subject.');
  }
  return { subject, body, variableSchema: normalizeVariableSchema(input.variableSchema) };
}

function projection(definition: CommunicationTemplateDefinitionProps, versions: readonly CommunicationTemplateVersionProps[]) {
  return {
    definitionId: definition.id,
    key: definition.key,
    channel: definition.channel,
    enabled: definition.enabled,
    activeVersionId: definition.activeVersionId,
    version: definition.version,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    versions: [...versions]
      .sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id))
      .map((version) => ({
        versionId: version.id,
        versionNumber: version.versionNumber,
        status: version.status,
        subject: version.subject,
        body: version.body,
        variableSchema: { ...version.variableSchema },
        sourceClassification: version.sourceClassification,
        createdByType: version.createdByType,
        createdById: version.createdById,
        createdAt: version.createdAt.toISOString(),
        activatedAt: version.activatedAt?.toISOString() ?? null,
        retiredAt: version.retiredAt?.toISOString() ?? null,
      })),
  };
}

function actorType(actor: ActorContext): CommunicationActorType {
  return actorTypeForStaffRole(actor.role);
}

export class CommunicationTemplateAdminApplication {
  constructor(private readonly deps: CommunicationTemplateAdminDependencies) {}

  async listCommunicationTemplates(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requireAdmin(actor);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'Invalid communication template pagination parameters.');
    }
    const result = await this.deps.repository.listDefinitions({ page, pageSize });
    const items = await Promise.all(result.items.map(async (definition) => projection(definition, await this.deps.repository.listVersions(definition.id))));
    return { items, page, pageSize, totalItems: result.totalItems, totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)) };
  }

  async getCommunicationTemplate(definitionId: string, actor?: ActorContext) {
    requireAdmin(actor);
    const definition = await this.deps.repository.getDefinition(definitionId);
    if (!definition) throw new CommunicationTemplateAdminError('RESOURCE_NOT_FOUND', 'The communication template definition could not be found.');
    return projection(definition, await this.deps.repository.listVersions(definition.id));
  }

  async createCommunicationTemplate(input: {
    key: string;
    channel: CommunicationChannel;
    subject?: string | null;
    body: string;
    variableSchema: Readonly<Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'>>;
    sourceClassification: string;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    const key = templateKey(input.key);
    if (!CHANNELS.has(input.channel)) throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'Unsupported communication channel.');
    if (await this.deps.repository.findDefinitionByKey(key)) throw new CommunicationTemplateAdminError('VALIDATION_ERROR', 'Communication template key must be unique.');
    const content = normalizeContent(input);
    const at = this.deps.clock.now();
    const definitionId = this.deps.ids.uuid();
    const versionId = this.deps.ids.uuid();
    const definition: CommunicationTemplateDefinitionProps = {
      id: definitionId, key, channel: input.channel, enabled: false, activeVersionId: null, version: 1, createdAt: at, updatedAt: at,
    };
    const version: CommunicationTemplateVersionProps = {
      id: versionId, definitionId, versionNumber: 1, ...content, status: 'DRAFT',
      sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdByType: actorType(authenticated), createdById: authenticated.operatorId,
      createdAt: at, activatedAt: null, retiredAt: null,
    };
    await this.deps.repository.createDefinition({
      definition,
      version,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'COMM_TEMPLATE_VERSION_CREATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'COMMUNICATION_TEMPLATE_VERSION', targetId: versionId, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { definitionId, templateKey: key, channel: input.channel, versionNumber: 1 },
      },
    });
    return projection(definition, [version]);
  }

  async createCommunicationTemplateVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    subject?: string | null;
    body: string;
    variableSchema: Readonly<Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'>>;
    sourceClassification: string;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new CommunicationTemplateAdminError('RESOURCE_NOT_FOUND', 'The communication template definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new CommunicationTemplateAdminError('RESOURCE_VERSION_CONFLICT', 'The communication template definition changed before the new version could be created.');
    const versions = await this.deps.repository.listVersions(definition.id);
    const at = this.deps.clock.now();
    const version: CommunicationTemplateVersionProps = {
      id: this.deps.ids.uuid(), definitionId: definition.id,
      versionNumber: Math.max(0, ...versions.map((item) => item.versionNumber)) + 1,
      ...normalizeContent({ channel: definition.channel, subject: input.subject, body: input.body, variableSchema: input.variableSchema }),
      status: 'DRAFT', sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdByType: actorType(authenticated), createdById: authenticated.operatorId,
      createdAt: at, activatedAt: null, retiredAt: null,
    };
    const result = await this.deps.repository.createVersion({
      definitionId: definition.id,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      definitionUpdatedAt: at,
      version,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'COMM_TEMPLATE_VERSION_CREATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'COMMUNICATION_TEMPLATE_VERSION', targetId: version.id, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { definitionId: definition.id, templateKey: definition.key, versionNumber: version.versionNumber },
      },
    });
    if (result.outcome === 'STALE') throw new CommunicationTemplateAdminError('RESOURCE_VERSION_CONFLICT', 'The communication template definition changed before the new version could be created.');
    if (result.outcome !== 'UPDATED') throw new CommunicationTemplateAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The communication template version could not be created in the current configuration state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async activateCommunicationTemplateVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new CommunicationTemplateAdminError('RESOURCE_NOT_FOUND', 'The communication template definition could not be found.');
    const version = await this.deps.repository.getVersion(input.versionId);
    if (!version || version.definitionId !== definition.id) throw new CommunicationTemplateAdminError('RESOURCE_NOT_FOUND', 'The communication template version could not be found.');
    if (version.status !== 'DRAFT') throw new CommunicationTemplateAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'Only a DRAFT communication template version can be activated.');
    const at = this.deps.clock.now();
    const result = await this.deps.repository.activateVersion({
      definitionId: definition.id,
      versionId: version.id,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      at,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'COMM_TEMPLATE_VERSION_ACTIVATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'COMMUNICATION_TEMPLATE_VERSION', targetId: version.id, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { definitionId: definition.id, templateKey: definition.key, versionNumber: version.versionNumber },
      },
    });
    if (result.outcome === 'STALE') throw new CommunicationTemplateAdminError('RESOURCE_VERSION_CONFLICT', 'The communication template definition changed before activation.');
    if (result.outcome !== 'UPDATED') throw new CommunicationTemplateAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The communication template version cannot be activated in the current state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async updateCommunicationTemplateState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new CommunicationTemplateAdminError('RESOURCE_NOT_FOUND', 'The communication template definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new CommunicationTemplateAdminError('RESOURCE_VERSION_CONFLICT', 'The communication template definition changed before its state could be updated.');
    if (definition.enabled === input.enabled) return projection(definition, await this.deps.repository.listVersions(definition.id));
    if (input.enabled && !definition.activeVersionId) throw new CommunicationTemplateAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'A communication template requires an active version before it can be enabled.');
    const at = this.deps.clock.now();
    const retirementAudit = !input.enabled && definition.activeVersionId ? {
      id: this.deps.ids.uuid(), eventCode: 'COMM_TEMPLATE_VERSION_RETIRED' as const, occurredAt: at,
      actorType: 'ADMINISTRATOR' as const, actorId: authenticated.operatorId,
      targetType: 'COMMUNICATION_TEMPLATE_VERSION' as const, targetId: definition.activeVersionId,
      outcome: 'SUCCESS' as const, requestId: context.requestId ?? null,
      metadata: { definitionId: definition.id, templateKey: definition.key },
    } : null;
    const result = await this.deps.repository.updateState({
      definitionId: definition.id, enabled: input.enabled, expectedDefinitionVersion: input.expectedDefinitionVersion, at, retirementAudit,
    });
    if (result.outcome === 'STALE') throw new CommunicationTemplateAdminError('RESOURCE_VERSION_CONFLICT', 'The communication template definition changed before its state could be updated.');
    if (result.outcome !== 'UPDATED') throw new CommunicationTemplateAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The communication template state cannot be updated in the current configuration state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }
}
