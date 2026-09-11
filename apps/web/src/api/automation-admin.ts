import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  ActivateAutomationVersionInput,
  AutomationDefinitionProjection,
  AutomationListInput,
  AutomationPageResponse,
  CreateAutomationInput,
  CreateAutomationVersionInput,
  UpdateAutomationStateInput,
} from './automation-admin-types';

const browserClient = createApiClient();

export async function listAdminAutomations(input: AutomationListInput, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<AutomationPageResponse>> {
  try {
    const response = await client.get<AutomationPageResponse>('/api/v1/admin/automations', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getAdminAutomation(definitionId: string, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<AutomationDefinitionProjection>> {
  try {
    const response = await client.get<AutomationDefinitionProjection>(`/api/v1/admin/automations/${encodeURIComponent(definitionId)}`, {
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminAutomation(input: CreateAutomationInput, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<AutomationDefinitionProjection>> {
  try {
    const response = await client.post<AutomationDefinitionProjection>('/api/v1/admin/automations', input, {
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminAutomationVersion(definitionId: string, input: CreateAutomationVersionInput, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<AutomationDefinitionProjection>> {
  try {
    const response = await client.post<AutomationDefinitionProjection>(`/api/v1/admin/automations/${encodeURIComponent(definitionId)}/versions`, input, {
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function activateAdminAutomationVersion(definitionId: string, versionId: string, input: ActivateAutomationVersionInput, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<AutomationDefinitionProjection>> {
  try {
    const response = await client.post<AutomationDefinitionProjection>(`/api/v1/admin/automations/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}/activate`, input, {
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateAdminAutomationState(definitionId: string, input: UpdateAutomationStateInput, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<AutomationDefinitionProjection>> {
  try {
    const response = await client.patch<AutomationDefinitionProjection>(`/api/v1/admin/automations/${encodeURIComponent(definitionId)}`, input, {
      headers: bearerHeaders(accessToken),
    });
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
