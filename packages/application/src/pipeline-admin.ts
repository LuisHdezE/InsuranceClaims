import type {
  PipelineActorType,
  PipelineConsumerType,
  PipelineVersionStatus,
} from '@insurance/domain';
import {
  actorTypeForStaffRole,
  type ActorContext,
  type ClockPort,
  type IdGeneratorPort,
  type RequestContext,
} from './index.js';
import type { PipelineDefinitionRecord } from './claim-pipeline.js';

export type PipelineAdminErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'CONFIGURATION_VERSION_IMMUTABLE'
  | 'CONFIGURATION_ACTIVATION_CONFLICT'
  | 'VALIDATION_ERROR';

export class PipelineAdminApplicationError extends Error {
  constructor(readonly code: PipelineAdminErrorCode, message: string) {
    super(message);
    this.name = 'PipelineAdminApplicationError';
  }
}

export interface PipelineStageContent {
  stageKey: string;
  displayName: string;
  sortOrder: number;
  reportingFlags: Readonly<Record<string, boolean>>;
  allowedNextStageKeys: readonly string[];
}

export interface PipelineAdminVersionRecord {
  id: string;
  definitionId: string;
  versionNumber: number;
  status: PipelineVersionStatus;
  createdByType: PipelineActorType;
  createdById: string | null;
  sourceClassification: string;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
  stages: readonly PipelineStageContent[];
}

export interface PipelineAdminAuditRecord {
  id: string;
  eventCode: 'PIPELINE_VERSION_CREATED' | 'PIPELINE_VERSION_ACTIVATED' | 'PIPELINE_VERSION_RETIRED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR';
  actorId: string;
  targetType: 'PIPELINE_DEFINITION' | 'PIPELINE_VERSION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type PipelineAdminMutationResult =
  | { outcome: 'UPDATED'; definition: PipelineDefinitionRecord }
  | { outcome: 'STALE' }
  | { outcome: 'NOT_DRAFT' }
  | { outcome: 'ACTIVATION_CONFLICT' };

export interface PipelineAdminRepository {
  listDefinitions(input: { page: number; pageSize: number }): Promise<{ items: PipelineDefinitionRecord[]; totalItems: number }>;
  getDefinition(definitionId: string): Promise<PipelineDefinitionRecord | null>;
  findDefinitionByKey(key: string): Promise<PipelineDefinitionRecord | null>;
  listVersions(definitionId: string): Promise<PipelineAdminVersionRecord[]>;
  getVersion(versionId: string): Promise<PipelineAdminVersionRecord | null>;
  createDefinition(input: {
    definition: PipelineDefinitionRecord;
    version: PipelineAdminVersionRecord;
    audit: PipelineAdminAuditRecord;
  }): Promise<void>;
  createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: PipelineAdminVersionRecord;
    audit: PipelineAdminAuditRecord;
  }): Promise<PipelineAdminMutationResult>;
  activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: PipelineAdminAuditRecord;
  }): Promise<PipelineAdminMutationResult>;
  updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: PipelineAdminAuditRecord | null;
  }): Promise<PipelineAdminMutationResult>;
}

export interface PipelineAdminDependencies {
  repository: PipelineAdminRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const STAGE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const REPORTING_FLAG_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,39}$/;

function requireAdmin(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new PipelineAdminApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('pipelines.admin')) {
    throw new PipelineAdminApplicationError('FORBIDDEN', 'The caller is not authorized to administer pipelines.');
  }
  return actor;
}

function requireExpectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'expectedDefinitionVersion must be a positive integer.');
  }
  return value;
}

function boundedText(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new PipelineAdminApplicationError('VALIDATION_ERROR', `${name} is required and must be at most ${max} characters.`);
  }
  return normalized;
}

function validateKey(name: string, value: string, pattern: RegExp): string {
  const normalized = boundedText(name, value, 80);
  if (!pattern.test(normalized)) {
    throw new PipelineAdminApplicationError('VALIDATION_ERROR', `${name} contains unsupported characters.`);
  }
  return normalized;
}

