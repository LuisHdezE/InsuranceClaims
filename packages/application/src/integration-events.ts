import type {
  AsyncJobProps,
  InboundEventProps,
  InboundIntegrationProps,
  IntegrationEventSchema,
  IntegrationPayload,
  IntegrationScalar,
} from '@insurance/domain';
import type { ActorContext, ClockPort, IdGeneratorPort, RequestContext } from './index.js';

export type IntegrationEventsErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'INTEGRATION_REPLAY_DETECTED'
  | 'INTEGRATION_SCHEMA_INVALID';

export class IntegrationEventsApplicationError extends Error {
  constructor(readonly code: IntegrationEventsErrorCode, message: string) {
    super(message);
    this.name = 'IntegrationEventsApplicationError';
  }
}

export interface IntegrationPrincipal {
  integrationId: string;
  integrationKey: string;
  keyId: string;
  context: 'integration';
  permissions: readonly ['integration.events.ingest'];
}

export interface InboundEventAuditRecord {
  id: string;
  eventCode: 'INBOUND_EVENT_ACCEPTED';
  occurredAt: Date;
  actorType: 'INTEGRATION';
  actorId: string;
  targetType: 'INBOUND_EVENT';
  targetId: string;
  outcome: 'SUCCESS';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface InboundEventAcceptance {
  event: InboundEventProps;
  job: AsyncJobProps;
  audit: InboundEventAuditRecord;
}

export type ProcessingLeaseResult =
  | { outcome: 'LEASED'; event: InboundEventProps; job: AsyncJobProps }
  | { outcome: 'BUSY'; event: InboundEventProps }
  | { outcome: 'TERMINAL'; event: InboundEventProps }
  | { outcome: 'NOT_FOUND' };

export interface IntegrationEventRepository {
  findIntegrationByExternalKey(integrationKey: string): Promise<InboundIntegrationProps | null>;
  getIntegration(integrationId: string): Promise<InboundIntegrationProps | null>;
  findEventByExternalIdentity(integrationId: string, externalEventId: string): Promise<InboundEventProps | null>;
  getEvent(eventId: string): Promise<InboundEventProps | null>;
  acceptEvent(input: InboundEventAcceptance): Promise<'CREATED' | 'DUPLICATE'>;
  beginProcessing(input: { eventId: string; leaseOwner: string; at: Date; leaseSeconds: number }): Promise<ProcessingLeaseResult>;
  finishProcessing(input: {
    eventId: string;
    jobId: string;
    outcome: 'PROCESSED' | 'FAILED';
    failureCategory: string | null;
    at: Date;
  }): Promise<InboundEventProps>;
}

export type InboundEventProcessorResult =
  | { outcome: 'PROCESSED' }
  | { outcome: 'FAILED'; failureCategory: string };

export interface InboundEventProcessorPort {
  process(event: InboundEventProps): Promise<InboundEventProcessorResult>;
}

export interface IntegrationEventsDependencies {
  repository: IntegrationEventRepository;
  processor: InboundEventProcessorPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

export interface InboundEventAcceptedResponse {
  eventId: string;
  externalEventId: string;
  eventType: string;
  ingestionStatus: 'ACCEPTED';
  processingStatus: InboundEventProps['processingStatus'];
  acceptedAt: string;
}

export interface InboundEventStatusResponse extends InboundEventAcceptedResponse {
  processedAt: string | null;
  failureCategory: string | null;
}

const EVENT_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const EXTERNAL_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function requireIntegrationPrincipal(principal: IntegrationPrincipal | undefined): IntegrationPrincipal {
  if (!principal || principal.context !== 'integration' || !principal.permissions.includes('integration.events.ingest')) {
    throw new IntegrationEventsApplicationError('AUTHENTICATION_REQUIRED', 'A valid integration identity is required.');
  }
  return principal;
}

function requireStaffPermission(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new IntegrationEventsApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('operations.integration.read')) {
    throw new IntegrationEventsApplicationError('FORBIDDEN', 'The caller is not authorized for integration diagnostics.');
  }
  return actor;
}

function validateScalar(name: string, expected: IntegrationEventSchema[string], value: IntegrationScalar): void {
  if (expected === 'STRING') {
    if (typeof value !== 'string' || value.length > 500) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', `${name} must be a string no longer than 500 characters.`);
    }
    return;
  }
  if (expected === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', `${name} must be a finite number.`);
    }
    return;
  }
  if (typeof value !== 'boolean') {
    throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', `${name} must be a boolean.`);
  }
}

function validatePayload(schema: IntegrationEventSchema | undefined, payload: IntegrationPayload): void {
  if (!schema) throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'The event type is not allowlisted for this integration.');
  const expectedKeys = Object.keys(schema).sort();
  const actualKeys = Object.keys(payload).sort();
  if (expectedKeys.length > 40 || actualKeys.length > 40 || expectedKeys.length !== actualKeys.length) {
    throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'The event payload does not match the approved schema.');
  }
  for (let index = 0; index < expectedKeys.length; index += 1) {
    if (expectedKeys[index] !== actualKeys[index]) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'The event payload does not match the approved schema.');
    }
  }
  for (const key of expectedKeys) {
    if (!EVENT_TYPE_PATTERN.test(key)) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'The configured event schema is invalid.');
    }
    validateScalar(key, schema[key]!, payload[key]!);
  }
}

function acceptedResponse(event: InboundEventProps): InboundEventAcceptedResponse {
  return {
    eventId: event.id,
    externalEventId: event.externalEventId,
    eventType: event.eventType,
    ingestionStatus: event.ingestionStatus,
    processingStatus: event.processingStatus,
    acceptedAt: event.acceptedAt.toISOString(),
  };
}

