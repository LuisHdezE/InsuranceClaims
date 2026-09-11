export type RenewalCaseStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type RenewalTerminalStatus = 'COMPLETED' | 'CANCELLED';

export interface RenewalStageProjection {
  stageKey: string;
  displayName: string;
  sortOrder: number;
}

export interface RenewalPipelineProjection {
  workItemId: string;
  consumerType: 'RENEWAL';
  consumerId: string;
  pipelineDefinitionId: string;
  pipelineVersionId: string;
  currentStage: RenewalStageProjection | null;
  allowedNextStageKeys: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalCustomerSummary {
  customerRef: string;
  displayName: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface RenewalPolicySummary {
  policyReference: string;
  insurerReference: string | null;
  recordStatus: 'ACTIVE' | 'INACTIVE';
}

export interface RenewalCaseProjection {
  renewalId: string;
  customerId: string;
  policyId: string;
  status: RenewalCaseStatus;
  allowedTransitions: RenewalTerminalStatus[];
  version: number;
  customer: RenewalCustomerSummary | null;
  policy: RenewalPolicySummary | null;
  pipeline: RenewalPipelineProjection | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface RenewalPageResponse {
  items: RenewalCaseProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface RenewalListInput {
  page?: number;
  pageSize?: number;
}

export interface TransitionRenewalInput {
  toStatus: RenewalTerminalStatus;
  expectedVersion: number;
}

export interface MoveRenewalStageInput {
  toStageKey: string;
  expectedVersion: number;
}
