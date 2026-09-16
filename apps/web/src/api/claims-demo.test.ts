import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { createReadOnlyDemoOperatorSession } from './claims';

describe('createReadOnlyDemoOperatorSession', () => {
  it('sends the governed demo header and allows enough time for a free-hosting cold start', async () => {
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

    const result = await createReadOnlyDemoOperatorSession(client);

    expect(post).toHaveBeenCalledWith(
      '/api/v1/operator/auth/login',
      {
        login: 'demo.operator@eliasworks.invalid',
        password: 'public-demo-read-only',
      },
      {
        headers: { 'X-Demo-Read-Only': 'true' },
        timeout: 60_000,
      },
    );
    expect(result.requestId).toBe('req-demo-cold-start');
  });
});
