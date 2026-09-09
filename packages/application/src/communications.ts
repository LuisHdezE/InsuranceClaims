import type {
  CommunicationAttemptProps,
  CommunicationChannel,
  CommunicationProps,
  CommunicationStatus,
  CommunicationTargetType,
  CommunicationTemplateDefinitionProps,
  CommunicationTemplateVersionProps,
} from '@insurance/domain';
import type {
  ActorContext,
  ClockPort,
  HashPort,
  IdGeneratorPort,
  RequestContext,
} from './index.js';

export type CommunicationsErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'CONFIGURATION_ACTIVATION_CONFLICT'
  | 'VALIDATION_ERROR';

export class CommunicationsApplicationError extends Error {
  constructor(readonly code: CommunicationsErrorCode, message: string) {
    super(message);
    this.name = 'CommunicationsApplicationError';
  }
}

export interface CommunicationContextResolution {
  targetType: CommunicationTargetType;
  targetId: string;
  customerId: string;
  destinationRef: string;
}

export interface CommunicationContextPort {
  resolve(targetType: CommunicationTargetType, targetId: string): Promise<CommunicationContextResolution | null>;
}

export interface CommunicationDeliveryRequest {
  communicationId: string;
  deliveryIdentity: string;
  channel: CommunicationChannel;
  destinationRef: string;
  subject: string | null;
  body: string;
  variables: Readonly<Record<string, string | number | boolean>>;
}

export type CommunicationDeliveryResult =
  | { outcome: 'DELIVERED'; providerReference: string }
  | { outcome: 'FAILED'; failureCategory: string; providerReference?: string | null };

export interface CommunicationDeliveryPort {
  deliver(request: CommunicationDeliveryRequest): Promise<CommunicationDeliveryResult>;
}

export interface CommunicationRecordWithAttempts {
  communication: CommunicationProps;
  attempts: CommunicationAttemptProps[];
}

export interface CommunicationRepository {
  getTemplateDefinition(definitionId: string): Promise<CommunicationTemplateDefinitionProps | null>;
  getTemplateVersion(versionId: string): Promise<CommunicationTemplateVersionProps | null>;
  findCommunicationByIdempotencyKeyHash(keyHash: string): Promise<CommunicationRecordWithAttempts | null>;
  createCommunication(input: { communication: CommunicationProps; requestFingerprint: string; audit: CommunicationAuditRecord }): Promise<'CREATED' | 'DUPLICATE'>;
  listCommunications(input: {
    page: number;
    pageSize: number;
    status?: CommunicationStatus;
    channel?: CommunicationChannel;
    targetType?: CommunicationTargetType;
    targetId?: string;
  }): Promise<{ items: CommunicationRecordWithAttempts[]; totalItems: number }>;
  getCommunication(communicationId: string): Promise<CommunicationRecordWithAttempts | null>;
  getRequestFingerprint(communicationId: string): Promise<string | null>;
  beginAttempt(input: {
    communicationId: string;
    attempt: CommunicationAttemptProps;
    at: Date;
  }): Promise<{ outcome: 'STARTED'; communication: CommunicationProps } | { outcome: 'BUSY' } | { outcome: 'TERMINAL' } | { outcome: 'NOT_FOUND' }>;
  finishAttempt(input: {
    communicationId: string;
    attemptId: string;
    outcome: 'DELIVERED' | 'FAILED';
    providerReference: string | null;
    failureCategory: string | null;
    at: Date;
  }): Promise<void>;
}

