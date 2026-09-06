export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code?: string;
  requestId?: string;
  errors?: Record<string, string[] | string>;
};

export type PolicyVerificationRequest = {
  policyReference: string;
  vehicleReference: string;
};

export type PolicyVerificationResponse = {
  policyReference: string;
  vehicleReference: string;
  eligible: true;
  customerLabel: string | null;
};

export type ClaimDraft = {
  eventType: string;
  occurredAt: string;
  locationText: string;
  description: string;
  evidence: File[];
};

export type CreateClaimResponse = {
  trackingCode: string;
  status: 'RECEIVED';
  submittedAt: string;
  nextSteps: string[];
};

export type ApiResult<T> = {
  data: T;
  requestId: string | null;
  idempotencyReplayed?: boolean;
};

export type ApiFailure = Error & {
  problem?: ProblemDetails;
  requestId?: string | null;
  retryAfter?: string | null;
};
