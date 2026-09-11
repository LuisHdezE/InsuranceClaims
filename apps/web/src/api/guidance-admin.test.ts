import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  activateAdminGuidanceVersion,
  createAdminGuidance,
  createAdminGuidanceVersion,
  listAdminGuidance,
  updateAdminGuidanceState,
} from './guidance-admin';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

describe('R3 guidance admin web client', () => {
  it('serializes server pagination and bearer auth for the directory', async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [] }, headers: { 'x-request-id': 'req-guidance' } });
    const result = await listAdminGuidance({ page: 2, pageSize: 25 }, 'staff-token', clientWith({ get }));

    expect(get).toHaveBeenCalledWith('/api/v1/admin/guidance', {
      params: { page: 2, pageSize: 25 },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(result.requestId).toBe('req-guidance');
  });

  it('sends the exact create payload without inventing guidance semantics', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: 'def-1' }, headers: {} });
    const payload = {
      key: 'claim.intake.help',
      insurerContextReference: 'context.claims',
      guidanceCategory: 'intake',
      documentCategories: ['identity', 'evidence'],
      instructions: ['Review the supplied identity evidence.'],
      assistanceMetadata: { audience: 'staff' },
      sourceClassification: 'CONFIGURED',
    };

    await createAdminGuidance(payload, 'staff-token', clientWith({ post }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/guidance', payload, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('pins new immutable versions to expectedDefinitionVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { version: 8 }, headers: {} });
    const payload = {
      expectedDefinitionVersion: 7,
      insurerContextReference: 'context.claims',
      guidanceCategory: 'review',
      documentCategories: [],
      instructions: ['Use the current configured guidance only.'],
      assistanceMetadata: {},
      sourceClassification: 'CONFIGURED',
    };

    await createAdminGuidanceVersion('def-1', payload, 'staff-token', clientWith({ post }));

    expect(post).toHaveBeenCalledWith('/api/v1/admin/guidance/def-1/versions', payload, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('pins activation and state updates to the authoritative definition version', async () => {
    const post = vi.fn().mockResolvedValue({ data: { version: 9 }, headers: {} });
    const patch = vi.fn().mockResolvedValue({ data: { enabled: true }, headers: {} });
    const client = clientWith({ post, patch });

    await activateAdminGuidanceVersion('def-1', 'ver-2', { expectedDefinitionVersion: 8 }, 'staff-token', client);
    await updateAdminGuidanceState('def-1', { expectedDefinitionVersion: 9, enabled: true }, 'staff-token', client);

    expect(post).toHaveBeenCalledWith('/api/v1/admin/guidance/def-1/versions/ver-2/activate', { expectedDefinitionVersion: 8 }, {
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(patch).toHaveBeenCalledWith('/api/v1/admin/guidance/def-1', { expectedDefinitionVersion: 9, enabled: true }, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });
});
