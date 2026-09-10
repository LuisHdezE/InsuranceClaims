import type { ClaimStatus } from './types';

export type MoveOperationalStageRequest = {
  toStageKey: string;
  expectedVersion: number;
};

export type PipelineStageProjection = {
  stageKey: string;
  displayName: string;
  sortOrder: number;
};

export type PipelineWorkItemResponse = {
  workItemId: string;
  consumerType: 'CLAIM';
  consumerId: string;
  claimId: string;
  pipelineDefinitionId: string;
  pipelineVersionId: string;
  currentStage: PipelineStageProjection | null;
  allowedNextStageKeys: string[];
  version: number;
  claimStatus: ClaimStatus;
  createdAt: string;
  updatedAt: string;
};

export type ClaimsOperationalMetricsInput = {
  from: string;
  to: string;
};

export type ClaimsOperationalStageMetric = {
  stageKey: string;
  displayName: string;
  count: number;
};

export type ClaimsOperationalMetricsResponse = {
  window: {
    from: string;
    to: string;
    semantics: '[from,to)';
  };
  generatedAt: string;
  openClaims: number;
  reportedInWindow: number;
  claimsByStatus: Record<ClaimStatus, number>;
  claimsByOperationalStage: ClaimsOperationalStageMetric[];
  evidencePendingReviewClaims: number;
  openTasks: number;
  overdueTasks: number;
  closedClaims: number;
};
