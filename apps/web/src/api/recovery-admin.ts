import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  DeadLetterListInput,
  DeadLetterMutationInput,
  DeadLetterProjection,
  DeadLettersPageResponse,
  IntegrationEventStatusProjection,
} from './recovery-admin-types';

const browserClient = createApiClient();

export async function listDeadLetters(
  input: DeadLetterListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<DeadLettersPageResponse>> {
  try {
    const response = await client.get<DeadLettersPageResponse>('/api/v1/admin/dead-letters', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getDeadLetter(
  deadLetterId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<DeadLetterProjection>> {
  try {
    const response = await client.get<DeadLetterProjection>(
      `/api/v1/admin/dead-letters/${encodeURIComponent(deadLetterId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function requeueDeadLetter(
  deadLetterId: string,
  input: DeadLetterMutationInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<DeadLetterProjection>> {
  try {
    const response = await client.post<DeadLetterProjection>(
      `/api/v1/admin/dead-letters/${encodeURIComponent(deadLetterId)}/requeue`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function resolveDeadLetter(
  deadLetterId: string,
  input: DeadLetterMutationInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<DeadLetterProjection>> {
  try {
    const response = await client.post<DeadLetterProjection>(
      `/api/v1/admin/dead-letters/${encodeURIComponent(deadLetterId)}/resolve`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getIntegrationEventStatus(
  eventId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<IntegrationEventStatusProjection>> {
  try {
    const response = await client.get<IntegrationEventStatusProjection>(
      `/api/v1/admin/integration-events/${encodeURIComponent(eventId)}`,
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
