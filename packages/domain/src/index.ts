export const CLAIM_STATUSES = [
  'RECEIVED',
  'UNDER_REVIEW',
  'OBSERVED',
  'APPROVED',
  'IN_REPAIR',
  'CLOSED',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

const TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  RECEIVED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['OBSERVED', 'APPROVED'],
  OBSERVED: ['UNDER_REVIEW'],
  APPROVED: ['IN_REPAIR', 'CLOSED'],
  IN_REPAIR: ['CLOSED'],
  CLOSED: [],
};

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === 'string' && (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function allowedTransitionsFor(status: ClaimStatus): readonly ClaimStatus[] {
  return TRANSITIONS[status];
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly fromStatus: ClaimStatus,
    readonly toStatus: ClaimStatus,
  ) {
    super(`Transition ${fromStatus} -> ${toStatus} is not allowed.`);
    this.name = 'InvalidTransitionError';
  }
}

export class ClaimStateConflictError extends Error {
  constructor(
    readonly expectedStatus: ClaimStatus,
    readonly actualStatus: ClaimStatus,
  ) {
    super(`Expected ${expectedStatus} but claim is ${actualStatus}.`);
    this.name = 'ClaimStateConflictError';
  }
}

export interface ClaimProps {
  id: string;
  trackingCode: string;
  policyReference: string;
  vehicleReference: string;
  verifiedCustomerLabel: string | null;
  eventType: string;
  occurredAt: Date;
  locationText: string;
  description: string;
  status: ClaimStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class Claim {
  private constructor(private readonly props: ClaimProps) {}

  static create(input: Omit<ClaimProps, 'status'>): Claim {
    return new Claim({ ...input, status: 'RECEIVED' });
  }

  static rehydrate(props: ClaimProps): Claim {
    return new Claim({ ...props });
  }

  snapshot(): ClaimProps {
    return { ...this.props };
  }

  get status(): ClaimStatus {
    return this.props.status;
  }

  allowedTransitions(): readonly ClaimStatus[] {
    return allowedTransitionsFor(this.props.status);
  }

  transition(toStatus: ClaimStatus, expectedFromStatus: ClaimStatus, at: Date): { fromStatus: ClaimStatus; toStatus: ClaimStatus } {
    if (this.props.status !== expectedFromStatus) {
      throw new ClaimStateConflictError(expectedFromStatus, this.props.status);
    }
    if (!TRANSITIONS[this.props.status].includes(toStatus)) {
      throw new InvalidTransitionError(this.props.status, toStatus);
    }
    const fromStatus = this.props.status;
    this.props.status = toStatus;
    this.props.updatedAt = at;
    return { fromStatus, toStatus };
  }
}
