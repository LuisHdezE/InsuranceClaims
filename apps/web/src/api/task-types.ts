export type ClaimTaskType =
  | 'CLAIM_REVIEW'
  | 'EVIDENCE_REVIEW'
  | 'MISSING_DOCUMENT_FOLLOWUP'
  | 'CUSTOMER_FOLLOWUP'
  | 'CLOSURE_REVIEW';

export type ClaimTaskStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type ClaimTaskPriority = 'NORMAL' | 'HIGH';
export type ClaimTaskQueue = 'CLAIMS';
export type ClaimTaskCancellationReason = 'NO_LONGER_REQUIRED' | 'DUPLICATE' | 'CREATED_IN_ERROR';
export type ClaimTaskActorType = 'SYSTEM' | 'OPERATOR' | 'SUPERVISOR' | 'ADMINISTRATOR' | 'AUTOMATION';

export type ListTasksInput = {
  page?: number;
  pageSize?: number;
  status?: ClaimTaskStatus;
  type?: ClaimTaskType;
  claimId?: string;
  priority?: ClaimTaskPriority;
  assignedOperatorId?: string;
  overdue?: boolean;
};

export type CreateClaimTaskInput = {
  type: ClaimTaskType;
  title: string;
  description?: string | null;
  priority?: ClaimTaskPriority;
  queue?: ClaimTaskQueue;
  assignedOperatorId?: string | null;
  dueAt?: string | null;
};

export type UpdateClaimTaskInput = {
  expectedVersion: number;
  assignedOperatorId?: string | null;
  queue?: ClaimTaskQueue;
  priority?: ClaimTaskPriority;
  dueAt?: string | null;
};

export type CancelClaimTaskInput = {
  expectedVersion: number;
  reason: ClaimTaskCancellationReason;
};

export type ClaimTaskProjection = {
  taskId: string;
  claimId: string;
  trackingCode: string | null;
  policyReference: string | null;
  vehicleReference: string | null;
  type: ClaimTaskType;
  title: string;
  description: string | null;
  status: ClaimTaskStatus;
  priority: ClaimTaskPriority;
  queue: ClaimTaskQueue;
  assignedOperatorId: string | null;
  dueAt: string | null;
  version: number;
  createdByType: ClaimTaskActorType;
  createdById: string | null;
  correlationId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedById: string | null;
  cancelledAt: string | null;
  cancelledById: string | null;
  cancellationReason: ClaimTaskCancellationReason | null;
};

export type ClaimTasksPageResponse = {
  items: ClaimTaskProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
