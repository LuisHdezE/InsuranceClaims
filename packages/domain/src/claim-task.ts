export const CLAIM_TASK_TYPES = [
  'CLAIM_REVIEW',
  'EVIDENCE_REVIEW',
  'MISSING_DOCUMENT_FOLLOWUP',
  'CUSTOMER_FOLLOWUP',
  'CLOSURE_REVIEW',
] as const;

export const CLAIM_TASK_STATUSES = ['OPEN', 'COMPLETED'] as const;
export const CLAIM_TASK_PRIORITIES = ['NORMAL', 'HIGH'] as const;
export const CLAIM_TASK_QUEUES = ['CLAIMS'] as const;

export type ClaimTaskType = (typeof CLAIM_TASK_TYPES)[number];
export type ClaimTaskStatus = (typeof CLAIM_TASK_STATUSES)[number];
export type ClaimTaskPriority = (typeof CLAIM_TASK_PRIORITIES)[number];
export type ClaimTaskQueue = (typeof CLAIM_TASK_QUEUES)[number];
export type ClaimTaskActorType = 'SYSTEM' | 'OPERATOR';

export interface ClaimTaskProps {
  id: string;
  claimId: string;
  type: ClaimTaskType;
  title: string;
  status: ClaimTaskStatus;
  priority: ClaimTaskPriority;
  queue: ClaimTaskQueue;
  assignedOperatorId: string | null;
  dueAt: Date | null;
  createdByType: ClaimTaskActorType;
  createdById: string | null;
  sourceKey: string | null;
  correlationId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  completedById: string | null;
}

export class ClaimTaskStateConflictError extends Error {
  constructor(
    readonly expectedStatus: ClaimTaskStatus,
    readonly actualStatus: ClaimTaskStatus,
  ) {
    super(`Expected task status ${expectedStatus} but task is ${actualStatus}.`);
    this.name = 'ClaimTaskStateConflictError';
  }
}

export class ClaimTask {
  private constructor(private readonly props: ClaimTaskProps) {}

  static create(input: Omit<ClaimTaskProps, 'status' | 'completedAt' | 'completedById'>): ClaimTask {
    return new ClaimTask({ ...input, status: 'OPEN', completedAt: null, completedById: null });
  }

  static rehydrate(props: ClaimTaskProps): ClaimTask {
    return new ClaimTask({ ...props });
  }

  snapshot(): ClaimTaskProps {
    return { ...this.props };
  }

  complete(expectedStatus: ClaimTaskStatus, operatorId: string, at: Date): void {
    if (this.props.status !== expectedStatus) {
      throw new ClaimTaskStateConflictError(expectedStatus, this.props.status);
    }
    if (this.props.status !== 'OPEN') {
      throw new ClaimTaskStateConflictError('OPEN', this.props.status);
    }
    this.props.status = 'COMPLETED';
    this.props.completedAt = at;
    this.props.completedById = operatorId;
  }
}
