export type AutomationVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';
export type AutomationActorType = 'SYSTEM' | 'ADMINISTRATOR' | 'AUTOMATION';

export type AutomationConditionOperator = 'EQ' | 'NEQ' | 'IN' | 'NOT_IN' | 'EXISTS' | 'NOT_EXISTS';
export type AutomationScalar = string | number | boolean | null;

export interface AutomationTrigger {
  eventType: string;
}

export interface AutomationCondition {
  field: string;
  operator: AutomationConditionOperator;
  value?: AutomationScalar | readonly AutomationScalar[];
}

export interface AutomationWait {
  delaySeconds: number;
}

export type AutomationActionType =
  | 'CREATE_TASK'
  | 'MOVE_OPERATIONAL_STAGE'
  | 'REQUEST_COMMUNICATION'
  | 'ADD_OPERATIONAL_TAG'
  | 'NOTIFY_OPERATOR'
  | 'PAUSE_AUTOMATION'
  | 'UPDATE_APPROVED_FIELD'
  | 'SCHEDULE_CHECK';

export interface AutomationAction {
  key: string;
  type: AutomationActionType;
  parameters: Readonly<Record<string, AutomationScalar>>;
}

export interface AutomationRuleContent {
  when: AutomationTrigger;
  if: readonly AutomationCondition[];
  wait: AutomationWait | null;
  then: readonly AutomationAction[];
}

export interface AutomationDefinitionRecord {
  id: string;
  key: string;
  displayName: string;
  enabled: boolean;
  activeVersionId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationVersionRecord {
  id: string;
  definitionId: string;
  versionNumber: number;
  status: AutomationVersionStatus;
  content: AutomationRuleContent;
  sourceClassification: string;
  createdByType: AutomationActorType;
  createdById: string | null;
  createdAt: Date;
  activatedAt: Date | null;
  retiredAt: Date | null;
}

export type AutomationExecutionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
export type AutomationActionExecutionStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED';

export interface AutomationExecutionRecord {
  id: string;
  automationVersionId: string;
  triggerIdentity: string;
  idempotencyKey: string;
  contextType: string;
  contextId: string;
  status: AutomationExecutionStatus;
  correlationId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  failureCategory: string | null;
  version: number;
}

export interface AutomationActionExecutionRecord {
  id: string;
  executionId: string;
  actionKey: string;
  actionType: AutomationActionType;
  targetReference: string | null;
  idempotencyKey: string;
  status: AutomationActionExecutionStatus;
  attemptCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  failureCategory: string | null;
  resultMetadata: Readonly<Record<string, AutomationScalar>>;
}
