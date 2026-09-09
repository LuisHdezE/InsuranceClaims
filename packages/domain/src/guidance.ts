export const GUIDANCE_VERSION_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type GuidanceVersionStatus = (typeof GUIDANCE_VERSION_STATUSES)[number];

export type GuidanceActorType = 'SYSTEM' | 'ADMINISTRATOR';

export interface InsurerGuidanceDefinitionProps {
  id: string;
  key: string;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsurerGuidanceVersionProps {
  id: string;
  definitionId: string;
  versionNumber: number;
  insurerContextReference: string;
  guidanceCategory: string;
  documentCategories: readonly string[];
  instructions: readonly string[];
  assistanceMetadata: Readonly<Record<string, string>>;
  status: GuidanceVersionStatus;
  sourceClassification: string;
  createdByType: GuidanceActorType;
  createdById: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
}
