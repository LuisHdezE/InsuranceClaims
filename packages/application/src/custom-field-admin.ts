import type {
  CustomFieldDefinitionProps,
  CustomFieldSensitivityClassification,
  CustomFieldTargetType,
  CustomFieldValidationScalar,
  CustomFieldValueType,
  CustomFieldVersionProps,
} from '@insurance/domain/custom-field';
import {
  CUSTOM_FIELD_SENSITIVITY_CLASSIFICATIONS,
  CUSTOM_FIELD_TARGET_TYPES,
  CUSTOM_FIELD_VALUE_TYPES,
} from '@insurance/domain/custom-field';
import type { ActorContext, ClockPort, IdGeneratorPort, RequestContext } from './index.js';

export type CustomFieldAdminErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'CONFIGURATION_VERSION_IMMUTABLE'
  | 'CONFIGURATION_ACTIVATION_CONFLICT'
  | 'CUSTOM_FIELD_DEFINITION_INVALID'
  | 'VALIDATION_ERROR';

export class CustomFieldAdminError extends Error {
  constructor(readonly code: CustomFieldAdminErrorCode, message: string) {
    super(message);
    this.name = 'CustomFieldAdminError';
  }
}

export interface CustomFieldAuditRecord {
  id: string;
  eventCode: 'CUSTOM_FIELD_VERSION_CREATED' | 'CUSTOM_FIELD_VERSION_ACTIVATED' | 'CUSTOM_FIELD_VERSION_RETIRED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR';
  actorId: string;
  targetType: 'CUSTOM_FIELD_VERSION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export type CustomFieldMutationResult =
  | { outcome: 'UPDATED'; definition: CustomFieldDefinitionProps }
  | { outcome: 'STALE' }
  | { outcome: 'NOT_DRAFT' }
  | { outcome: 'ACTIVATION_CONFLICT' };

export interface CustomFieldAdminRepository {
  listDefinitions(input: { page: number; pageSize: number }): Promise<{ items: CustomFieldDefinitionProps[]; totalItems: number }>;
  getDefinition(definitionId: string): Promise<CustomFieldDefinitionProps | null>;
  findDefinitionByKey(fieldKey: string): Promise<CustomFieldDefinitionProps | null>;
  listVersions(definitionId: string): Promise<CustomFieldVersionProps[]>;
  getVersion(versionId: string): Promise<CustomFieldVersionProps | null>;
  createDefinition(input: {
    definition: CustomFieldDefinitionProps;
    version: CustomFieldVersionProps;
    audit: CustomFieldAuditRecord;
  }): Promise<void>;
  createVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    definitionUpdatedAt: Date;
    version: CustomFieldVersionProps;
    audit: CustomFieldAuditRecord;
  }): Promise<CustomFieldMutationResult>;
  activateVersion(input: {
    definitionId: string;
    versionId: string;
    expectedDefinitionVersion: number;
    at: Date;
    audit: CustomFieldAuditRecord;
  }): Promise<CustomFieldMutationResult>;
  updateState(input: {
    definitionId: string;
    enabled: boolean;
    expectedDefinitionVersion: number;
    at: Date;
    retirementAudit: CustomFieldAuditRecord | null;
  }): Promise<CustomFieldMutationResult>;
}

export interface CustomFieldAdminDependencies {
  repository: CustomFieldAdminRepository;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const METADATA_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const PROTECTED_FIELD_KEYS = new Set([
  'id', 'status', 'lifecyclestatus', 'state', 'version', 'createdat', 'updatedat', 'completedat', 'cancelledat',
  'customerid', 'policyid', 'claimid', 'renewalid', 'collectionid', 'trackingcode', 'paymentstate',
  'permission', 'permissions', 'role', 'roles', 'password', 'passwordhash', 'secret', 'token', 'jwt',
  'authentication', 'authorization', 'email', 'phone', 'address', 'nationalid', 'passport', 'documentnumber',
]);
const PROTECTED_METADATA_KEYS = new Set([
  'secret', 'token', 'password', 'passwordhash', 'jwt', 'authorization', 'authentication', 'permission', 'permissions',
  'role', 'roles', 'status', 'lifecyclestatus', 'sql', 'script', 'eval', 'command', 'callbackurl', 'webhookurl',
]);

function requireAdmin(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new CustomFieldAdminError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('custom_fields.admin')) {
    throw new CustomFieldAdminError('FORBIDDEN', 'The caller is not authorized to administer custom fields.');
  }
  return actor;
}

