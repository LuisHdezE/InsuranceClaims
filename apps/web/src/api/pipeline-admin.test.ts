import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  activateAdminPipelineVersion,
  createAdminPipeline,
  createAdminPipelineVersion,
  getAdminPipeline,
  listAdminPipelines,
  updateAdminPipelineState,
} from './pipeline-admin';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const DEFINITION_ID = '55555555-5555-4555-8555-555555555555';
const VERSION_ID = '66666666-6666-4666-8666-666666666666';
const stages = [{
  stageKey: 'RECEIVED',
  displayName: 'Recibido',
  sortOrder: 10,
  reportingFlags: { intake: true },
  allowedNextStageKeys: [],
}];

describe('R3 Pipeline Administration web client', () => {
  it('lists and reads definitions with bearer authorization', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 1 }, headers: {} })
      .mockResolvedValueOnce({ data: { definitionId: DEFINITION_ID, key: 'claim-main', versions: [] }, headers: {} });
    const client = clientWith({ get });

    await listAdminPipelines({ page: 1, pageSize: 25 }, 'admin-token', client);
    await getAdminPipeline(DEFINITION_ID, 'admin-token', client);

    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/admin/pipelines', {
      params: { page: 1, pageSize: 25 },
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(get).toHaveBeenNthCalledWith(2, `/api/v1/admin/pipelines/${DEFINITION_ID}`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
  });

  it('creates a disabled definition with its first draft version', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, version: 1 }, headers: {} });
    const client = clientWith({ post });
    const input = {
      key: 'claim-main',
      consumerType: 'CLAIM' as const,
      displayName: 'Claims principal',
      sourceClassification: 'R3_ADMIN',
      stages,
    };

    await createAdminPipeline(input, 'admin-token', client);

    expect(post).toHaveBeenCalledWith('/api/v1/admin/pipelines', input, {
      headers: { Authorization: 'Bearer admin-token' },
    });
  });

  it('creates a new immutable draft version with the definition version guard', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, version: 4 }, headers: {} });
    const client = clientWith({ post });
    const input = { expectedDefinitionVersion: 3, sourceClassification: 'R3_ADMIN', stages };

    await createAdminPipelineVersion(DEFINITION_ID, input, 'admin-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/admin/pipelines/${DEFINITION_ID}/versions`,
      input,
      { headers: { Authorization: 'Bearer admin-token' } },
    );
  });

  it('activates a draft version with optimistic concurrency', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, activeVersionId: VERSION_ID, version: 5 }, headers: {} });
    const client = clientWith({ post });

    await activateAdminPipelineVersion(DEFINITION_ID, VERSION_ID, { expectedDefinitionVersion: 4 }, 'admin-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/admin/pipelines/${DEFINITION_ID}/versions/${VERSION_ID}/activate`,
      { expectedDefinitionVersion: 4 },
      { headers: { Authorization: 'Bearer admin-token' } },
    );
  });

  it('updates enabled state with optimistic concurrency', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, enabled: true, version: 6 }, headers: {} });
    const client = clientWith({ patch });

    await updateAdminPipelineState(DEFINITION_ID, { expectedDefinitionVersion: 5, enabled: true }, 'admin-token', client);

    expect(patch).toHaveBeenCalledWith(
      `/api/v1/admin/pipelines/${DEFINITION_ID}`,
      { expectedDefinitionVersion: 5, enabled: true },
      { headers: { Authorization: 'Bearer admin-token' } },
    );
  });
});
