import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { cancelClaimTask, createClaimTask, getClaimTask, updateClaimTask } from './tasks';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const TASK_ID = '22222222-2222-4222-8222-222222222222';
const CLAIM_ID = '11111111-1111-4111-8111-111111111111';

describe('R3 Claim Task web client', () => {
  it('creates a Task with Idempotency-Key and surfaces replay metadata', async () => {
    const post = vi.fn().mockResolvedValue({
      data: { taskId: TASK_ID },
      headers: { 'x-request-id': 'req-create', 'idempotency-replayed': 'true' },
    });
    const result = await createClaimTask(
      CLAIM_ID,
      { type: 'CLAIM_REVIEW', title: 'Review', priority: 'HIGH', queue: 'CLAIMS' },
      'idem-1234567890-abcdef',
      'staff-token',
      clientWith({ post }),
    );

    expect(post).toHaveBeenCalledWith(
      `/api/v1/operator/claims/${CLAIM_ID}/tasks`,
      { type: 'CLAIM_REVIEW', title: 'Review', priority: 'HIGH', queue: 'CLAIMS' },
      { headers: { Authorization: 'Bearer staff-token', 'Idempotency-Key': 'idem-1234567890-abcdef' } },
    );
    expect(result.idempotencyReplayed).toBe(true);
  });

  it('gets and updates Task projections through the resource endpoint', async () => {
    const get = vi.fn().mockResolvedValue({ data: { taskId: TASK_ID, version: 3 }, headers: {} });
    const patch = vi.fn().mockResolvedValue({ data: { taskId: TASK_ID, version: 4 }, headers: {} });
    const client = clientWith({ get, patch });

    await getClaimTask(TASK_ID, 'staff-token', client);
    await updateClaimTask(TASK_ID, { expectedVersion: 3, priority: 'HIGH' }, 'staff-token', client);

    expect(get).toHaveBeenCalledWith(`/api/v1/operator/tasks/${TASK_ID}`, { headers: { Authorization: 'Bearer staff-token' } });
    expect(patch).toHaveBeenCalledWith(
      `/api/v1/operator/tasks/${TASK_ID}`,
      { expectedVersion: 3, priority: 'HIGH' },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });

  it('cancels using a canonical reason and expectedVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { taskId: TASK_ID, status: 'CANCELLED' }, headers: {} });
    const client = clientWith({ post });

    await cancelClaimTask(TASK_ID, { expectedVersion: 5, reason: 'DUPLICATE' }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/operator/tasks/${TASK_ID}/cancel`,
      { expectedVersion: 5, reason: 'DUPLICATE' },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });
});