function boundedText(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new CustomFieldAdminError('VALIDATION_ERROR', `${name} is required and must be at most ${max} characters.`);
  }
  return normalized;
}

function fieldKey(value: string): string {
  const normalized = boundedText('fieldKey', value, 80);
  if (!FIELD_KEY_PATTERN.test(normalized)) throw new CustomFieldAdminError('VALIDATION_ERROR', 'fieldKey contains unsupported characters.');
  const canonical = normalized.replaceAll(/[._-]/g, '').toLowerCase();
  if (PROTECTED_FIELD_KEYS.has(canonical)) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'Custom fields cannot replace protected domain, identity or security metadata.');
  }
  return normalized;
}

function targetType(value: string): CustomFieldTargetType {
  if (!(CUSTOM_FIELD_TARGET_TYPES as readonly string[]).includes(value)) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'Custom field target is not an approved R3 operational projection.');
  }
  return value as CustomFieldTargetType;
}

function valueType(value: string): CustomFieldValueType {
  if (!(CUSTOM_FIELD_VALUE_TYPES as readonly string[]).includes(value)) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'Custom field value type is not supported.');
  }
  return value as CustomFieldValueType;
}

function sensitivity(value: string): CustomFieldSensitivityClassification {
  if (!(CUSTOM_FIELD_SENSITIVITY_CLASSIFICATIONS as readonly string[]).includes(value)) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'Custom field sensitivity classification is not supported.');
  }
  return value as CustomFieldSensitivityClassification;
}

function expectedVersion(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new CustomFieldAdminError('VALIDATION_ERROR', 'expectedDefinitionVersion must be a positive integer.');
  }
  return value;
}

function boundedEnumValues(type: CustomFieldValueType, values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length > 100) {
    throw new CustomFieldAdminError('VALIDATION_ERROR', 'enumValues must contain at most 100 items.');
  }
  const normalized = values.map((item, index) => boundedText(`enumValues[${index}]`, item, 160));
  if (new Set(normalized).size !== normalized.length) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'enumValues must be unique.');
  }
  if (type === 'ENUM' && normalized.length === 0) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'ENUM custom fields require finite enumValues.');
  }
  if (type !== 'ENUM' && normalized.length !== 0) {
    throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'enumValues are only valid for ENUM custom fields.');
  }
  return normalized;
}

function boundedValidationMetadata(input: Readonly<Record<string, CustomFieldValidationScalar>>): Record<string, CustomFieldValidationScalar> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CustomFieldAdminError('VALIDATION_ERROR', 'validationMetadata must be an object.');
  }
  const entries = Object.entries(input);
  if (entries.length > 20) throw new CustomFieldAdminError('VALIDATION_ERROR', 'validationMetadata supports at most 20 entries.');
  const result: Record<string, CustomFieldValidationScalar> = {};
  for (const [key, raw] of entries.sort(([a], [b]) => a.localeCompare(b))) {
    if (!METADATA_KEY_PATTERN.test(key)) throw new CustomFieldAdminError('VALIDATION_ERROR', 'validationMetadata contains an unsupported key.');
    const canonical = key.replaceAll(/[._-]/g, '').toLowerCase();
    if (PROTECTED_METADATA_KEYS.has(canonical)) {
      throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'validationMetadata cannot encode protected, executable or security behavior.');
    }
    if (typeof raw === 'string') result[key] = boundedText(`validationMetadata.${key}`, raw, 500);
    else if (typeof raw === 'number' && Number.isFinite(raw)) result[key] = raw;
    else if (typeof raw === 'boolean') result[key] = raw;
    else throw new CustomFieldAdminError('VALIDATION_ERROR', 'validationMetadata values must be bounded JSON scalars.');
  }
  return result;
}

function normalizeVersionContent(input: {
  valueType: string;
  displayName: string;
  validationMetadata: Readonly<Record<string, CustomFieldValidationScalar>>;
  enumValues: readonly string[];
  sensitivityClassification: string;
}) {
  const type = valueType(input.valueType);
  return {
    valueType: type,
    displayName: boundedText('displayName', input.displayName, 160),
    validationMetadata: boundedValidationMetadata(input.validationMetadata),
    enumValues: boundedEnumValues(type, input.enumValues),
    sensitivityClassification: sensitivity(input.sensitivityClassification),
  };
}

