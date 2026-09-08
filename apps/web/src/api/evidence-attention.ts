import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type { ClaimEvidenceAttentionResponse } from './evidence-attention-types';

const browserClient = createApiClient();

export async function getClaimEvidenceAttention(
  claimId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimEvidenceAttentionResponse>> {
  try {
    const response = await client.get<ClaimEvidenceAttentionResponse>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/evidence-attention`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

function readHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}