function statusResponse(event: InboundEventProps): InboundEventStatusResponse {
  return {
    ...acceptedResponse(event),
    processedAt: event.processedAt?.toISOString() ?? null,
    failureCategory: event.failureCategory,
  };
}

export class IntegrationEventsApplication {
  constructor(private readonly deps: IntegrationEventsDependencies) {}

  async ingestIntegrationEvent(input: {
    externalEventId: string;
    eventType: string;
    payload: IntegrationPayload;
    payloadHash: string;
  }, principalInput: IntegrationPrincipal | undefined, context: RequestContext = {}): Promise<{ response: InboundEventAcceptedResponse; replayed: boolean }> {
    const principal = requireIntegrationPrincipal(principalInput);
    if (!EXTERNAL_EVENT_ID_PATTERN.test(input.externalEventId)) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'X-Event-Id is malformed.');
    }
    if (!EVENT_TYPE_PATTERN.test(input.eventType)) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'eventType is malformed.');
    }
    if (!DIGEST_PATTERN.test(input.payloadHash)) {
      throw new IntegrationEventsApplicationError('INTEGRATION_SCHEMA_INVALID', 'The request payload digest is malformed.');
    }

    const integration = await this.deps.repository.getIntegration(principal.integrationId);
    if (!integration || !integration.enabled || integration.integrationKey !== principal.integrationKey || integration.keyId !== principal.keyId) {
      throw new IntegrationEventsApplicationError('AUTHENTICATION_REQUIRED', 'A valid integration identity is required.');
    }
    validatePayload(integration.allowedEventSchemas[input.eventType], input.payload);

    const existing = await this.deps.repository.findEventByExternalIdentity(integration.id, input.externalEventId);
    if (existing) {
      if (existing.payloadHash !== input.payloadHash) {
        throw new IntegrationEventsApplicationError('INTEGRATION_REPLAY_DETECTED', 'The signed external event identity was already accepted with a different payload.');
      }
      return { response: acceptedResponse(existing), replayed: true };
    }

    const now = this.deps.clock.now();
    const event: InboundEventProps = {
      id: this.deps.ids.uuid(),
      integrationId: integration.id,
      externalEventId: input.externalEventId,
      payloadHash: input.payloadHash,
      payload: { ...input.payload },
      eventType: input.eventType,
      ingestionStatus: 'ACCEPTED',
      processingStatus: 'PENDING',
      correlationId: context.requestId ?? null,
      acceptedAt: now,
      processedAt: null,
      failureCategory: null,
      version: 1,
    };
    const job: AsyncJobProps = {
      id: this.deps.ids.uuid(),
      jobType: 'PROCESS_INBOUND_EVENT',
      idempotencyIdentity: `${integration.id}:${input.externalEventId}`,
      payload: { eventId: event.id },
      status: 'PENDING',
      attemptCount: 0,
      maxAttempts: 3,
      availableAt: now,
      leaseOwner: null,
      leaseExpiresAt: null,
      correlationId: context.requestId ?? null,
      lastFailureCategory: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      version: 1,
    };
    const audit: InboundEventAuditRecord = {
      id: this.deps.ids.uuid(),
      eventCode: 'INBOUND_EVENT_ACCEPTED',
      occurredAt: now,
      actorType: 'INTEGRATION',
      actorId: integration.id,
      targetType: 'INBOUND_EVENT',
      targetId: event.id,
      outcome: 'SUCCESS',
      requestId: context.requestId ?? null,
      metadata: { externalEventId: input.externalEventId, eventType: input.eventType, payloadHash: input.payloadHash },
    };

    const created = await this.deps.repository.acceptEvent({ event, job, audit });
    if (created === 'DUPLICATE') {
      const raced = await this.deps.repository.findEventByExternalIdentity(integration.id, input.externalEventId);
      if (!raced) throw new Error('Inbound event duplicate identity disappeared after acceptance race.');
      if (raced.payloadHash !== input.payloadHash) {
        throw new IntegrationEventsApplicationError('INTEGRATION_REPLAY_DETECTED', 'The signed external event identity was already accepted with a different payload.');
      }
      return { response: acceptedResponse(raced), replayed: true };
    }
    return { response: acceptedResponse(event), replayed: false };
  }

  async getIntegrationEventStatus(eventId: string, actor: ActorContext | undefined): Promise<InboundEventStatusResponse> {
    requireStaffPermission(actor);
    const event = await this.deps.repository.getEvent(eventId);
    if (!event) throw new IntegrationEventsApplicationError('RESOURCE_NOT_FOUND', 'Inbound event was not found.');
    return statusResponse(event);
  }

  async processInboundEvent(eventId: string, leaseOwner = 'integration-worker'): Promise<InboundEventStatusResponse> {
    const now = this.deps.clock.now();
    const lease = await this.deps.repository.beginProcessing({ eventId, leaseOwner, at: now, leaseSeconds: 60 });
    if (lease.outcome === 'NOT_FOUND') throw new IntegrationEventsApplicationError('RESOURCE_NOT_FOUND', 'Inbound event was not found.');
    if (lease.outcome === 'BUSY' || lease.outcome === 'TERMINAL') return statusResponse(lease.event);

    let result: InboundEventProcessorResult;
    try {
      result = await this.deps.processor.process(lease.event);
    } catch {
      result = { outcome: 'FAILED', failureCategory: 'PROCESSOR_EXCEPTION' };
    }
    const failureCategory = result.outcome === 'FAILED'
      ? result.failureCategory.trim().slice(0, 80) || 'PROCESSING_FAILED'
      : null;
    const finished = await this.deps.repository.finishProcessing({
      eventId,
      jobId: lease.job.id,
      outcome: result.outcome,
      failureCategory,
      at: this.deps.clock.now(),
    });
    return statusResponse(finished);
  }
}
