import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  ActivateCommunicationTemplateVersionInput,
  CommunicationTemplateDefinitionProjection,
  CommunicationTemplateListInput,
  CommunicationTemplatePageResponse,
  CreateCommunicationTemplateInput,
  CreateCommunicationTemplateVersionInput,
  UpdateCommunicationTemplateStateInput,
} from './communication-template-admin-types';

const browserClient = createApiClient();

export async function listAdminCommunicationTemplates(
  input: CommunicationTemplateListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CommunicationTemplatePageResponse>> {
  try {
    const response = await client.get<CommunicationTemplatePageResponse>('/api/v1/admin/communication-templates', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getAdminCommunicationTemplate(
  definitionId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CommunicationTemplateDefinitionProjection>> {
  try {
    const response = await client.get<CommunicationTemplateDefinitionProjection>(
      `/api/v1/admin/communication-templates/${encodeURIComponent(definitionId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminCommunicationTemplate(
  input: CreateCommunicationTemplateInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CommunicationTemplateDefinitionProjection>> {
  try {
    const response = await client.post<CommunicationTemplateDefinitionProjection>(
      '/api/v1/admin/communication-templates',
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminCommunicationTemplateVersion(
  definitionId: string,
  input: CreateCommunicationTemplateVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CommunicationTemplateDefinitionProjection>> {
  try {
    const response = await client.post<CommunicationTemplateDefinitionProjection>(
      `/api/v1/admin/communication-templates/${encodeURIComponent(definitionId)}/versions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function activateAdminCommunicationTemplateVersion(
  definitionId: string,
  versionId: string,
  input: ActivateCommunicationTemplateVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CommunicationTemplateDefinitionProjection>> {
  try {
    const response = await client.post<CommunicationTemplateDefinitionProjection>(
      `/api/v1/admin/communication-templates/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}/activate`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateAdminCommunicationTemplateState(
  definitionId: string,
  input: UpdateCommunicationTemplateStateInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CommunicationTemplateDefinitionProjection>> {
  try {
    const response = await client.patch<CommunicationTemplateDefinitionProjection>(
      `/api/v1/admin/communication-templates/${encodeURIComponent(definitionId)}`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

function bearerHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

function readHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
