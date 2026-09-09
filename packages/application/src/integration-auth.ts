import type { IntegrationPrincipal } from './integration-events.js';

export interface IntegrationAuthenticationInput {
  integrationKey: string;
  externalEventId: string;
  timestamp: string;
  signature: string;
  rawBody: Uint8Array;
}

export type IntegrationAuthenticationResult =
  | { outcome: 'AUTHENTICATED'; principal: IntegrationPrincipal; payloadHash: string }
  | { outcome: 'INVALID_SIGNATURE' }
  | { outcome: 'INVALID_TIMESTAMP' };

export interface IntegrationAuthenticatorPort {
  authenticate(input: IntegrationAuthenticationInput): Promise<IntegrationAuthenticationResult>;
}
