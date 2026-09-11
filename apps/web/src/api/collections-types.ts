export type CollectionCaseStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED';
export type CollectionTerminalStatus = 'COMPLETED' | 'CANCELLED';

export interface CollectionStageProjection {
  stageKey: string;
  displayName: string;
  sortOrder: number;
}

export interface CollectionPipelineProjection {
  workItemId: string;
  consumerType: 'COLLECTION';
  consumerId: string;
  pipelineDefinitionId: string;
  pipelineVersionId: string;
  currentStage: CollectionStageProjection | null;
  allowedNextStageKeys: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionCustomerSummary {
  customerRef: string;
  displayName: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface CollectionPolicySummary {
  policyReference: string;
  insurerReference: string | null;
  recordStatus: 'ACTIVE' | 'INACTIVE';
}

export interface CollectionCaseProjection {
  collectionId: string;
  customerId: string;
  policyId: string;
  status: CollectionCaseStatus;
  paymentState: string | null;
  allowedTransitions: CollectionTerminalStatus[];
  version: number;
  customer: CollectionCustomerSummary | null;
  policy: CollectionPolicySummary | null;
  pipeline: CollectionPipelineProjection | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface CollectionPageResponse {
  items: CollectionCaseProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CollectionListInput {
  page?: number;
  pageSize?: number;
}

export interface TransitionCollectionInput {
  toStatus: CollectionTerminalStatus;
  expectedVersion: number;
}

export interface MoveCollectionStageInput {
  toStageKey: string;
  expectedVersion: number;
}

export interface UpdateCollectionPaymentStateInput {
  paymentState: string;
  expectedVersion: number;
}
