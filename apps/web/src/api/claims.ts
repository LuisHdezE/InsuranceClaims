import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type {
  ApiResult,
  ClaimDraft,
  ClaimsPageResponse,
  ClaimStatus,
  CreateClaimResponse,
  CustomerClaimStatusResponse,
  EvidenceDownload,
  OperatorClaimDetailResponse,
  OperatorLoginRequest,
  OperatorLoginResponse,
  PolicyVerificationRequest,
  PolicyVerificationResponse,
  TrackClaimRequest,
  TransitionClaimStatusRequest,
  TransitionClaimStatusResponse,
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

export async function authenticateOperator(
  payload: OperatorLoginRequest,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<OperatorLoginResponse>> {
  try {
    const response = await client.post<OperatorLoginResponse>('/api/v1/operator/auth/login', payload);
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function listClaims(
  input: { page?: number; pageSize?: number; status?: ClaimStatus },
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimsPageResponse>> {
  try {
    const response = await client.get<ClaimsPageResponse>('/api/v1/operator/claims', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getClaimDetail(
  claimId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<OperatorClaimDetailResponse>> {
  try {
    const response = await client.get<OperatorClaimDetailResponse>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function downloadClaimEvidence(
  claimId: string,
  evidenceId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<EvidenceDownload>> {
  try {
    const response = await client.get<ArrayBuffer>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/evidence/${encodeURIComponent(evidenceId)}`,
      { headers: bearerHeaders(accessToken), responseType: 'arraybuffer' },
    );
    return {
      data: {
        bytes: response.data,
        mediaType: readHeader(response.headers['content-type']) ?? 'application/octet-stream',
        filename: parseFilename(readHeader(response.headers['content-disposition'])),
      },
      requestId: readHeader(response.headers['x-request-id']),
    };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function transitionClaimStatus(
  claimId: string,
  payload: TransitionClaimStatusRequest,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<TransitionClaimStatusResponse>> {
  try {
    const response = await client.post<TransitionClaimStatusResponse>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/transitions`,
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

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const encoded = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return contentDisposition.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
}

function readHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
