export const INBOUND_EVENT_INGESTION_STATUSES = ['ACCEPTED'] as const;
export type InboundEventIngestionStatus = (typeof INBOUND_EVENT_INGESTION_STATUSES)[number];

export const INBOUND_EVENT_PROCESSING_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'DEAD_LETTER',
] as const;
export type InboundEventProcessingStatus = (typeof INBOUND_EVENT_PROCESSING_STATUSES)[number];

export const ASYNC_JOB_STATUSES = [
  'PENDING',
  'LEASED',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'DEAD_LETTER',
  'CANCELLED',
] as const;
export type AsyncJobStatus = (typeof ASYNC_JOB_STATUSES)[number];

export type IntegrationScalar = string | number | boolean;
export type IntegrationPayload = Readonly<Record<string, IntegrationScalar>>;
export type IntegrationVariableType = 'STRING' | 'NUMBER' | 'BOOLEAN';
export type IntegrationEventSchema = Readonly<Record<string, IntegrationVariableType>>;

export interface InboundIntegrationProps {
  id: string;
  integrationKey: string;
  keyId: string;
  enabled: boolean;
  allowedEventSchemas: Readonly<Record<string, IntegrationEventSchema>>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface InboundEventProps {
  id: string;
  integrationId: string;
  externalEventId: string;
  payloadHash: string;
  payload: IntegrationPayload;
  eventType: string;
  ingestionStatus: InboundEventIngestionStatus;
  processingStatus: InboundEventProcessingStatus;
  correlationId: string | null;
  acceptedAt: Date;
  processedAt: Date | null;
  failureCategory: string | null;
  version: number;
}

export interface AsyncJobProps {
  id: string;
  jobType: string;
  idempotencyIdentity: string;
  payload: Readonly<Record<string, IntegrationScalar>>;
  status: AsyncJobStatus;
  attemptCount: number;
  maxAttempts: number;
  availableAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  correlationId: string | null;
  lastFailureCategory: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  version: number;
}
