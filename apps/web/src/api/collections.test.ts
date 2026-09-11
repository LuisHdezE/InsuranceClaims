import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  getCollection,
  listCollections,
  moveCollectionStage,
  transitionCollection,
  updateCollectionPaymentState,
} from './collections';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const COLLECTION_ID = '44444444-4444-4444-8444-444444444444';

describe('R3 Collections web client', () => {
  it('lists and reads collection cases with bearer authorization', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 1 }, headers: {} })
      .mockResolvedValueOnce({ data: { collectionId: COLLECTION_ID, status: 'OPEN', version: 2 }, headers: {} });
    const client = clientWith({ get });

    await listCollections({ page: 1, pageSize: 25 }, 'staff-token', client);
    await getCollection(COLLECTION_ID, 'staff-token', client);

    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/operator/collections', {
      params: { page: 1, pageSize: 25 },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(get).toHaveBeenNthCalledWith(2, `/api/v1/operator/collections/${COLLECTION_ID}`, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('transitions lifecycle with expectedVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { collectionId: COLLECTION_ID, status: 'COMPLETED', version: 3 }, headers: {} });
    const client = clientWith({ post });

    await transitionCollection(COLLECTION_ID, { toStatus: 'COMPLETED', expectedVersion: 2 }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/operator/collections/${COLLECTION_ID}/transitions`,
      { toStatus: 'COMPLETED', expectedVersion: 2 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });

  it('moves the operational work item with the pipeline version guard', async () => {
    const post = vi.fn().mockResolvedValue({ data: { workItemId: 'w1', version: 5 }, headers: {} });
    const client = clientWith({ post });

    await moveCollectionStage(COLLECTION_ID, { toStageKey: 'FOLLOW_UP', expectedVersion: 4 }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/operator/collections/${COLLECTION_ID}/operational-transitions`,
      { toStageKey: 'FOLLOW_UP', expectedVersion: 4 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });

  it('updates payment state with case expectedVersion and server verification', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { collectionId: COLLECTION_ID, paymentState: 'SERVER_APPROVED_STATE', version: 3 }, headers: {} });
    const client = clientWith({ patch });

    await updateCollectionPaymentState(
      COLLECTION_ID,
      { paymentState: 'SERVER_APPROVED_STATE', expectedVersion: 2 },
      'staff-token',
      client,
    );

    expect(patch).toHaveBeenCalledWith(
      `/api/v1/operator/collections/${COLLECTION_ID}/payment-state`,
      { paymentState: 'SERVER_APPROVED_STATE', expectedVersion: 2 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });
});
