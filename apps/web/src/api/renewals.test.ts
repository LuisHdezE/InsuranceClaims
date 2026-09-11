import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { getRenewal, listRenewals, moveRenewalStage, transitionRenewal } from './renewals';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const RENEWAL_ID = '11111111-1111-4111-8111-111111111111';

describe('R3 Renewals web client', () => {
  it('lists and reads renewal cases with bearer authorization', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 1 }, headers: {} })
      .mockResolvedValueOnce({ data: { renewalId: RENEWAL_ID, status: 'OPEN', version: 2 }, headers: {} });
    const client = clientWith({ get });

    await listRenewals({ page: 1, pageSize: 25 }, 'staff-token', client);
    await getRenewal(RENEWAL_ID, 'staff-token', client);

    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/operator/renewals', {
      params: { page: 1, pageSize: 25 },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(get).toHaveBeenNthCalledWith(2, `/api/v1/operator/renewals/${RENEWAL_ID}`, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('transitions lifecycle with expectedVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { renewalId: RENEWAL_ID, status: 'COMPLETED', version: 3 }, headers: {} });
    const client = clientWith({ post });

    await transitionRenewal(RENEWAL_ID, { toStatus: 'COMPLETED', expectedVersion: 2 }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/operator/renewals/${RENEWAL_ID}/transitions`,
      { toStatus: 'COMPLETED', expectedVersion: 2 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });

  it('moves the operational work item with the pipeline version guard', async () => {
    const post = vi.fn().mockResolvedValue({ data: { workItemId: 'w1', version: 5 }, headers: {} });
    const client = clientWith({ post });

    await moveRenewalStage(RENEWAL_ID, { toStageKey: 'CONTACT_CUSTOMER', expectedVersion: 4 }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/operator/renewals/${RENEWAL_ID}/operational-transitions`,
      { toStageKey: 'CONTACT_CUSTOMER', expectedVersion: 4 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });
});
