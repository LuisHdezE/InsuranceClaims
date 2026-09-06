import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type {
  ApiResult,
  ClaimDraft,
  CreateClaimResponse,
  CustomerClaimStatusResponse,
  PolicyVerificationRequest,
  PolicyVerificationResponse,
  TrackClaimRequest,
} from './types';

const browserClient = createApiClient();

export async function verifyPolicyVehicle(
  payload: PolicyVerificationRequest,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PolicyVerificationResponse>> {
  try {
    const response = await client.post<PolicyVerificationResponse>(
      '/api/v1/public/policy-verifications',
      payload,
    );
    return {
      data: response.data,
      requestId: readHeader(response.headers['x-request-id']),
    };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function createClaim(
  verification: PolicyVerificationResponse,
  draft: ClaimDraft,
  idempotencyKey: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CreateClaimResponse>> {
  const formData = new FormData();
  formData.set('policyReference', verification.policyReference);
  formData.set('vehicleReference', verification.vehicleReference);
  formData.set('eventType', draft.eventType);
  formData.set('occurredAt', new Date(draft.occurredAt).toISOString());
  formData.set('locationText', draft.locationText);
  formData.set('description', draft.description);
  for (const file of draft.evidence) formData.append('evidence', file, file.name);

  try {
    const response = await client.post<CreateClaimResponse>(
      '/api/v1/public/claims',
      formData,
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );

    return {
      data: response.data,
      requestId: readHeader(response.headers['x-request-id']),
      idempotencyReplayed:
        readHeader(response.headers['idempotency-replayed'])?.toLowerCase() === 'true',
    };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function trackClaim(
  payload: TrackClaimRequest,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomerClaimStatusResponse>> {
  try {
    const response = await client.post<CustomerClaimStatusResponse>(
      '/api/v1/public/claim-tracking',
      payload,
    );
    return {
      data: response.data,
      requestId: readHeader(response.headers['x-request-id']),
    };
  } catch (error) {
    throw toApiFailure(error);
  }
}

function readHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
