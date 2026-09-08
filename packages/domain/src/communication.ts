export const COMMUNICATION_CHANNELS = ['EMAIL', 'WHATSAPP'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const CONFIGURATION_VERSION_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type ConfigurationVersionStatus = (typeof CONFIGURATION_VERSION_STATUSES)[number];

export const COMMUNICATION_STATUSES = ['QUEUED', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED'] as const;
export type CommunicationStatus = (typeof COMMUNICATION_STATUSES)[number];

export const COMMUNICATION_TARGET_TYPES = ['CLAIM', 'CUSTOMER'] as const;
export type CommunicationTargetType = (typeof COMMUNICATION_TARGET_TYPES)[number];

export type CommunicationActorType = 'SYSTEM' | 'OPERATOR' | 'SUPERVISOR' | 'ADMINISTRATOR' | 'AUTOMATION';

export interface CommunicationTemplateDefinitionProps {
  id: string;
  key: string;
  channel: CommunicationChannel;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunicationTemplateVersionProps {
  id: string;
  definitionId: string;
  versionNumber: number;
  subject: string | null;
  body: string;
  variableSchema: Readonly<Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'>>;
  status: ConfigurationVersionStatus;
  sourceClassification: string;
  createdByType: CommunicationActorType;
  createdById: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
}

export interface CommunicationProps {
  id: string;
  channel: CommunicationChannel;
  templateVersionId: string;
  targetType: CommunicationTargetType;
  targetId: string;
  customerId: string | null;
  destinationRef: string;
  variableSnapshot: Readonly<Record<string, string | number | boolean>>;
  status: CommunicationStatus;
  requestIdempotencyKeyHash: string;
  correlationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  version: number;
}

export interface CommunicationAttemptProps {
  id: string;
  communicationId: string;
  attemptNumber: number;
  deliveryIdentity: string;
  startedAt: Date;
  completedAt: Date | null;
  outcome: 'IN_PROGRESS' | 'DELIVERED' | 'FAILED';
  providerReference: string | null;
  failureCategory: string | null;
}
