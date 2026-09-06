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

export type ClaimStatus =
  | 'RECEIVED'
  | 'UNDER_REVIEW'
  | 'OBSERVED'
  | 'APPROVED'
  | 'IN_REPAIR'
  | 'CLOSED';

export type TrackClaimRequest = {
  trackingCode: string;
  policyReference: string;
};

export type CustomerClaimSummary = {
  vehicleReference: string;
  eventType: string;
  occurredAt: string;
};

export type CustomerTimelineEntry = {
  status: ClaimStatus;
  occurredAt: string;
};

export type CustomerClaimStatusResponse = {
  trackingCode: string;
  summary: CustomerClaimSummary;
  status: ClaimStatus;
  timeline: CustomerTimelineEntry[];
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
  network?: boolean;
};