function projection(definition: CustomFieldDefinitionProps, versions: readonly CustomFieldVersionProps[]) {
  return {
    definitionId: definition.id,
    fieldKey: definition.fieldKey,
    targetType: definition.targetType,
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
        valueType: version.valueType,
        displayName: version.displayName,
        validationMetadata: { ...version.validationMetadata },
        enumValues: [...version.enumValues],
        sensitivityClassification: version.sensitivityClassification,
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

function auditMetadata(definition: CustomFieldDefinitionProps, version: CustomFieldVersionProps) {
  return {
    definitionId: definition.id,
    fieldKey: definition.fieldKey,
    targetType: definition.targetType,
    versionNumber: version.versionNumber,
    valueType: version.valueType,
    sensitivityClassification: version.sensitivityClassification,
    sourceClassification: version.sourceClassification,
  };
}

export class CustomFieldAdminApplication {
  constructor(private readonly deps: CustomFieldAdminDependencies) {}

  async listCustomFields(input: { page?: number; pageSize?: number }, actor?: ActorContext) {
    requireAdmin(actor);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new CustomFieldAdminError('VALIDATION_ERROR', 'Invalid custom field pagination parameters.');
    }
    const result = await this.deps.repository.listDefinitions({ page, pageSize });
    const items = await Promise.all(result.items.map(async (definition) => projection(definition, await this.deps.repository.listVersions(definition.id))));
    return { items, page, pageSize, totalItems: result.totalItems, totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)) };
  }

  async getCustomField(definitionId: string, actor?: ActorContext) {
    requireAdmin(actor);
    const definition = await this.deps.repository.getDefinition(definitionId);
    if (!definition) throw new CustomFieldAdminError('RESOURCE_NOT_FOUND', 'The custom field definition could not be found.');
    return projection(definition, await this.deps.repository.listVersions(definition.id));
  }

  async createCustomField(input: {
    fieldKey: string;
    targetType: string;
    valueType: string;
    displayName: string;
    validationMetadata: Readonly<Record<string, CustomFieldValidationScalar>>;
    enumValues: readonly string[];
    sensitivityClassification: string;
    sourceClassification: string;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    const key = fieldKey(input.fieldKey);
    if (await this.deps.repository.findDefinitionByKey(key)) throw new CustomFieldAdminError('CUSTOM_FIELD_DEFINITION_INVALID', 'Custom field key must be unique.');
    const target = targetType(input.targetType);
    const content = normalizeVersionContent(input);
    const sourceClassification = boundedText('sourceClassification', input.sourceClassification, 80);
    const at = this.deps.clock.now();
    const definition: CustomFieldDefinitionProps = {
      id: this.deps.ids.uuid(), fieldKey: key, targetType: target, enabled: false, activeVersionId: null, version: 1, createdAt: at, updatedAt: at,
    };
    const version: CustomFieldVersionProps = {
      id: this.deps.ids.uuid(), definitionId: definition.id, versionNumber: 1, ...content,
      status: 'DRAFT', sourceClassification, createdByType: 'ADMINISTRATOR', createdById: authenticated.operatorId,
      createdAt: at, activatedAt: null, retiredAt: null,
    };
    await this.deps.repository.createDefinition({
      definition, version,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'CUSTOM_FIELD_VERSION_CREATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId,
        targetType: 'CUSTOM_FIELD_VERSION', targetId: version.id, outcome: 'SUCCESS', requestId: context.requestId ?? null,
        metadata: auditMetadata(definition, version),
      },
    });
    return projection(definition, [version]);
  }

  async createCustomFieldVersion(input: {
    definitionId: string;
    expectedDefinitionVersion: number;
    valueType: string;
    displayName: string;
    validationMetadata: Readonly<Record<string, CustomFieldValidationScalar>>;
    enumValues: readonly string[];
    sensitivityClassification: string;
    sourceClassification: string;
  }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new CustomFieldAdminError('RESOURCE_NOT_FOUND', 'The custom field definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new CustomFieldAdminError('RESOURCE_VERSION_CONFLICT', 'The custom field definition changed before the new version could be created.');
    const versions = await this.deps.repository.listVersions(definition.id);
    const at = this.deps.clock.now();
    const version: CustomFieldVersionProps = {
      id: this.deps.ids.uuid(), definitionId: definition.id,
      versionNumber: Math.max(0, ...versions.map((item) => item.versionNumber)) + 1,
      ...normalizeVersionContent(input), status: 'DRAFT', sourceClassification: boundedText('sourceClassification', input.sourceClassification, 80),
      createdByType: 'ADMINISTRATOR', createdById: authenticated.operatorId, createdAt: at, activatedAt: null, retiredAt: null,
    };
    const result = await this.deps.repository.createVersion({
      definitionId: definition.id, expectedDefinitionVersion: input.expectedDefinitionVersion, definitionUpdatedAt: at, version,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'CUSTOM_FIELD_VERSION_CREATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId, targetType: 'CUSTOM_FIELD_VERSION', targetId: version.id,
        outcome: 'SUCCESS', requestId: context.requestId ?? null, metadata: auditMetadata(definition, version),
      },
    });
    if (result.outcome === 'STALE') throw new CustomFieldAdminError('RESOURCE_VERSION_CONFLICT', 'The custom field definition changed before the new version could be created.');
    if (result.outcome !== 'UPDATED') throw new CustomFieldAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The custom field version could not be created in the current configuration state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async activateCustomFieldVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new CustomFieldAdminError('RESOURCE_NOT_FOUND', 'The custom field definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new CustomFieldAdminError('RESOURCE_VERSION_CONFLICT', 'The custom field definition changed before activation.');
    const version = await this.deps.repository.getVersion(input.versionId);
    if (!version || version.definitionId !== definition.id) throw new CustomFieldAdminError('RESOURCE_NOT_FOUND', 'The custom field version could not be found.');
    if (version.status !== 'DRAFT') throw new CustomFieldAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'Only a DRAFT custom field version can be activated.');
    const at = this.deps.clock.now();
    const result = await this.deps.repository.activateVersion({
      definitionId: definition.id, versionId: version.id, expectedDefinitionVersion: input.expectedDefinitionVersion, at,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'CUSTOM_FIELD_VERSION_ACTIVATED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: authenticated.operatorId, targetType: 'CUSTOM_FIELD_VERSION', targetId: version.id,
        outcome: 'SUCCESS', requestId: context.requestId ?? null, metadata: auditMetadata(definition, version),
      },
    });
    if (result.outcome === 'STALE') throw new CustomFieldAdminError('RESOURCE_VERSION_CONFLICT', 'The custom field definition changed before activation.');
    if (result.outcome !== 'UPDATED') throw new CustomFieldAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The custom field version cannot be activated in the current state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }

  async updateCustomFieldState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requireAdmin(actor);
    expectedVersion(input.expectedDefinitionVersion);
    const definition = await this.deps.repository.getDefinition(input.definitionId);
    if (!definition) throw new CustomFieldAdminError('RESOURCE_NOT_FOUND', 'The custom field definition could not be found.');
    if (definition.version !== input.expectedDefinitionVersion) throw new CustomFieldAdminError('RESOURCE_VERSION_CONFLICT', 'The custom field definition changed before its state could be updated.');
    if (definition.enabled === input.enabled) return projection(definition, await this.deps.repository.listVersions(definition.id));
    if (input.enabled && !definition.activeVersionId) throw new CustomFieldAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'Custom field requires an active version before it can be enabled.');
    const activeVersion = definition.activeVersionId ? await this.deps.repository.getVersion(definition.activeVersionId) : null;
    const at = this.deps.clock.now();
    const retirementAudit = !input.enabled && activeVersion ? {
      id: this.deps.ids.uuid(), eventCode: 'CUSTOM_FIELD_VERSION_RETIRED' as const, occurredAt: at,
      actorType: 'ADMINISTRATOR' as const, actorId: authenticated.operatorId, targetType: 'CUSTOM_FIELD_VERSION' as const,
      targetId: activeVersion.id, outcome: 'SUCCESS' as const, requestId: context.requestId ?? null,
      metadata: auditMetadata(definition, activeVersion),
    } : null;
    const result = await this.deps.repository.updateState({
      definitionId: definition.id, enabled: input.enabled, expectedDefinitionVersion: input.expectedDefinitionVersion, at, retirementAudit,
    });
    if (result.outcome === 'STALE') throw new CustomFieldAdminError('RESOURCE_VERSION_CONFLICT', 'The custom field definition changed before its state could be updated.');
    if (result.outcome !== 'UPDATED') throw new CustomFieldAdminError('CONFIGURATION_ACTIVATION_CONFLICT', 'The custom field state cannot be updated in the current configuration state.');
    return projection(result.definition, await this.deps.repository.listVersions(definition.id));
  }
}
