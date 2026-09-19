import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createReadOnlyDemoOperatorSession } from './claims';

describe('createReadOnlyDemoOperatorSession', () => {
  it('defaults to the governed operations persona and allows enough time for a cold start', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        accessToken: 'demo-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        operator: {
          id: '00000000-0000-4000-8000-000000000096',
          login: 'demo.operator@eliasworks.invalid',
          role: 'CLAIMS_OPERATOR',
        },
      },
      headers: { 'x-request-id': 'req-demo-cold-start' },
    });
    const client = { post } as unknown as AxiosInstance;

    const result = await createReadOnlyDemoOperatorSession('operations', client);

    expect(post).toHaveBeenCalledWith(
      '/api/v1/operator/auth/login',
      {
        login: 'demo.operator@eliasworks.invalid',
        password: 'public-demo-read-only',
      },
      {
        headers: {
          'X-Demo-Read-Only': 'true',
          'X-Demo-Persona': 'operations',
        },
        timeout: 60_000,
      },
    );
    expect(result.requestId).toBe('req-demo-cold-start');
  });

  it('requests the administration persona with its own governed identity', async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        accessToken: 'admin-demo-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        operator: {
          id: '00000000-0000-4000-8000-000000000094',
          login: 'demo.admin@eliasworks.invalid',
          role: 'PLATFORM_ADMIN',
        },
      },
      headers: {},
    });
    const client = { post } as unknown as AxiosInstance;

    await createReadOnlyDemoOperatorSession('administration', client);

    expect(post).toHaveBeenCalledWith(
      '/api/v1/operator/auth/login',
      {
        login: 'demo.admin@eliasworks.invalid',
        password: 'public-demo-read-only',
      },
      {
        headers: {
          'X-Demo-Read-Only': 'true',
          'X-Demo-Persona': 'administration',
        },
        timeout: 60_000,
      },
    );
  });
});
