export const CUSTOM_FIELD_VERSION_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type CustomFieldVersionStatus = (typeof CUSTOM_FIELD_VERSION_STATUSES)[number];

export const CUSTOM_FIELD_TARGET_TYPES = ['CLAIM', 'RENEWAL', 'COLLECTION'] as const;
export type CustomFieldTargetType = (typeof CUSTOM_FIELD_TARGET_TYPES)[number];

export const CUSTOM_FIELD_VALUE_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM'] as const;
export type CustomFieldValueType = (typeof CUSTOM_FIELD_VALUE_TYPES)[number];

export const CUSTOM_FIELD_SENSITIVITY_CLASSIFICATIONS = ['PUBLIC_SAFE', 'STAFF_ONLY'] as const;
export type CustomFieldSensitivityClassification = (typeof CUSTOM_FIELD_SENSITIVITY_CLASSIFICATIONS)[number];

export type CustomFieldValidationScalar = string | number | boolean;

export interface CustomFieldDefinitionProps {
  id: string;
  fieldKey: string;
  targetType: CustomFieldTargetType;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomFieldVersionProps {
  id: string;
  definitionId: string;
  versionNumber: number;
  valueType: CustomFieldValueType;
  displayName: string;
  validationMetadata: Readonly<Record<string, CustomFieldValidationScalar>>;
  enumValues: readonly string[];
  sensitivityClassification: CustomFieldSensitivityClassification;
  status: CustomFieldVersionStatus;
  sourceClassification: string;
  createdByType: 'ADMINISTRATOR';
  createdById: string;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
}
