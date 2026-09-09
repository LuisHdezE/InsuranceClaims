export const COLLECTION_CASE_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type CollectionCaseStatus = (typeof COLLECTION_CASE_STATUSES)[number];
export type CollectionCaseTerminalStatus = Exclude<CollectionCaseStatus, 'OPEN'>;

export interface CollectionCaseProps {
  id: string;
  customerId: string;
  policyId: string;
  status: CollectionCaseStatus;
  paymentState: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

export class CollectionCaseVersionConflictError extends Error {
  constructor(readonly expectedVersion: number, readonly actualVersion: number) {
    super(`Expected CollectionCase version ${expectedVersion} but found ${actualVersion}.`);
    this.name = 'CollectionCaseVersionConflictError';
  }
}

export class InvalidCollectionCaseTransitionError extends Error {
  constructor(readonly fromStatus: CollectionCaseStatus, readonly toStatus: CollectionCaseTerminalStatus) {
    super(`CollectionCase transition ${fromStatus} -> ${toStatus} is not allowed.`);
    this.name = 'InvalidCollectionCaseTransitionError';
  }
}

export class InvalidCollectionPaymentStateError extends Error {
  constructor() {
    super('Collection payment state must be a non-empty server-approved value of at most 80 characters.');
    this.name = 'InvalidCollectionPaymentStateError';
  }
}

export function isCollectionCaseStatus(value: unknown): value is CollectionCaseStatus {
  return typeof value === 'string' && (COLLECTION_CASE_STATUSES as readonly string[]).includes(value);
}

export function isCollectionCaseTerminalStatus(value: unknown): value is CollectionCaseTerminalStatus {
  return value === 'COMPLETED' || value === 'CANCELLED';
}

export function allowedCollectionCaseTransitions(status: CollectionCaseStatus): readonly CollectionCaseTerminalStatus[] {
  return status === 'OPEN' ? ['COMPLETED', 'CANCELLED'] : [];
}

export class CollectionCase {
  private constructor(private readonly props: CollectionCaseProps) {}

  static create(input: Omit<CollectionCaseProps, 'status' | 'version' | 'completedAt' | 'cancelledAt'>): CollectionCase {
    return new CollectionCase({
      ...input,
      status: 'OPEN',
      version: 1,
      completedAt: null,
      cancelledAt: null,
    });
  }

  static rehydrate(props: CollectionCaseProps): CollectionCase {
    return new CollectionCase({ ...props });
  }

  snapshot(): CollectionCaseProps {
    return { ...this.props };
  }

  allowedTransitions(): readonly CollectionCaseTerminalStatus[] {
    return allowedCollectionCaseTransitions(this.props.status);
  }

  transition(toStatus: CollectionCaseTerminalStatus, expectedVersion: number, at: Date): { fromStatus: 'OPEN'; toStatus: CollectionCaseTerminalStatus } {
    if (this.props.version !== expectedVersion) {
      throw new CollectionCaseVersionConflictError(expectedVersion, this.props.version);
    }
    if (this.props.status !== 'OPEN') {
      throw new InvalidCollectionCaseTransitionError(this.props.status, toStatus);
    }

    this.props.status = toStatus;
    this.props.version += 1;
    this.props.updatedAt = at;
    if (toStatus === 'COMPLETED') this.props.completedAt = at;
    if (toStatus === 'CANCELLED') this.props.cancelledAt = at;
    return { fromStatus: 'OPEN', toStatus };
  }

  changePaymentState(approvedPaymentState: string, expectedVersion: number, at: Date): { fromPaymentState: string | null; toPaymentState: string } {
    if (this.props.version !== expectedVersion) {
      throw new CollectionCaseVersionConflictError(expectedVersion, this.props.version);
    }
    const normalized = approvedPaymentState.trim();
    if (!normalized || normalized.length > 80) {
      throw new InvalidCollectionPaymentStateError();
    }

    const fromPaymentState = this.props.paymentState;
    this.props.paymentState = normalized;
    this.props.version += 1;
    this.props.updatedAt = at;
    return { fromPaymentState, toPaymentState: normalized };
  }
}
