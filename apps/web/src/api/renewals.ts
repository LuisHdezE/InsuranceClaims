import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  MoveRenewalStageInput,
  RenewalCaseProjection,
  RenewalListInput,
  RenewalPageResponse,
  RenewalPipelineProjection,
  TransitionRenewalInput,
} from './renewals-types';

const browserClient = createApiClient();

export async function listRenewals(
  input: RenewalListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<RenewalPageResponse>> {
  try {
    const response = await client.get<RenewalPageResponse>('/api/v1/operator/renewals', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getRenewal(
  renewalId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<RenewalCaseProjection>> {
  try {
    const response = await client.get<RenewalCaseProjection>(
      `/api/v1/operator/renewals/${encodeURIComponent(renewalId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function transitionRenewal(
  renewalId: string,
  input: TransitionRenewalInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<RenewalCaseProjection>> {
  try {
    const response = await client.post<RenewalCaseProjection>(
      `/api/v1/operator/renewals/${encodeURIComponent(renewalId)}/transitions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function moveRenewalStage(
  renewalId: string,
  input: MoveRenewalStageInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<RenewalPipelineProjection>> {
  try {
    const response = await client.post<RenewalPipelineProjection>(
      `/api/v1/operator/renewals/${encodeURIComponent(renewalId)}/operational-transitions`,
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
