import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  CancelClaimTaskInput,
  ClaimTaskProjection,
  ClaimTasksPageResponse,
  CreateClaimTaskInput,
  ListTasksInput,
  UpdateClaimTaskInput,
} from './task-types';

const browserClient = createApiClient();

export async function listTasks(
  input: ListTasksInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTasksPageResponse>> {
  try {
    const response = await client.get<ClaimTasksPageResponse>('/api/v1/operator/tasks', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function listClaimTasks(
  claimId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTaskProjection[]>> {
  try {
    const response = await client.get<ClaimTaskProjection[]>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/tasks`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createClaimTask(
  claimId: string,
  payload: CreateClaimTaskInput,
  idempotencyKey: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTaskProjection>> {
  try {
    const response = await client.post<ClaimTaskProjection>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/tasks`,
      payload,
      { headers: { ...bearerHeaders(accessToken), 'Idempotency-Key': idempotencyKey } },
    );
    return {
      data: response.data,
      requestId: readHeader(response.headers['x-request-id']),
      idempotencyReplayed: readHeader(response.headers['idempotency-replayed'])?.toLowerCase() === 'true',
    };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getClaimTask(
  taskId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTaskProjection>> {
  try {
    const response = await client.get<ClaimTaskProjection>(
      `/api/v1/operator/tasks/${encodeURIComponent(taskId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateClaimTask(
  taskId: string,
  payload: UpdateClaimTaskInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTaskProjection>> {
  try {
    const response = await client.patch<ClaimTaskProjection>(
      `/api/v1/operator/tasks/${encodeURIComponent(taskId)}`,
      payload,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function completeClaimTask(
  taskId: string,
  expectedStatus: 'OPEN',
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTaskProjection>> {
  try {
    const response = await client.post<ClaimTaskProjection>(
      `/api/v1/operator/tasks/${encodeURIComponent(taskId)}/complete`,
      { expectedStatus },
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function cancelClaimTask(
  taskId: string,
  payload: CancelClaimTaskInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTaskProjection>> {
  try {
    const response = await client.post<ClaimTaskProjection>(
      `/api/v1/operator/tasks/${encodeURIComponent(taskId)}/cancel`,
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
