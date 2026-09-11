export type GuidanceVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface GuidanceVersionProjection {
  versionId: string;
  versionNumber: number;
  insurerContextReference: string;
  guidanceCategory: string;
  documentCategories: string[];
  instructions: string[];
  assistanceMetadata: Record<string, string>;
  status: GuidanceVersionStatus;
  sourceClassification: string;
  createdByType: string;
  createdById: string | null;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
}

export interface GuidanceDefinitionProjection {
  definitionId: string;
  key: string;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  versions: GuidanceVersionProjection[];
}

export interface GuidancePageResponse {
  items: GuidanceDefinitionProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface GuidanceListInput {
  page?: number;
  pageSize?: number;
}

export interface GuidanceVersionContentInput {
  insurerContextReference: string;
  guidanceCategory: string;
  documentCategories: string[];
  instructions: string[];
  assistanceMetadata: Record<string, string>;
  sourceClassification: string;
}

export interface CreateGuidanceInput extends GuidanceVersionContentInput {
  key: string;
}

export interface CreateGuidanceVersionInput extends GuidanceVersionContentInput {
  expectedDefinitionVersion: number;
}

export interface ActivateGuidanceVersionInput {
  expectedDefinitionVersion: number;
}

export interface UpdateGuidanceStateInput {
  expectedDefinitionVersion: number;
  enabled: boolean;
}
