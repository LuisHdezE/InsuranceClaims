export type AutomationVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type AutomationTriggerEvent =
  | 'CLAIM_CREATED'
  | 'CLAIM_STATE_TRANSITIONED'
  | 'CLAIM_TASK_COMPLETED'
  | 'COMMUNICATION_DELIVERED'
  | 'INBOUND_EVENT_PROCESSED'
  | 'SCHEDULED_CHECK';
export type AutomationConditionOperator = 'EQ' | 'NEQ' | 'IN' | 'NOT_IN' | 'EXISTS' | 'NOT_EXISTS';
export type AutomationScalar = string | number | boolean | null;
export type AutomationActionType =
  | 'CREATE_TASK'
  | 'MOVE_OPERATIONAL_STAGE'
  | 'REQUEST_COMMUNICATION'
  | 'ADD_OPERATIONAL_TAG'
  | 'NOTIFY_OPERATOR'
  | 'PAUSE_AUTOMATION'
  | 'UPDATE_APPROVED_FIELD'
  | 'SCHEDULE_CHECK';

export interface AutomationConditionProjection {
  field: string;
  operator: AutomationConditionOperator;
  value?: AutomationScalar | AutomationScalar[];
}

export interface AutomationActionProjection {
  key: string;
  type: AutomationActionType;
  parameters: Record<string, AutomationScalar>;
}

export interface AutomationContentProjection {
  when: { eventType: AutomationTriggerEvent };
  if: AutomationConditionProjection[];
  wait: { delaySeconds: number } | null;
  then: AutomationActionProjection[];
}

export interface AutomationVersionProjection {
  versionId: string;
  versionNumber: number;
  status: AutomationVersionStatus;
  content: AutomationContentProjection;
  sourceClassification: string;
  createdByType: string;
  createdById: string | null;
  createdAt: string;
  activatedAt: string | null;
  retiredAt: string | null;
}

export interface AutomationDefinitionProjection {
  definitionId: string;
  key: string;
  displayName: string;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  versions: AutomationVersionProjection[];
}

export interface AutomationPageResponse {
  items: AutomationDefinitionProjection[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface AutomationListInput {
  page?: number;
  pageSize?: number;
}

export interface CreateAutomationInput {
  key: string;
  displayName: string;
  sourceClassification: string;
  content: AutomationContentProjection;
}

export interface CreateAutomationVersionInput {
  expectedDefinitionVersion: number;
  sourceClassification: string;
  content: AutomationContentProjection;
}

export interface ActivateAutomationVersionInput {
  expectedDefinitionVersion: number;
}

export interface UpdateAutomationStateInput {
  expectedDefinitionVersion: number;
  enabled: boolean;
}
