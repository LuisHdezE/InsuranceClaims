import type {
  InsurerGuidanceDefinitionProps,
  InsurerGuidanceVersionProps,
} from '@insurance/domain/guidance';
import type { ActorContext, ClockPort, IdGeneratorPort, RequestContext } from './index.js';

export type GuidanceAdminErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'CONFIGURATION_VERSION_IMMUTABLE'
  | 'CONFIGURATION_ACTIVATION_CONFLICT'
  | 'VALIDATION_ERROR';

export class GuidanceAdminError extends Error {
  constructor(readonly code: GuidanceAdminErrorCode, message: string) {
    super(message);
    this.name = 'GuidanceAdminError';
  }
}

export interface GuidanceAuditRecord {
  id: string;
  eventCode:
    | 'INSURER_GUIDANCE_VERSION_CREATED'
    | 'INSURER_GUIDANCE_VERSION_ACTIVATED'
    | 'INSURER_GUIDANCE_VERSION_RETIRED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR';
  actorId: string;
  targetType: 'INSURER_GUIDANCE_DEFINITION' | 'INSURER_GUIDANCE_VERSION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type GuidanceMutationResult =
  | { outcome: 'UPDATED'; definition: InsurerGuidanceDefinitionProps }
  | { outcome: 'STALE' }
  | { outcome: 'NOT_DRAFT' }
  | { outcome: 'ACTIVATION_CONFLICT' };

export interface GuidanceAdminRepository {
  listDefinitions(input: { page: number; pageSize: number }): Promise<{ items: InsurerGuidanceDefinitionProps[]; totalItems: number }>;
  getDefinition(definitionId: string): Promise<InsurerGuidanceDefinitionProps | null>;
  findDefinitionByKey(key: string): Promise<InsurerGuidanceDefinitionProps | null>;
  listVersions(definitionId: string): Promise<InsurerGuidanceVersionProps[]>;
  getVersion(versionId: string): Promise<InsurerGuidanceVersionProps | null>;
  createDefinition(input: {
    definition: InsurerGuidanceDefinitionProps;
    version: InsurerGuidanceVersionProps;
    audit: GuidanceAuditRecord;
  }): Promise<void>;
  createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: InsurerGuidanceVersionProps;
    audit: GuidanceAuditRecord;
  }): Promise<GuidanceMutationResult>;
  activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: GuidanceAuditRecord;
  }): Promise<GuidanceMutationResult>;
  updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: GuidanceAuditRecord | null;
  }): Promise<GuidanceMutationResult>;
}

export interface GuidanceAdminDependencies {
  repository: GuidanceAdminRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const METADATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

function requireAdmin(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new GuidanceAdminError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('guidance.admin')) {
    throw new GuidanceAdminError('FORBIDDEN', 'The caller is not authorized to administer insurer guidance.');
  }
  return actor;
}

function boundedText(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new GuidanceAdminError('VALIDATION_ERROR', `${name} is required and must be at most ${max} characters.`);
  }
  return normalized;
}

function guidanceKey(value: string): string {
  const normalized = boundedText('key', value, 80);
  if (!KEY_PATTERN.test(normalized)) throw new GuidanceAdminError('VALIDATION_ERROR', 'key contains unsupported characters.');
  return normalized;
}

function expectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new GuidanceAdminError('VALIDATION_ERROR', 'expectedDefinitionVersion must be a positive integer.');
  }
  return value;
}

function boundedStringList(name: string, values: readonly string[], maxItems: number, maxItemLength: number): string[] {
  if (!Array.isArray(values) || values.length > maxItems) {
    throw new GuidanceAdminError('VALIDATION_ERROR', `${name} must contain at most ${maxItems} items.`);
  }
  return values.map((value, index) => boundedText(`${name}[${index}]`, value, maxItemLength));
}

function boundedMetadata(input: Readonly<Record<string, string>>): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GuidanceAdminError('VALIDATION_ERROR', 'assistanceMetadata must be an object.');
  }
  const entries = Object.entries(input);
  if (entries.length > 20) throw new GuidanceAdminError('VALIDATION_ERROR', 'assistanceMetadata supports at most 20 entries.');
  const result: Record<string, string> = {};
  for (const [key, value] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!METADATA_KEY_PATTERN.test(key)) {
      throw new GuidanceAdminError('VALIDATION_ERROR', 'assistanceMetadata contains an unsupported key.');
    }
    result[key] = boundedText(`assistanceMetadata.${key}`, value, 500);
  }
  return result;
}

