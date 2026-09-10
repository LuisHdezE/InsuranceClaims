import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { getClaimsOperationalMetrics, moveClaimOperationalStage } from './claims-work';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

describe('R3 claims-work web client', () => {
  it('serializes the canonical metrics window and staff bearer token', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { openClaims: 0 },
      headers: { 'x-request-id': 'req-metrics' },
    });
    const client = clientWith({ get });

    const result = await getClaimsOperationalMetrics(
      { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
      'staff-token',
      client,
    );

    expect(get).toHaveBeenCalledWith('/api/v1/operator/analytics/claims', {
      params: { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(result.requestId).toBe('req-metrics');
  });

  it('sends the exact expectedVersion when moving a Claim operational stage', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { version: 8, allowedNextStageKeys: [] },
      headers: { 'x-request-id': 'req-pipeline' },
    });
    const client = clientWith({ post });

    await moveClaimOperationalStage(
      '11111111-1111-4111-8111-111111111111',
      { toStageKey: 'review.completed', expectedVersion: 7 },
      'staff-token',
      client,
    );

    expect(post).toHaveBeenCalledWith(
      '/api/v1/operator/claims/11111111-1111-4111-8111-111111111111/operational-transitions',
      { toStageKey: 'review.completed', expectedVersion: 7 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });
});
