export type CommunicationChannel = 'EMAIL' | 'WHATSAPP';
export type CommunicationTemplateVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type CommunicationVariableType = 'STRING' | 'NUMBER' | 'BOOLEAN';

export interface CommunicationTemplateVersionProjection {
  versionId: string;
  versionNumber: number;
  status: CommunicationTemplateVersionStatus;
  subject: string | null;
  body: string;
  variableSchema: Record<string, CommunicationVariableType>;
  sourceClassification: string;
  createdByType: string;
  createdById: string | null;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
}

export interface CommunicationTemplateDefinitionProjection {
  definitionId: string;
  key: string;
  channel: CommunicationChannel;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  versions: CommunicationTemplateVersionProjection[];
}

export interface CommunicationTemplatePageResponse {
  items: CommunicationTemplateDefinitionProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CommunicationTemplateListInput {
  page?: number;
  pageSize?: number;
}

export interface CreateCommunicationTemplateInput {
  key: string;
  channel: CommunicationChannel;
  subject?: string | null;
  body: string;
  variableSchema: Record<string, CommunicationVariableType>;
  sourceClassification: string;
}

export interface CreateCommunicationTemplateVersionInput {
  expectedDefinitionVersion: number;
  subject?: string | null;
  body: string;
  variableSchema: Record<string, CommunicationVariableType>;
  sourceClassification: string;
}

export interface ActivateCommunicationTemplateVersionInput {
  expectedDefinitionVersion: number;
}

export interface UpdateCommunicationTemplateStateInput {
  expectedDefinitionVersion: number;
  enabled: boolean;
}
