import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  CollectionCaseProjection,
  CollectionListInput,
  CollectionPageResponse,
  CollectionPipelineProjection,
  MoveCollectionStageInput,
  TransitionCollectionInput,
  UpdateCollectionPaymentStateInput,
} from './collections-types';

const browserClient = createApiClient();

export async function listCollections(
  input: CollectionListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CollectionPageResponse>> {
  try {
    const response = await client.get<CollectionPageResponse>('/api/v1/operator/collections', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getCollection(
  collectionId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CollectionCaseProjection>> {
  try {
    const response = await client.get<CollectionCaseProjection>(
      `/api/v1/operator/collections/${encodeURIComponent(collectionId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function transitionCollection(
  collectionId: string,
  input: TransitionCollectionInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CollectionCaseProjection>> {
  try {
    const response = await client.post<CollectionCaseProjection>(
      `/api/v1/operator/collections/${encodeURIComponent(collectionId)}/transitions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function moveCollectionStage(
  collectionId: string,
  input: MoveCollectionStageInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CollectionPipelineProjection>> {
  try {
    const response = await client.post<CollectionPipelineProjection>(
      `/api/v1/operator/collections/${encodeURIComponent(collectionId)}/operational-transitions`,
      input,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function updateCollectionPaymentState(
  collectionId: string,
  input: UpdateCollectionPaymentStateInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CollectionCaseProjection>> {
  try {
    const response = await client.patch<CollectionCaseProjection>(
      `/api/v1/operator/collections/${encodeURIComponent(collectionId)}/payment-state`,
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
