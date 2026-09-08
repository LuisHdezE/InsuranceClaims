export const CLAIM_TASK_TYPES = [
  'CLAIM_REVIEW',
  'EVIDENCE_REVIEW',
  'MISSING_DOCUMENT_FOLLOWUP',
  'CUSTOMER_FOLLOWUP',
  'CLOSURE_REVIEW',
] as const;

export const CLAIM_TASK_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export const CLAIM_TASK_PRIORITIES = ['NORMAL', 'HIGH'] as const;
export const CLAIM_TASK_QUEUES = ['CLAIMS'] as const;
export const CLAIM_TASK_CANCELLATION_REASONS = ['NO_LONGER_REQUIRED', 'DUPLICATE', 'CREATED_IN_ERROR'] as const;

export type ClaimTaskType = (typeof CLAIM_TASK_TYPES)[number];
export type ClaimTaskStatus = (typeof CLAIM_TASK_STATUSES)[number];
export type ClaimTaskPriority = (typeof CLAIM_TASK_PRIORITIES)[number];
export type ClaimTaskQueue = (typeof CLAIM_TASK_QUEUES)[number];
export type ClaimTaskCancellationReason = (typeof CLAIM_TASK_CANCELLATION_REASONS)[number];
export type ClaimTaskActorType = 'SYSTEM' | 'OPERATOR' | 'SUPERVISOR' | 'ADMINISTRATOR' | 'AUTOMATION';

export interface ClaimTaskProps {
  id: string;
  claimId: string;
  type: ClaimTaskType;
  title: string;
  description: string | null;
  status: ClaimTaskStatus;
  priority: ClaimTaskPriority;
  queue: ClaimTaskQueue;
  assignedOperatorId: string | null;
  dueAt: Date | null;
  createdByType: ClaimTaskActorType;
  createdById: string | null;
  sourceKey: string | null;
  correlationId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  completedById: string | null;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationReason: ClaimTaskCancellationReason | null;
}

export interface ClaimTaskMutableFields {
  assignedOperatorId?: string | null;
  queue?: ClaimTaskQueue;
  priority?: ClaimTaskPriority;
  dueAt?: Date | null;
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

export class ClaimTaskVersionConflictError extends Error {
  constructor(
    readonly expectedVersion: number,
    readonly actualVersion: number,
  ) {
    super(`Expected task version ${expectedVersion} but task is version ${actualVersion}.`);
    this.name = 'ClaimTaskVersionConflictError';
  }
}

export class InvalidClaimTaskStateError extends Error {
  constructor(readonly actualStatus: ClaimTaskStatus) {
    super(`Task cannot be mutated from ${actualStatus}.`);
    this.name = 'InvalidClaimTaskStateError';
  }
}

export class ClaimTask {
  private constructor(private readonly props: ClaimTaskProps) {}

  static create(input: Omit<ClaimTaskProps, 'status' | 'version' | 'updatedAt' | 'completedAt' | 'completedById' | 'cancelledAt' | 'cancelledById' | 'cancellationReason'>): ClaimTask {
    return new ClaimTask({
      ...input,
      status: 'OPEN',
      version: 1,
      updatedAt: input.createdAt,
      completedAt: null,
      completedById: null,
      cancelledAt: null,
      cancelledById: null,
      cancellationReason: null,
    });
  }

  static rehydrate(props: ClaimTaskProps): ClaimTask {
    return new ClaimTask({ ...props });
  }

  snapshot(): ClaimTaskProps {
    return { ...this.props };
  }

  update(expectedVersion: number, changes: ClaimTaskMutableFields, at: Date): void {
    this.assertMutable(expectedVersion);
    if (Object.hasOwn(changes, 'assignedOperatorId')) this.props.assignedOperatorId = changes.assignedOperatorId ?? null;
    if (changes.queue !== undefined) this.props.queue = changes.queue;
    if (changes.priority !== undefined) this.props.priority = changes.priority;
    if (Object.hasOwn(changes, 'dueAt')) this.props.dueAt = changes.dueAt ?? null;
    this.bump(at);
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
    this.bump(at);
  }

  cancel(expectedVersion: number, actorId: string, reason: ClaimTaskCancellationReason, at: Date): void {
    this.assertMutable(expectedVersion);
    this.props.status = 'CANCELLED';
    this.props.cancelledAt = at;
    this.props.cancelledById = actorId;
    this.props.cancellationReason = reason;
    this.bump(at);
  }

  private assertMutable(expectedVersion: number): void {
    if (this.props.version !== expectedVersion) {
      throw new ClaimTaskVersionConflictError(expectedVersion, this.props.version);
    }
    if (this.props.status !== 'OPEN') {
      throw new InvalidClaimTaskStateError(this.props.status);
    }
  }

  private bump(at: Date): void {
    this.props.version += 1;
    this.props.updatedAt = at;
  }
}
