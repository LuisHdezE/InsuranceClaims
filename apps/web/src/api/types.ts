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

export type OperatorLoginRequest = {
  login: string;
  password: string;
};

export type OperatorIdentity = {
  id: string;
  login: string;
  role: 'CLAIMS_OPERATOR';
};

export type OperatorLoginResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: 900;
  operator: OperatorIdentity;
};

export type ClaimSummary = {
  claimId: string;
  trackingCode: string;
  status: ClaimStatus;
  occurredAt: string;
  policyReference: string;
  vehicleReference: string;
  createdAt: string;
};

export type ClaimsPageResponse = {
  items: ClaimSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type EvidenceMetadata = {
  evidenceId: string;
  mediaType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  displayFilename: string | null;
  createdAt: string;
};

export type StatusHistoryEntry = {
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  actorType: 'SYSTEM' | 'OPERATOR';
  actorId: string | null;
  occurredAt: string;
};

export type AuditEventSummary = {
  eventCode: 'CLAIM_CREATED' | 'CLAIM_STATE_TRANSITIONED' | 'AUTH_LOGIN_SUCCEEDED' | 'AUTH_LOGIN_FAILED';
  occurredAt: string;
  actorType: 'ANONYMOUS' | 'CUSTOMER_PUBLIC' | 'OPERATOR';
  actorId: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  requestId: string | null;
};

export type OperatorClaimDetailResponse = {
  claimId: string;
  trackingCode: string;
  policyReference: string;
  vehicleReference: string;
  verifiedCustomerLabel: string | null;
  eventType: string;
  occurredAt: string;
  locationText: string;
  description: string;
  status: ClaimStatus;
  allowedTransitions: ClaimStatus[];
  evidence: EvidenceMetadata[];
  history: StatusHistoryEntry[];
  auditEvents: AuditEventSummary[];
  createdAt: string;
  updatedAt: string;
};

export type TransitionClaimStatusRequest = {
  expectedFromStatus: ClaimStatus;
  toStatus: ClaimStatus;
};

export type TransitionClaimStatusResponse = {
  claimId: string;
  fromStatus: ClaimStatus;
  toStatus: ClaimStatus;
  status: ClaimStatus;
  allowedTransitions: ClaimStatus[];
  transitionedAt: string;
};

export type EvidenceDownload = {
  bytes: ArrayBuffer;
  mediaType: string;
  filename: string | null;
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
