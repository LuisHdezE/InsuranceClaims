import type { AccessTokenPort } from '@insurance/application';
import type { AsyncOperationsApplication } from '@insurance/application/async-operations';
import type { AutomationAdminApplication } from '@insurance/application/automation-admin';
import type { AutomationExecutionApplication } from '@insurance/application/automation-execution';
import type { ClaimEvidenceAttentionApplication } from '@insurance/application/claim-evidence-attention';
import type { ClaimPipelineApplication } from '@insurance/application/claim-pipeline';
import type { ClaimsOperationsApplication } from '@insurance/application/claims-operations';
import type { ClaimTasksApplication } from '@insurance/application/claim-tasks';
import type { ClaimTimelineApplication } from '@insurance/application/claim-timeline';
import type { CommunicationTemplateAdminApplication } from '@insurance/application/communication-template-admin';
import type { CommunicationsApplication } from '@insurance/application/communications';
import type { CustomerPolicyApplication } from '@insurance/application/customer-policy';
import type { GuidanceAdminApplication } from '@insurance/application/guidance-admin';
import type { IntegrationAuthenticatorPort } from '@insurance/application/integration-auth';
import type { IntegrationEventsApplication } from '@insurance/application/integration-events';
import type { PipelineAdminApplication } from '@insurance/application/pipeline-admin';

export const API_RUNTIME = Symbol('API_RUNTIME');
export const ACCESS_TOKENS = Symbol('ACCESS_TOKENS');

export interface ApiRuntimeContract {
  application: ClaimsOperationsApplication;
  tasks: ClaimTasksApplication;
  pipeline: ClaimPipelineApplication;
  pipelineAdmin: PipelineAdminApplication;
  asyncOperations: AsyncOperationsApplication;
  automationAdmin: AutomationAdminApplication;
  automationExecution: AutomationExecutionApplication;
  guidanceAdmin: GuidanceAdminApplication;
  customerPolicy: CustomerPolicyApplication;
  communicationTemplates: CommunicationTemplateAdminApplication;
  communications: CommunicationsApplication;
  integrations: IntegrationEventsApplication;
  integrationAuthenticator: IntegrationAuthenticatorPort;
  timeline: ClaimTimelineApplication;
  evidenceAttention: ClaimEvidenceAttentionApplication;
  accessTokens: AccessTokenPort;
}

export interface RequestWithContext {
  requestId: string;
  actor?: import('@insurance/application').ActorContext;
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  ip?: string;
  socket?: { remoteAddress?: string };
  url?: string;
}
