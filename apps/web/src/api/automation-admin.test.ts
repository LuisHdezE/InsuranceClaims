import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  activateAdminAutomationVersion,
  createAdminAutomation,
  createAdminAutomationVersion,
  listAdminAutomations,
  updateAdminAutomationState,
} from './automation-admin';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

describe('R3 automation admin web client', () => {
  it('serializes server pagination and bearer auth for the directory', async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [] }, headers: { 'x-request-id': 'req-list' } });
    const result = await listAdminAutomations({ page: 2, pageSize: 25 }, 'staff-token', clientWith({ get }));

    expect(get).toHaveBeenCalledWith('/api/v1/admin/automations', {
      params: { page: 2, pageSize: 25 },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(result.requestId).toBe('req-list');
  });

  it('sends the exact rule payload without adding action semantics', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: 'def-1' }, headers: {} });
    const payload = {
      key: 'claim.review.task',
      displayName: 'Review task',
      sourceClassification: 'CONFIGURED',
      content: {
        when: { eventType: 'CLAIM_CREATED' as const },
        if: [{ field: 'claim.status', operator: 'EQ' as const, value: 'OPEN' }],
        wait: null,
        then: [{ key: 'create_task', type: 'CREATE_TASK' as const, parameters: { priority: 'HIGH', notify: true } }],
      },
    };

    await createAdminAutomation(payload, 'staff-token', clientWith({ post }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/automations', payload, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('pins new immutable versions to expectedDefinitionVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { version: 5 }, headers: {} });
    const payload = {
      expectedDefinitionVersion: 4,
      sourceClassification: 'CONFIGURED',
      content: {
        when: { eventType: 'SCHEDULED_CHECK' as const },
        if: [],
        wait: { delaySeconds: 300 },
        then: [{ key: 'check_again', type: 'SCHEDULE_CHECK' as const, parameters: { attempt: 2 } }],
      },
    };

    await createAdminAutomationVersion('def-1', payload, 'staff-token', clientWith({ post }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/automations/def-1/versions', payload, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('pins activation and state updates to the authoritative definition version', async () => {
    const post = vi.fn().mockResolvedValue({ data: { version: 6 }, headers: {} });
    const patch = vi.fn().mockResolvedValue({ data: { enabled: true }, headers: {} });
    const client = clientWith({ post, patch });

    await activateAdminAutomationVersion('def-1', 'ver-2', { expectedDefinitionVersion: 5 }, 'staff-token', client);
    await updateAdminAutomationState('def-1', { expectedDefinitionVersion: 6, enabled: true }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith('/api/v1/admin/automations/def-1/versions/ver-2/activate', { expectedDefinitionVersion: 5 }, {
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/admin/automations/def-1', { expectedDefinitionVersion: 6, enabled: true }, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });
});
