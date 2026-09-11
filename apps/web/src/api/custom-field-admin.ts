import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  ActivateCustomFieldVersionInput,
  CreateCustomFieldInput,
  CreateCustomFieldVersionInput,
  CustomFieldDefinitionProjection,
  CustomFieldListInput,
  CustomFieldPageResponse,
  UpdateCustomFieldStateInput,
} from './custom-field-admin-types';

const browserClient = createApiClient();

export async function listAdminCustomFields(
  input: CustomFieldListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomFieldPageResponse>> {
  try {
    const response = await client.get<CustomFieldPageResponse>('/api/v1/admin/custom-fields', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getAdminCustomField(
  definitionId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomFieldDefinitionProjection>> {
  try {
    const response = await client.get<CustomFieldDefinitionProjection>(
      `/api/v1/admin/custom-fields/${encodeURIComponent(definitionId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminCustomField(
  input: CreateCustomFieldInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomFieldDefinitionProjection>> {
  try {
    const response = await client.post<CustomFieldDefinitionProjection>(
      '/api/v1/admin/custom-fields',
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminCustomFieldVersion(
  definitionId: string,
  input: CreateCustomFieldVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomFieldDefinitionProjection>> {
  try {
    const response = await client.post<CustomFieldDefinitionProjection>(
      `/api/v1/admin/custom-fields/${encodeURIComponent(definitionId)}/versions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function activateAdminCustomFieldVersion(
  definitionId: string,
  versionId: string,
  input: ActivateCustomFieldVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomFieldDefinitionProjection>> {
  try {
    const response = await client.post<CustomFieldDefinitionProjection>(
      `/api/v1/admin/custom-fields/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}/activate`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateAdminCustomFieldState(
  definitionId: string,
  input: UpdateCustomFieldStateInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomFieldDefinitionProjection>> {
  try {
    const response = await client.patch<CustomFieldDefinitionProjection>(
      `/api/v1/admin/custom-fields/${encodeURIComponent(definitionId)}`,
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
