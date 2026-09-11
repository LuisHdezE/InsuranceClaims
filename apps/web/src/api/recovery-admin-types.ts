export interface DeadLetterProjection {
  deadLetterId: string;
  jobType: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
  availableAt: string;
  correlationId: string | null;
  failureCategory: string | null;
  completedAt: string | null;
  version: number;
}

export interface DeadLettersPageResponse {
  items: DeadLetterProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface DeadLetterListInput {
  page?: number;
  pageSize?: number;
}

export interface DeadLetterMutationInput {
  expectedVersion: number;
}

export interface IntegrationEventStatusProjection {
  eventId: string;
  externalEventId: string;
  eventType: string;
  ingestionStatus: 'ACCEPTED';
  processingStatus: string;
  acceptedAt: string;
  processedAt: string | null;
  failureCategory: string | null;
}
