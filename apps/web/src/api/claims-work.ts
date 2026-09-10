import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  ClaimsOperationalMetricsInput,
  ClaimsOperationalMetricsResponse,
  MoveOperationalStageRequest,
  PipelineWorkItemResponse,
} from './claims-work-types';

const browserClient = createApiClient();

export async function getClaimsOperationalMetrics(
  input: ClaimsOperationalMetricsInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimsOperationalMetricsResponse>> {
  try {
    const response = await client.get<ClaimsOperationalMetricsResponse>('/api/v1/operator/analytics/claims', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function moveClaimOperationalStage(
  claimId: string,
  payload: MoveOperationalStageRequest,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PipelineWorkItemResponse>> {
  try {
    const response = await client.post<PipelineWorkItemResponse>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/operational-transitions`,
      payload,
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
