import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  ActivatePipelineVersionInput,
  CreatePipelineInput,
  CreatePipelineVersionInput,
  PipelineDefinitionProjection,
  PipelineListInput,
  PipelinePageResponse,
  UpdatePipelineStateInput,
} from './pipeline-admin-types';

const browserClient = createApiClient();

export async function listAdminPipelines(
  input: PipelineListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelinePageResponse>> {
  try {
    const response = await client.get<PipelinePageResponse>('/api/v1/admin/pipelines', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getAdminPipeline(
  definitionId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelineDefinitionProjection>> {
  try {
    const response = await client.get<PipelineDefinitionProjection>(
      `/api/v1/admin/pipelines/${encodeURIComponent(definitionId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminPipeline(
  input: CreatePipelineInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelineDefinitionProjection>> {
  try {
    const response = await client.post<PipelineDefinitionProjection>(
      '/api/v1/admin/pipelines',
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createAdminPipelineVersion(
  definitionId: string,
  input: CreatePipelineVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelineDefinitionProjection>> {
  try {
    const response = await client.post<PipelineDefinitionProjection>(
      `/api/v1/admin/pipelines/${encodeURIComponent(definitionId)}/versions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function activateAdminPipelineVersion(
  definitionId: string,
  versionId: string,
  input: ActivatePipelineVersionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelineDefinitionProjection>> {
  try {
    const response = await client.post<PipelineDefinitionProjection>(
      `/api/v1/admin/pipelines/${encodeURIComponent(definitionId)}/versions/${encodeURIComponent(versionId)}/activate`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateAdminPipelineState(
  definitionId: string,
  input: UpdatePipelineStateInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelineDefinitionProjection>> {
  try {
    const response = await client.patch<PipelineDefinitionProjection>(
      `/api/v1/admin/pipelines/${encodeURIComponent(definitionId)}`,
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
