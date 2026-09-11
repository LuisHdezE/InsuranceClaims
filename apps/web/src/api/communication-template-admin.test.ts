import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
  activateAdminCommunicationTemplateVersion,
  createAdminCommunicationTemplate,
  createAdminCommunicationTemplateVersion,
  getAdminCommunicationTemplate,
  listAdminCommunicationTemplates,
  updateAdminCommunicationTemplateState,
} from './communication-template-admin';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const DEFINITION_ID = '66666666-6666-4666-8666-666666666666';
const VERSION_ID = '77777777-7777-4777-8777-777777777777';

describe('R3 Communication Template Admin web client', () => {
  it('lists and reads definitions with bearer authorization', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1, pageSize: 25, totalItems: 0, totalPages: 1 }, headers: {} })
      .mockResolvedValueOnce({ data: { definitionId: DEFINITION_ID, key: 'claim.notice', channel: 'EMAIL', enabled: false, version: 1, versions: [] }, headers: {} });
    const client = clientWith({ get });

    await listAdminCommunicationTemplates({ page: 1, pageSize: 25 }, 'admin-token', client);
    await getAdminCommunicationTemplate(DEFINITION_ID, 'admin-token', client);

    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/admin/communication-templates', {
      params: { page: 1, pageSize: 25 },
      headers: { Authorization: 'Bearer admin-token' },
    });
    expect(get).toHaveBeenNthCalledWith(2, `/api/v1/admin/communication-templates/${DEFINITION_ID}`, {
      headers: { Authorization: 'Bearer admin-token' },
    });
  });

  it('creates a disabled definition with its first DRAFT content', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, version: 1 }, headers: {} });
    const client = clientWith({ post });
    const input = {
      key: 'claim.notice',
      channel: 'EMAIL' as const,
      subject: 'Actualización de siniestro',
      body: 'Hola {{customerName}}',
      variableSchema: { customerName: 'STRING' as const },
      sourceClassification: 'R3_ADMIN',
    };

    await createAdminCommunicationTemplate(input, 'admin-token', client);

    expect(post).toHaveBeenCalledWith('/api/v1/admin/communication-templates', input, {
      headers: { Authorization: 'Bearer admin-token' },
    });
  });

  it('creates an immutable version with expectedDefinitionVersion', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, version: 2 }, headers: {} });
    const client = clientWith({ post });
    const input = {
      expectedDefinitionVersion: 1,
      subject: null,
      body: 'Mensaje por WhatsApp',
      variableSchema: {},
      sourceClassification: 'R3_ADMIN',
    };

    await createAdminCommunicationTemplateVersion(DEFINITION_ID, input, 'admin-token', client);

    expect(post).toHaveBeenCalledWith(
      `/api/v1/admin/communication-templates/${DEFINITION_ID}/versions`,
      input,
      { headers: { Authorization: 'Bearer admin-token' } },
    );
  });

  it('activates only through the explicit version endpoint and version guard', async () => {
    const post = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, activeVersionId: VERSION_ID, version: 3 }, headers: {} });
    const client = clientWith({ post });

    await activateAdminCommunicationTemplateVersion(
      DEFINITION_ID,
      VERSION_ID,
      { expectedDefinitionVersion: 2 },
      'admin-token',
      client,
    );

    expect(post).toHaveBeenCalledWith(
      `/api/v1/admin/communication-templates/${DEFINITION_ID}/versions/${VERSION_ID}/activate`,
      { expectedDefinitionVersion: 2 },
      { headers: { Authorization: 'Bearer admin-token' } },
    );
  });

  it('updates enabled state with optimistic concurrency', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { definitionId: DEFINITION_ID, enabled: true, version: 4 }, headers: {} });
    const client = clientWith({ patch });

    await updateAdminCommunicationTemplateState(
      DEFINITION_ID,
      { expectedDefinitionVersion: 3, enabled: true },
      'admin-token',
      client,
    );

    expect(patch).toHaveBeenCalledWith(
      `/api/v1/admin/communication-templates/${DEFINITION_ID}`,
      { expectedDefinitionVersion: 3, enabled: true },
      { headers: { Authorization: 'Bearer admin-token' } },
    );
  });
});