function normalizeStages(stages: readonly PipelineStageContent[]): PipelineStageContent[] {
  if (!Array.isArray(stages) || stages.length < 1 || stages.length > 50) {
    throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'A pipeline version must contain between 1 and 50 stages.');
  }

  const normalized = stages.map((stage) => {
    const stageKey = validateKey('stageKey', stage.stageKey, STAGE_KEY_PATTERN);
    const displayName = boundedText('stage.displayName', stage.displayName, 160);
    if (!Number.isInteger(stage.sortOrder) || stage.sortOrder < 1 || stage.sortOrder > 1000) {
      throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'stage.sortOrder must be an integer between 1 and 1000.');
    }

    const reportingFlags = stage.reportingFlags ?? {};
    const entries = Object.entries(reportingFlags);
    if (entries.length > 20 || entries.some(([key, value]) => !REPORTING_FLAG_PATTERN.test(key) || typeof value !== 'boolean')) {
      throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'reportingFlags must be a bounded boolean flag object.');
    }

    const allowedNextStageKeys = [...(stage.allowedNextStageKeys ?? [])].map((key) => validateKey('allowedNextStageKey', key, STAGE_KEY_PATTERN));
    if (new Set(allowedNextStageKeys).size !== allowedNextStageKeys.length) {
      throw new PipelineAdminApplicationError('VALIDATION_ERROR', `Stage ${stageKey} contains duplicate allowed transitions.`);
    }

    return {
      stageKey,
      displayName,
      sortOrder: stage.sortOrder,
      reportingFlags: Object.fromEntries(entries),
      allowedNextStageKeys,
    };
  });

  const keys = normalized.map((stage) => stage.stageKey);
  const sortOrders = normalized.map((stage) => stage.sortOrder);
  if (new Set(keys).size !== keys.length) {
    throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'Stage keys must be unique inside one pipeline version.');
  }
  if (new Set(sortOrders).size !== sortOrders.length) {
    throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'Stage sortOrder values must be unique inside one pipeline version.');
  }
  const knownKeys = new Set(keys);
  for (const stage of normalized) {
    for (const next of stage.allowedNextStageKeys) {
      if (!knownKeys.has(next)) {
        throw new PipelineAdminApplicationError('VALIDATION_ERROR', `Stage ${stage.stageKey} references unknown transition target ${next}.`);
      }
    }
  }

  return normalized.sort((a, b) => a.sortOrder - b.sortOrder || a.stageKey.localeCompare(b.stageKey));
}

function definitionProjection(definition: PipelineDefinitionRecord, versions: readonly PipelineAdminVersionRecord[]) {
  return {
    definitionId: definition.id,
    key: definition.key,
    consumerType: definition.consumerType,
    displayName: definition.displayName,
    enabled: definition.enabled,
    activeVersionId: definition.activeVersionId,
    version: definition.version,
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    versions: versions.map((version) => ({
      versionId: version.id,
      versionNumber: version.versionNumber,
      status: version.status,
      sourceClassification: version.sourceClassification,
      createdByType: version.createdByType,
      createdById: version.createdById,
      createdAt: version.createdAt.toISOString(),
      activatedAt: version.activatedAt?.toISOString() ?? null,
      retiredAt: version.retiredAt?.toISOString() ?? null,
      stages: [...version.stages]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.stageKey.localeCompare(b.stageKey))
        .map((stage) => ({
          stageKey: stage.stageKey,
          displayName: stage.displayName,
          sortOrder: stage.sortOrder,
          reportingFlags: { ...stage.reportingFlags },
          allowedNextStageKeys: [...stage.allowedNextStageKeys],
        })),
    })),
  };
}

export class PipelineAdminApplication {
  constructor(private readonly deps: PipelineAdminDependencies) {}

