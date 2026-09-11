export type PipelineConsumerType = 'CLAIM' | 'RENEWAL' | 'COLLECTION';
export type PipelineVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface PipelineStageProjection {
  stageKey: string;
  displayName: string;
  sortOrder: number;
  reportingFlags: Record<string, boolean>;
  allowedNextStageKeys: string[];
}

export interface PipelineVersionProjection {
  versionId: string;
  versionNumber: number;
  status: PipelineVersionStatus;
  sourceClassification: string;
  createdByType: string;
  createdById: string | null;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
  stages: PipelineStageProjection[];
}

export interface PipelineDefinitionProjection {
  definitionId: string;
  key: string;
  consumerType: PipelineConsumerType;
  displayName: string;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  versions: PipelineVersionProjection[];
}

export interface PipelinePageResponse {
  items: PipelineDefinitionProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PipelineListInput {
  page?: number;
  pageSize?: number;
}

export interface PipelineStageInput {
  stageKey: string;
  displayName: string;
  sortOrder: number;
  reportingFlags: Record<string, boolean>;
  allowedNextStageKeys: string[];
}

export interface CreatePipelineInput {
  key: string;
  consumerType: PipelineConsumerType;
  displayName: string;
  sourceClassification: string;
  stages: PipelineStageInput[];
}

export interface CreatePipelineVersionInput {
  expectedDefinitionVersion: number;
  sourceClassification: string;
  stages: PipelineStageInput[];
}

export interface ActivatePipelineVersionInput {
  expectedDefinitionVersion: number;
}

export interface UpdatePipelineStateInput {
  expectedDefinitionVersion: number;
  enabled: boolean;
}
