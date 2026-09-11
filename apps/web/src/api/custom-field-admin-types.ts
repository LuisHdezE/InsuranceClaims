export type CustomFieldTargetType = 'CLAIM' | 'RENEWAL' | 'COLLECTION';
export type CustomFieldValueType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'ENUM';
export type CustomFieldSensitivityClassification = 'PUBLIC_SAFE' | 'STAFF_ONLY';
export type CustomFieldVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type CustomFieldValidationScalar = string | number | boolean;

export interface CustomFieldVersionProjection {
  versionId: string;
  versionNumber: number;
  valueType: CustomFieldValueType;
  displayName: string;
  validationMetadata: Record<string, CustomFieldValidationScalar>;
  enumValues: string[];
  sensitivityClassification: CustomFieldSensitivityClassification;
  status: CustomFieldVersionStatus;
  sourceClassification: string;
  createdByType: string;
  createdById: string | null;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
}

export interface CustomFieldDefinitionProjection {
  definitionId: string;
  fieldKey: string;
  targetType: CustomFieldTargetType;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  versions: CustomFieldVersionProjection[];
}

export interface CustomFieldPageResponse {
  items: CustomFieldDefinitionProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CustomFieldListInput {
  page?: number;
  pageSize?: number;
}

export interface CustomFieldVersionContentInput {
  valueType: CustomFieldValueType;
  displayName: string;
  validationMetadata: Record<string, CustomFieldValidationScalar>;
  enumValues: string[];
  sensitivityClassification: CustomFieldSensitivityClassification;
  sourceClassification: string;
}

export interface CreateCustomFieldInput extends CustomFieldVersionContentInput {
  fieldKey: string;
  targetType: CustomFieldTargetType;
}

export interface CreateCustomFieldVersionInput extends CustomFieldVersionContentInput {
  expectedDefinitionVersion: number;
}

export interface ActivateCustomFieldVersionInput {
  expectedDefinitionVersion: number;
}

export interface UpdateCustomFieldStateInput {
  expectedDefinitionVersion: number;
  enabled: boolean;
}