export interface CommunicationAuditRecord {
  id: string;
  eventCode: 'COMMUNICATION_REQUESTED';
  occurredAt: Date;
  actorType: 'OPERATOR' | 'SUPERVISOR';
  actorId: string;
  targetType: 'COMMUNICATION';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface CommunicationsDependencies {
  repository: CommunicationRepository;
  context: CommunicationContextPort;
  delivery: CommunicationDeliveryPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  hash: HashPort;
}

const CHANNELS = new Set<CommunicationChannel>(['EMAIL', 'WHATSAPP']);
const TARGET_TYPES = new Set<CommunicationTargetType>(['CLAIM', 'CUSTOMER']);
const STATUSES = new Set<CommunicationStatus>(['QUEUED', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED']);
const VAR_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

function requirePermission(actor: ActorContext | undefined, permission: 'communications.read' | 'communications.send'): ActorContext {
  if (!actor) throw new CommunicationsApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) throw new CommunicationsApplicationError('FORBIDDEN', 'The caller is not authorized for this communication operation.');
  return actor;
}

function normalizeIdempotencyKey(value: string): string {
  if (!value || value.length < 16 || value.length > 128) {
    throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Idempotency-Key must contain 16 to 128 characters.');
  }
  return value;
}

function normalizeVariables(
  input: Readonly<Record<string, unknown>>,
  schema: Readonly<Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'>>,
): Record<string, string | number | boolean> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CommunicationsApplicationError('VALIDATION_ERROR', 'variables must be an object.');
  }
  const supplied = Object.keys(input).sort();
  const expected = Object.keys(schema).sort();
  if (supplied.length !== expected.length || supplied.some((key, index) => key !== expected[index])) {
    throw new CommunicationsApplicationError('VALIDATION_ERROR', 'variables must match the active template variable schema exactly.');
  }
  const normalized: Record<string, string | number | boolean> = {};
  for (const key of expected) {
    if (!VAR_KEY_PATTERN.test(key)) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Template variable schema contains an unsupported key.');
    const value = input[key];
    const type = schema[key]!;
    if ((type === 'STRING' && (typeof value !== 'string' || value.length > 500))
      || (type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value)))
      || (type === 'BOOLEAN' && typeof value !== 'boolean')) {
      throw new CommunicationsApplicationError('VALIDATION_ERROR', `Variable ${key} does not match its approved template type.`);
    }
    normalized[key] = value as string | number | boolean;
  }
  return normalized;
}

function renderTemplate(template: CommunicationTemplateVersionProps, variables: Readonly<Record<string, string | number | boolean>>) {
  const substitute = (text: string | null): string | null => {
    if (text === null) return null;
    return text.replace(/\{\{([A-Za-z][A-Za-z0-9._-]{0,79})\}\}/g, (_match, key: string) => {
      if (!(key in variables)) throw new CommunicationsApplicationError('VALIDATION_ERROR', `Template references undeclared variable ${key}.`);
      return String(variables[key]);
    });
  };
  return { subject: substitute(template.subject), body: substitute(template.body)! };
}

function projection(record: CommunicationRecordWithAttempts) {
  const item = record.communication;
  return {
    communicationId: item.id,
    channel: item.channel,
    templateVersionId: item.templateVersionId,
    targetType: item.targetType,
    targetId: item.targetId,
    customerId: item.customerId,
    destinationRef: item.destinationRef,
    variables: { ...item.variableSnapshot },
    status: item.status,
    correlationId: item.correlationId,
    version: item.version,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    deliveredAt: item.deliveredAt?.toISOString() ?? null,
    failedAt: item.failedAt?.toISOString() ?? null,
    cancelledAt: item.cancelledAt?.toISOString() ?? null,
    attempts: [...record.attempts]
      .sort((a, b) => a.attemptNumber - b.attemptNumber || a.id.localeCompare(b.id))
      .map((attempt) => ({
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        startedAt: attempt.startedAt.toISOString(),
        completedAt: attempt.completedAt?.toISOString() ?? null,
        outcome: attempt.outcome,
        providerReference: attempt.providerReference,
        failureCategory: attempt.failureCategory,
      })),
  };
}

function actorType(actor: ActorContext): 'OPERATOR' | 'SUPERVISOR' {
  return actor.role === 'CLAIMS_SUPERVISOR' ? 'SUPERVISOR' : 'OPERATOR';
}

