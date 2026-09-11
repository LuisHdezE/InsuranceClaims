import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  ActivateGuidanceVersionInput,
  CreateGuidanceInput,
  CreateGuidanceVersionInput,
  GuidanceDefinitionProjection,
  GuidanceListInput,
  GuidancePageResponse,
  UpdateGuidanceStateInput,
} from './guidance-admin-types';

const browserClient = createApiClient();

export async function listAdminGuidance(
  input: GuidanceListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<GuidancePageResponse>> {
  try {
    const response = await client.get<GuidancePageResponse>('/api/v1/admin/guidance', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getAdminGuidance(
  definitionId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<GuidanceDefinitionProjection>> {
  try {
    const response = await client.get<GuidanceDefinitionProjection>(
      `/api/v1/admin/guidance/${encodeURIComponent(definitionId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminGuidance(
  input: CreateGuidanceInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<GuidanceDefinitionProjection>> {
  try {
    const response = await client.post<GuidanceDefinitionProjection>(
      '/api/v1/admin/guidance',
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminGuidanceVersion(
  definitionId: string,
  input: CreateGuidanceVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<GuidanceDefinitionProjection>> {
  try {
    const response = await client.post<GuidanceDefinitionProjection>(
      `/api/v1/admin/guidance/${encodeURIComponent(definitionId)}/versions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function activateAdminGuidanceVersion(
  definitionId: string,
  versionId: string,
  input: ActivateGuidanceVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<GuidanceDefinitionProjection>> {
  try {
    const response = await client.post<GuidanceDefinitionProjection>(
      `/api/v1/admin/guidance/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}/activate`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateAdminGuidanceState(
  definitionId: string,
  input: UpdateGuidanceStateInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<GuidanceDefinitionProjection>> {
  try {
    const response = await client.patch<GuidanceDefinitionProjection>(
      `/api/v1/admin/guidance/${encodeURIComponent(definitionId)}`,
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
