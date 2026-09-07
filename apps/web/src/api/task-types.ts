export type ClaimTaskType =
  | 'CLAIM_REVIEW'
  | 'EVIDENCE_REVIEW'
  | 'MISSING_DOCUMENT_FOLLOWUP'
  | 'CUSTOMER_FOLLOWUP'
  | 'CLOSURE_REVIEW';

export type ClaimTaskStatus = 'OPEN' | 'COMPLETED';
export type ClaimTaskPriority = 'NORMAL' | 'HIGH';

export type ClaimTaskProjection = {
  taskId: string;
  claimId: string;
  trackingCode: string | null;
  policyReference: string | null;
  vehicleReference: string | null;
  type: ClaimTaskType;
  title: string;
  status: ClaimTaskStatus;
  priority: ClaimTaskPriority;
  queue: 'CLAIMS';
  assignedOperatorId: string | null;
  dueAt: string | null;
  createdByType: 'SYSTEM' | 'OPERATOR';
  createdById: string | null;
  correlationId: string | null;
  createdAt: string;
  completedAt: string | null;
  completedById: string | null;
};

export type ClaimTasksPageResponse = {
  items: ClaimTaskProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
