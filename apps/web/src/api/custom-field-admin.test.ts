import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  activateAdminCustomFieldVersion,
  createAdminCustomField,
  createAdminCustomFieldVersion,
  listAdminCustomFields,
  updateAdminCustomFieldState,
} from './custom-field-admin';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

describe('R3 custom-field admin web client', () => {
  it('serializes server pagination and bearer auth for the directory', async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [] }, headers: { 'x-request-id': 'req-list' } });
    const result = await listAdminCustomFields({ page: 2, pageSize: 25 }, 'staff-token', clientWith({ get }));

    expect(get).toHaveBeenCalledWith('/api/v1/admin/custom-fields', {
      params: { page: 2, pageSize: 25 },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(result.requestId).toBe('req-list');
  });

  it('sends the exact create payload without enriching validation metadata', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: 'def-1' }, headers: {} });
    const payload = {
      fieldKey: 'incident.severity_note',
      targetType: 'CLAIM' as const,
      valueType: 'STRING' as const,
      displayName: 'Severity note',
      validationMetadata: { maxLength: 120, requiredHint: false },
      enumValues: [],
      sensitivityClassification: 'STAFF_ONLY' as const,
      sourceClassification: 'CONFIGURED',
    };

    await createAdminCustomField(payload, 'staff-token', clientWith({ post }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/custom-fields', payload, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('pins new immutable versions to expectedDefinitionVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { version: 8 }, headers: {} });
    const payload = {
      expectedDefinitionVersion: 7,
      valueType: 'ENUM' as const,
      displayName: 'Review lane',
      validationMetadata: {},
      enumValues: ['A', 'B'],
      sensitivityClassification: 'PUBLIC_SAFE' as const,
      sourceClassification: 'CONFIGURED',
    };

    await createAdminCustomFieldVersion('def-1', payload, 'staff-token', clientWith({ post }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/custom-fields/def-1/versions', payload, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('pins activation and state updates to the authoritative definition version', async () => {
    const post = vi.fn().mockResolvedValue({ data: { version: 9 }, headers: {} });
    const patch = vi.fn().mockResolvedValue({ data: { enabled: true }, headers: {} });
    const client = clientWith({ post, patch });

    await activateAdminCustomFieldVersion('def-1', 'ver-2', { expectedDefinitionVersion: 8 }, 'staff-token', client);
    await updateAdminCustomFieldState('def-1', { expectedDefinitionVersion: 9, enabled: true }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith('/api/v1/admin/custom-fields/def-1/versions/ver-2/activate', { expectedDefinitionVersion: 8 }, {
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/admin/custom-fields/def-1', { expectedDefinitionVersion: 9, enabled: true }, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });
});