function normalizeContent(input: {
  insurerContextReference: string;
  guidanceCategory: string;
  documentCategories: readonly string[];
  instructions: readonly string[];
  assistanceMetadata: Readonly<Record<string, string>>;
}) {
  return {
    insurerContextReference: boundedText('insurerContextReference', input.insurerContextReference, 80),
    guidanceCategory: boundedText('guidanceCategory', input.guidanceCategory, 80),
    documentCategories: boundedStringList('documentCategories', input.documentCategories, 20, 80),
    instructions: boundedStringList('instructions', input.instructions, 20, 1000),
    assistanceMetadata: boundedMetadata(input.assistanceMetadata),
  };
}

function projection(definition: InsurerGuidanceDefinitionProps, versions: readonly InsurerGuidanceVersionProps[]) {
  return {
    definitionId: definition.id,
    key: definition.key,
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
        insurerContextReference: version.insurerContextReference,
        guidanceCategory: version.guidanceCategory,
        documentCategories: [...version.documentCategories],
        instructions: [...version.instructions],
        assistanceMetadata: { ...version.assistanceMetadata },
        status: version.status,
        sourceClassification: version.sourceClassification,
        createdByType: version.createdByType,
        createdById: version.createdById,
        createdAt: version.createdAt.toISOString(),
        activatedAt: version.activatedAt?.toISOString() ?? null,
        retiredAt: version.retiredAt?.toISOString() ?? null,
      })),
  };
}

function auditMetadata(definition: InsurerGuidanceDefinitionProps, version: InsurerGuidanceVersionProps) {
  return {
    definitionId: definition.id,
    guidanceKey: definition.key,
    versionNumber: version.versionNumber,
    insurerContextReference: version.insurerContextReference,
    guidanceCategory: version.guidanceCategory,
    sourceClassification: version.sourceClassification,
  };
}

export class GuidanceAdminApplication {
  constructor(private readonly deps: GuidanceAdminDependencies) {}

