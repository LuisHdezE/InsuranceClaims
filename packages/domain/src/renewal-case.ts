export const RENEWAL_CASE_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const;
export type RenewalCaseStatus = (typeof RENEWAL_CASE_STATUSES)[number];
export type RenewalCaseTerminalStatus = Exclude<RenewalCaseStatus, 'OPEN'>;

export interface RenewalCaseProps {
  id: string;
  customerId: string;
  policyId: string;
  status: RenewalCaseStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
}

export class RenewalCaseVersionConflictError extends Error {
  constructor(readonly expectedVersion: number, readonly actualVersion: number) {
    super(`Expected RenewalCase version ${expectedVersion} but found ${actualVersion}.`);
    this.name = 'RenewalCaseVersionConflictError';
  }
}

export class InvalidRenewalCaseTransitionError extends Error {
  constructor(readonly fromStatus: RenewalCaseStatus, readonly toStatus: RenewalCaseTerminalStatus) {
    super(`RenewalCase transition ${fromStatus} -> ${toStatus} is not allowed.`);
    this.name = 'InvalidRenewalCaseTransitionError';
  }
}

export function isRenewalCaseStatus(value: unknown): value is RenewalCaseStatus {
  return typeof value === 'string' && (RENEWAL_CASE_STATUSES as readonly string[]).includes(value);
}

export function isRenewalCaseTerminalStatus(value: unknown): value is RenewalCaseTerminalStatus {
  return value === 'COMPLETED' || value === 'CANCELLED';
}

export function allowedRenewalCaseTransitions(status: RenewalCaseStatus): readonly RenewalCaseTerminalStatus[] {
  return status === 'OPEN' ? ['COMPLETED', 'CANCELLED'] : [];
}

export class RenewalCase {
  private constructor(private readonly props: RenewalCaseProps) {}

  static create(input: Omit<RenewalCaseProps, 'status' | 'version' | 'completedAt' | 'cancelledAt'>): RenewalCase {
    return new RenewalCase({
      ...input,
      status: 'OPEN',
      version: 1,
      completedAt: null,
      cancelledAt: null,
    });
  }

  static rehydrate(props: RenewalCaseProps): RenewalCase {
    return new RenewalCase({ ...props });
  }

  snapshot(): RenewalCaseProps {
    return { ...this.props };
  }

  allowedTransitions(): readonly RenewalCaseTerminalStatus[] {
    return allowedRenewalCaseTransitions(this.props.status);
  }

  transition(toStatus: RenewalCaseTerminalStatus, expectedVersion: number, at: Date): { fromStatus: 'OPEN'; toStatus: RenewalCaseTerminalStatus } {
    if (this.props.version !== expectedVersion) {
      throw new RenewalCaseVersionConflictError(expectedVersion, this.props.version);
    }
    if (this.props.status !== 'OPEN') {
      throw new InvalidRenewalCaseTransitionError(this.props.status, toStatus);
    }

    this.props.status = toStatus;
    this.props.version += 1;
    this.props.updatedAt = at;
    if (toStatus === 'COMPLETED') this.props.completedAt = at;
    if (toStatus === 'CANCELLED') this.props.cancelledAt = at;
    return { fromStatus: 'OPEN', toStatus };
  }
}
