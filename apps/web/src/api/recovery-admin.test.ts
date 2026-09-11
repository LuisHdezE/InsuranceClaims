import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  getDeadLetter,
  getIntegrationEventStatus,
  listDeadLetters,
  requeueDeadLetter,
  resolveDeadLetter,
} from './recovery-admin';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const DEAD_LETTER_ID = '77777777-7777-4777-8777-777777777777';
const EVENT_ID = '88888888-8888-4888-8888-888888888888';

describe('R3 Recovery Administration web client', () => {
  it('lists and reads dead letters with bearer authorization', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 0 }, headers: {} })
      .mockResolvedValueOnce({ data: { deadLetterId: DEAD_LETTER_ID, status: 'DEAD_LETTER', version: 3 }, headers: {} });
    const client = clientWith({ get });

    await listDeadLetters({ page: 1, pageSize: 25 }, 'staff-token', client);
    await getDeadLetter(DEAD_LETTER_ID, 'staff-token', client);

    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/admin/dead-letters', {
      params: { page: 1, pageSize: 25 },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(get).toHaveBeenNthCalledWith(2, `/api/v1/admin/dead-letters/${DEAD_LETTER_ID}`, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('requeues and resolves with optimistic concurrency', async () => {
    const post = vi.fn().mockResolvedValue({ data: { deadLetterId: DEAD_LETTER_ID, version: 4 }, headers: {} });
    const client = clientWith({ post });

    await requeueDeadLetter(DEAD_LETTER_ID, { expectedVersion: 3 }, 'staff-token', client);
    await resolveDeadLetter(DEAD_LETTER_ID, { expectedVersion: 3 }, 'staff-token', client);

    expect(post).toHaveBeenNthCalledWith(
      1,
      `/api/v1/admin/dead-letters/${DEAD_LETTER_ID}/requeue`,
      { expectedVersion: 3 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
    expect(post).toHaveBeenNthCalledWith(
      2,
      `/api/v1/admin/dead-letters/${DEAD_LETTER_ID}/resolve`,
      { expectedVersion: 3 },
      { headers: { Authorization: 'Bearer staff-token' } },
    );
  });

  it('looks up an integration event only by its published eventId endpoint', async () => {
    const get = vi.fn().mockResolvedValue({ data: { eventId: EVENT_ID, ingestionStatus: 'ACCEPTED' }, headers: {} });
    const client = clientWith({ get });

    await getIntegrationEventStatus(EVENT_ID, 'staff-token', client);

    expect(get).toHaveBeenCalledWith(`/api/v1/admin/integration-events/${EVENT_ID}`, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });
});