export class CommunicationsApplication {
  constructor(private readonly deps: CommunicationsDependencies) {}

  async requestCommunication(input: {
    idempotencyKey: string;
    templateVersionId: string;
    channel: CommunicationChannel;
    targetType: CommunicationTargetType;
    targetId: string;
    variables: Readonly<Record<string, unknown>>;
  }, actor?: ActorContext, context: RequestContext = {}): Promise<{ response: ReturnType<typeof projection>; replayed: boolean }> {
    const authenticated = requirePermission(actor, 'communications.send');
    const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    if (!CHANNELS.has(input.channel)) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Unsupported communication channel.');
    if (!TARGET_TYPES.has(input.targetType)) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Unsupported communication target type.');
    if (!input.targetId?.trim() || input.targetId.length > 80) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'targetId is required and must be at most 80 characters.');

    const template = await this.deps.repository.getTemplateVersion(input.templateVersionId);
    if (!template) throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication template version could not be found.');
    const definition = await this.deps.repository.getTemplateDefinition(template.definitionId);
    if (!definition) throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication template definition could not be found.');
    if (!definition.enabled || definition.activeVersionId !== template.id || template.status !== 'ACTIVE') {
      throw new CommunicationsApplicationError('CONFIGURATION_ACTIVATION_CONFLICT', 'The requested communication template version is not the enabled active version.');
    }
    if (definition.channel !== input.channel) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'The requested channel does not match the template channel.');

    const target = await this.deps.context.resolve(input.targetType, input.targetId.trim());
    if (!target) throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication target could not be resolved safely.');
    const variables = normalizeVariables(input.variables, template.variableSchema);
    const keyHash = await this.deps.hash.sha256(idempotencyKey);
    const requestFingerprint = await this.deps.hash.sha256(JSON.stringify({
      templateVersionId: template.id,
      channel: input.channel,
      targetType: target.targetType,
      targetId: target.targetId,
      variables,
    }));

    const existing = await this.deps.repository.findCommunicationByIdempotencyKeyHash(keyHash);
    if (existing) {
      const fingerprint = await this.deps.repository.getRequestFingerprint(existing.communication.id);
      if (fingerprint !== requestFingerprint) throw new CommunicationsApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different communication request.');
      return { response: projection(existing), replayed: true };
    }

    const at = this.deps.clock.now();
    const communicationId = this.deps.ids.uuid();
    const communication: CommunicationProps = {
      id: communicationId,
      channel: input.channel,
      templateVersionId: template.id,
      targetType: target.targetType,
      targetId: target.targetId,
      customerId: target.customerId,
      destinationRef: target.destinationRef,
      variableSnapshot: variables,
      status: 'QUEUED',
      requestIdempotencyKeyHash: keyHash,
      correlationId: context.requestId ?? null,
      createdAt: at,
      updatedAt: at,
      deliveredAt: null,
      failedAt: null,
      cancelledAt: null,
      version: 1,
    };
    const created = await this.deps.repository.createCommunication({
      communication,
      requestFingerprint,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'COMMUNICATION_REQUESTED', occurredAt: at,
        actorType: actorType(authenticated), actorId: authenticated.operatorId,
        targetType: 'COMMUNICATION', targetId: communicationId, outcome: 'SUCCESS',
        requestId: context.requestId ?? null,
        metadata: { channel: input.channel, templateVersionId: template.id, targetType: target.targetType, targetId: target.targetId },
      },
    });
    if (created === 'DUPLICATE') {
      const raced = await this.deps.repository.findCommunicationByIdempotencyKeyHash(keyHash);
      if (!raced) throw new CommunicationsApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original communication request is still being processed.');
      const fingerprint = await this.deps.repository.getRequestFingerprint(raced.communication.id);
      if (fingerprint !== requestFingerprint) throw new CommunicationsApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different communication request.');
      return { response: projection(raced), replayed: true };
    }
    return { response: projection({ communication, attempts: [] }), replayed: false };
  }

  async listCommunications(input: {
    page?: number;
    pageSize?: number;
    status?: CommunicationStatus;
    channel?: CommunicationChannel;
    targetType?: CommunicationTargetType;
    targetId?: string;
  }, actor?: ActorContext) {
    requirePermission(actor, 'communications.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Invalid communication pagination parameters.');
    if (input.status && !STATUSES.has(input.status)) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Unsupported communication status.');
    if (input.channel && !CHANNELS.has(input.channel)) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Unsupported communication channel.');
    if (input.targetType && !TARGET_TYPES.has(input.targetType)) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'Unsupported communication target type.');
    if (input.targetId && input.targetId.length > 80) throw new CommunicationsApplicationError('VALIDATION_ERROR', 'targetId must be at most 80 characters.');
    const result = await this.deps.repository.listCommunications({
      page, pageSize, status: input.status, channel: input.channel, targetType: input.targetType, targetId: input.targetId?.trim() || undefined,
    });
    return { items: result.items.map(projection), page, pageSize, totalItems: result.totalItems, totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)) };
  }

  async getCommunication(communicationId: string, actor?: ActorContext) {
    requirePermission(actor, 'communications.read');
    const record = await this.deps.repository.getCommunication(communicationId);
    if (!record) throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication could not be found.');
    return projection(record);
  }

  async processCommunicationDelivery(communicationId: string) {
    const current = await this.deps.repository.getCommunication(communicationId);
    if (!current) throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication could not be found.');
    if (current.communication.status === 'DELIVERED' || current.communication.status === 'CANCELLED') return projection(current);
    const template = await this.deps.repository.getTemplateVersion(current.communication.templateVersionId);
    if (!template) throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication template version could not be found.');
    const nextAttemptNumber = Math.max(0, ...current.attempts.map((attempt) => attempt.attemptNumber)) + 1;
    const at = this.deps.clock.now();
    const attempt: CommunicationAttemptProps = {
      id: this.deps.ids.uuid(), communicationId,
      attemptNumber: nextAttemptNumber,
      deliveryIdentity: `${communicationId}:${nextAttemptNumber}`,
      startedAt: at, completedAt: null, outcome: 'FAILED', providerReference: null, failureCategory: null,
    };
    const started = await this.deps.repository.beginAttempt({ communicationId, attempt, at });
    if (started.outcome === 'NOT_FOUND') throw new CommunicationsApplicationError('RESOURCE_NOT_FOUND', 'The communication could not be found.');
    if (started.outcome === 'BUSY') return projection((await this.deps.repository.getCommunication(communicationId))!);
    if (started.outcome === 'TERMINAL') return projection((await this.deps.repository.getCommunication(communicationId))!);

    const rendered = renderTemplate(template, started.communication.variableSnapshot);
    let result: CommunicationDeliveryResult;
    try {
      result = await this.deps.delivery.deliver({
        communicationId,
        deliveryIdentity: attempt.deliveryIdentity,
        channel: started.communication.channel,
        destinationRef: started.communication.destinationRef,
        subject: rendered.subject,
        body: rendered.body,
        variables: started.communication.variableSnapshot,
      });
    } catch {
      result = { outcome: 'FAILED', failureCategory: 'SIMULATED_PROVIDER_UNAVAILABLE' };
    }
    const finishedAt = this.deps.clock.now();
    await this.deps.repository.finishAttempt({
      communicationId,
      attemptId: attempt.id,
      outcome: result.outcome,
      providerReference: result.outcome === 'DELIVERED' ? result.providerReference : (result.providerReference ?? null),
      failureCategory: result.outcome === 'FAILED' ? result.failureCategory : null,
      at: finishedAt,
    });
    return projection((await this.deps.repository.getCommunication(communicationId))!);
  }
}
