import type { AxiosInstance } from 'axios';
import { PUBLIC_DEMO_PERSONAS, type PublicDemoPersona } from '../demo-access';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult, OperatorLoginResponse } from './types';

const browserClient = createApiClient();

export async function createReadOnlyDemoOperatorSession(
  persona: PublicDemoPersona,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<OperatorLoginResponse>> {
  try {
    const response = await client.post<OperatorLoginResponse>(
      '/api/v1/operator/auth/login',
      {
        login: PUBLIC_DEMO_PERSONAS[persona].login,
        password: 'public-demo-read-only',
      },
      {
        headers: { 'X-Demo-Read-Only': 'true' },
        // Render free services may need more than the default client timeout to wake from idle.
        timeout: 60_000,
      },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

function readHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
