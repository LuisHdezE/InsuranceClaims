import type { AccessTokenPort, ClaimsApplication } from '@insurance/application';

export const API_RUNTIME = Symbol('API_RUNTIME');
export const ACCESS_TOKENS = Symbol('ACCESS_TOKENS');

export interface ApiRuntimeContract {
  application: ClaimsApplication;
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