  async listGuidances(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requireAdmin(actor);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new GuidanceAdminError('VALIDATION_ERROR', 'Invalid insurer guidance pagination parameters.');
    }
    const result = await this.deps.repository.listDefinitions({ page, pageSize });
    const items = await Promise.all(result.items.map(async (definition) => projection(definition, await this.deps.repository.listVersions(definition.id))));
    return { items, page, pageSize, totalItems: result.totalItems, totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)) };
  }

  async getGuidance(definitionId: string, actor?: ActorContext) {
    requireAdmin(actor);
    const definition = await this.deps.repository.getDefinition(definitionId);
    if (!definition) throw new GuidanceAdminError('RESOURCE_NOT_FOUND', 'The insurer guidance definition could not be found.');
    return projection(definition, await this.deps.repository.listVersions(definition.id));
  }

  async createGuidance(input: {
    key: string;
    insurerContextReference: string;
    guidanceCategory: string;
    documentCategories: readonly string[];
    instructions: readonly string[];
    assistanceMetadata: Readonly<Record<string, string>>;
    sourceClassification: string;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    const key = guidanceKey(input.key);
    if (await this.deps.repository.findDefinitionByKey(key)) {
      throw new GuidanceAdminError('VALIDATION_ERROR', 'Insurer guidance key must be unique.');
    }
    const content = normalizeContent(input);
    const sourceClassification = boundedText('sourceClassification', input.sourceClassification, 80);
    const at = this.deps.clock.now();
    const definition: InsurerGuidanceDefinitionProps = {
      id: this.deps.ids.uuid(), key, enabled: false, activeVersionId: null, version: 1, createdAt: at, updatedAt: at,
    };
    const version: InsurerGuidanceVersionProps = {
      id: this.deps.ids.uuid(), definitionId: definition.id, versionNumber: 1, ...content,
      status: 'DRAFT', sourceClassification, createdByType: 'ADMINISTRATOR', createdById: authenticated.operatorId,
      createdAt: at, activatedAt: null, retiredAt: null,
    };
    await this.deps.repository.createDefinition({
      definition,
      version,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'INSURER_GUIDANCE_VERSION_CREATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'INSURER_GUIDANCE_VERSION', targetId: version.id, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: auditMetadata(definition, version),
      },
    });
    return projection(definition, [version]);
  }

  async createGuidanceVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    insurerContextReference: string;
    guidanceCategory: string;
    documentCategories: readonly string[];
    instructions: readonly string[];
    assistanceMetadata: Readonly<Record<string, string>>;
    sourceClassification: string;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new GuidanceAdminError('RESOURCE_NOT_FOUND', 'The insurer guidance definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) {
      throw new GuidanceAdminError('RESOURCE_VERSION_CONFLICT', 'The insurer guidance definition changed before the new version could be created.');
    }
    const versions = await this.deps.repository.listVersions(definition.id);
    const at = this.deps.clock.now();
    const version: InsurerGuidanceVersionProps = {
      id: this.deps.ids.uuid(), definitionId: definition.id,
      versionNumber: Math.max(0, ...versions.map((item) => item.versionNumber)) + 1,
      ...normalizeContent(input), status: 'DRAFT',
      sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdByType: 'ADMINISTRATOR', createdById: authenticated.operatorId,
      createdAt: at, activatedAt: null, retiredAt: null,
    };
    const result = await this.deps.repository.createVersion({
      definitionId: definition.id,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      definitionUpdatedAt: at,
      version,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'INSURER_GUIDANCE_VERSION_CREATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'INSURER_GUIDANCE_VERSION', targetId: version.id, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: auditMetadata(definition, version),
      },
    });
    if (result.outcome === 'STALE') throw new GuidanceAdminError('RESOURCE_VERSION_CONFLICT', 'The insurer guidance definition changed before the new version could be created.');
    if (result.outcome !== 'UPDATED') throw new GuidanceAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The insurer guidance version could not be created in the current configuration state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async activateGuidanceVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new GuidanceAdminError('RESOURCE_NOT_FOUND', 'The insurer guidance definition could not be found.');
    const version = await this.deps.repository.getVersion(input.versionId);
    if (!version || version.definitionId !== definition.id) throw new GuidanceAdminError('RESOURCE_NOT_FOUND', 'The insurer guidance version could not be found.');
    if (version.status !== 'DRAFT') throw new GuidanceAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'Only a DRAFT insurer guidance version can be activated.');
    const at = this.deps.clock.now();
    const result = await this.deps.repository.activateVersion({
      definitionId: definition.id,
      versionId: version.id,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      at,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'INSURER_GUIDANCE_VERSION_ACTIVATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'INSURER_GUIDANCE_VERSION', targetId: version.id, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: auditMetadata(definition, version),
      },
    });
    if (result.outcome === 'STALE') throw new GuidanceAdminError('RESOURCE_VERSION_CONFLICT', 'The insurer guidance definition changed before activation.');
    if (result.outcome !== 'UPDATED') throw new GuidanceAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The insurer guidance version cannot be activated in the current state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async updateGuidanceState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new GuidanceAdminError('RESOURCE_NOT_FOUND', 'The insurer guidance definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) {
      throw new GuidanceAdminError('RESOURCE_VERSION_CONFLICT', 'The insurer guidance definition changed before its state could be updated.');
    }
    if (definition.enabled === input.enabled) return projection(definition, await this.deps.repository.listVersions(definition.id));
    if (input.enabled && !definition.activeVersionId) {
      throw new GuidanceAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'Insurer guidance requires an active version before it can be enabled.');
    }
    const activeVersion = definition.activeVersionId ? await this.deps.repository.getVersion(definition.activeVersionId) : null;
    const at = this.deps.clock.now();
    const retirementAudit = !input.enabled && activeVersion ? {
      id: this.deps.ids.uuid(), eventCode: 'INSURER_GUIDANCE_VERSION_RETIRED' as const, occurredAt: at,
      actorType: 'ADMINISTRATOR' as const, actorId: authenticated.operatorId,
      targetType: 'INSURER_GUIDANCE_VERSION' as const, targetId: activeVersion.id,
      outcome: 'SUCCESS' as const, requestId: context.requestId ?? null,
      metadata: auditMetadata(definition, activeVersion),
    } : null;
    const result = await this.deps.repository.updateState({
      definitionId: definition.id, enabled: input.enabled, expectedDefinitionVersion: input.expectedDefinitionVersion, at, retirementAudit,
    });
    if (result.outcome === 'STALE') throw new GuidanceAdminError('RESOURCE_VERSION_CONFLICT', 'The insurer guidance definition changed before its state could be updated.');
    if (result.outcome !== 'UPDATED') throw new GuidanceAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The insurer guidance state cannot be updated in the current configuration state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }
}