  async listPipelines(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requireAdmin(actor);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'Invalid pipeline pagination parameters.');
    }
    const result = await this.deps.repository.listDefinitions({ page, pageSize });
    const items = await Promise.all(result.items.map(async (definition) => definitionProjection(
      definition,
      await this.deps.repository.listVersions(definition.id),
    )));
    return {
      items,
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async getPipeline(definitionId: string, actor?: ActorContext) {
    requireAdmin(actor);
    const definition = await this.deps.repository.getDefinition(definitionId);
    if (!definition) throw new PipelineAdminApplicationError('RESOURCE_NOT_FOUND', 'The pipeline definition could not be found.');
    return definitionProjection(definition, await this.deps.repository.listVersions(definition.id));
  }

  async createPipeline(input: {
    key: string;
    consumerType: PipelineConsumerType;
    displayName: string;
    sourceClassification: string;
    stages: readonly PipelineStageContent[];
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    const key = validateKey('key', input.key, KEY_PATTERN);
    const displayName = boundedText('displayName', input.displayName, 160);
    const sourceClassification = boundedText('sourceClassification', input.sourceClassification, 80);
    if (!['CLAIM', 'RENEWAL', 'COLLECTION'].includes(input.consumerType)) {
      throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'consumerType is not supported by R3.');
    }
    if (await this.deps.repository.findDefinitionByKey(key)) {
      throw new PipelineAdminApplicationError('VALIDATION_ERROR', 'Pipeline key must be unique.');
    }
    const stages = normalizeStages(input.stages);
    const at = this.deps.clock.now();
    const definitionId = this.deps.ids.uuid();
    const versionId = this.deps.ids.uuid();
    const definition: PipelineDefinitionRecord = {
      id: definitionId,
      key,
      consumerType: input.consumerType,
      displayName,
      enabled: false,
      activeVersionId: null,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    const version: PipelineAdminVersionRecord = {
      id: versionId,
      definitionId,
      versionNumber: 1,
      status: 'DRAFT',
      createdByType: actorTypeForStaffRole(authenticated.role),
      createdById: authenticated.operatorId,
      sourceClassification,
      createdAt: at,
      activatedAt: null,
      retiredAt: null,
      stages,
    };
    await this.deps.repository.createDefinition({
      definition,
      version,
      audit: {
        id: this.deps.ids.uuid(),
        eventCode: 'PIPELINE_VERSION_CREATED',
        occurredAt: at,
        actorType: 'ADMINISTRATOR',
        actorId: authenticated.operatorId,
        targetType: 'PIPELINE_VERSION',
        targetId: versionId,
        outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { definitionId, pipelineKey: key, consumerType: input.consumerType, versionNumber: 1 },
      },
    });
    return definitionProjection(definition, [version]);
  }

  async createPipelineVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    sourceClassification: string;
    stages: readonly PipelineStageContent[];
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    requireExpectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new PipelineAdminApplicationError('RESOURCE_NOT_FOUND', 'The pipeline definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) {
      throw new PipelineAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The pipeline definition changed before the new version could be created.');
    }
    const versions = await this.deps.repository.listVersions(definition.id);
    const nextVersionNumber = Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
    const at = this.deps.clock.now();
    const version: PipelineAdminVersionRecord = {
      id: this.deps.ids.uuid(),
      definitionId: definition.id,
      versionNumber: nextVersionNumber,
      status: 'DRAFT',
      createdByType: actorTypeForStaffRole(authenticated.role),
      createdById: authenticated.operatorId,
      sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdAt: at,
      activatedAt: null,
      retiredAt: null,
      stages: normalizeStages(input.stages),
    };
    const result = await this.deps.repository.createVersion({
      definitionId: definition.id,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      definitionUpdatedAt: at,
      version,
      audit: {
        id: this.deps.ids.uuid(),
        eventCode: 'PIPELINE_VERSION_CREATED',
        occurredAt: at,
        actorType: 'ADMINISTRATOR',
        actorId: authenticated.operatorId,
        targetType: 'PIPELINE_VERSION',
        targetId: version.id,
        outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { definitionId: definition.id, pipelineKey: definition.key, versionNumber: nextVersionNumber },
      },
    });
    if (result.outcome === 'STALE') {
      throw new PipelineAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The pipeline definition changed before the new version could be created.');
    }
    if (result.outcome !== 'UPDATED') {
      throw new PipelineAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The pipeline version could not be created in the current configuration state.');
    }
    return definitionProjection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async activatePipelineVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    requireExpectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new PipelineAdminApplicationError('RESOURCE_NOT_FOUND', 'The pipeline definition could not be found.');
    const version = await this.deps.repository.getVersion(input.versionId);
    if (!version || version.definitionId !== definition.id) {
      throw new PipelineAdminApplicationError('RESOURCE_NOT_FOUND', 'The pipeline version could not be found.');
    }
    if (version.status !== 'DRAFT') {
      throw new PipelineAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'Only an eligible DRAFT pipeline version can be activated.');
    }
    const at = this.deps.clock.now();
    const result = await this.deps.repository.activateVersion({
      definitionId: definition.id,
      versionId: version.id,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      at,
      audit: {
        id: this.deps.ids.uuid(),
        eventCode: 'PIPELINE_VERSION_ACTIVATED',
        occurredAt: at,
        actorType: 'ADMINISTRATOR',
        actorId: authenticated.operatorId,
        targetType: 'PIPELINE_VERSION',
        targetId: version.id,
        outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { definitionId: definition.id, pipelineKey: definition.key, versionNumber: version.versionNumber },
      },
    });
    if (result.outcome === 'STALE') {
      throw new PipelineAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The pipeline definition changed before activation.');
    }
    if (result.outcome === 'NOT_DRAFT' || result.outcome === 'ACTIVATION_CONFLICT') {
      throw new PipelineAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The pipeline version is no longer eligible for activation.');
    }
    return definitionProjection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async updatePipelineState(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    enabled: boolean;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    requireExpectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new PipelineAdminApplicationError('RESOURCE_NOT_FOUND', 'The pipeline definition could not be found.');
    const at = this.deps.clock.now();
    const retirementAudit = definition.activeVersionId && input.enabled === false ? {
      id: this.deps.ids.uuid(),
      eventCode: 'PIPELINE_VERSION_RETIRED' as const,
      occurredAt: at,
      actorType: 'ADMINISTRATOR' as const,
      actorId: authenticated.operatorId,
      targetType: 'PIPELINE_VERSION' as const,
      targetId: definition.activeVersionId,
      outcome: 'SUCCESS' as const,
      requestId: context.requestId ?? null,
      metadata: { definitionId: definition.id, pipelineKey: definition.key, reason: 'DEFINITION_DISABLED' },
    } : null;
    const result = await this.deps.repository.updateState({
      definitionId: definition.id,
      enabled: input.enabled,
      expectedDefinitionVersion: input.expectedDefinitionVersion,
      at,
      retirementAudit,
    });
    if (result.outcome === 'STALE') {
      throw new PipelineAdminApplicationError('RESOURCE_VERSION_CONFLICT', 'The pipeline definition changed before its state could be updated.');
    }
    if (result.outcome === 'ACTIVATION_CONFLICT' || result.outcome === 'NOT_DRAFT') {
      throw new PipelineAdminApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The pipeline definition cannot be enabled without an eligible active version or conflicts with another enabled pipeline.');
    }
    return definitionProjection(result.definition, await this.deps.repository.listVersions(definition.id));
  }
}
