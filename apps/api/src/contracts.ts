import type { AccessTokenPort } from '@insurance/application';
import type { ClaimEvidenceAttentionApplication } from '@insurance/application/claim-evidence-attention';
import type { ClaimsOperationsApplication } from '@insurance/application/claims-operations';
import type { ClaimTasksApplication } from '@insurance/application/claim-tasks';
import type { ClaimTimelineApplication } from '@insurance/application/claim-timeline';

export const API_RUNTIME = Symbol('API_RUNTIME');
export const ACCESS_TOKENS = Symbol('ACCESS_TOKENS');

export interface ApiRuntimeContract {
  application: ClaimsOperationsApplication;
  tasks: ClaimTasksApplication;
  timeline: ClaimTimelineApplication;
  evidenceAttention: ClaimEvidenceAttentionApplication;
  accessTokens: AccessTokenPort;
}

export interface RequestWithContext {
  requestId: string;
  actor?: import('@insurance/application').ActorContext;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
  url?: string;
}
