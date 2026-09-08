import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type { ClaimTimelineResponse } from './timeline-types';

const browserClient = createApiClient();

export async function getClaimTimeline(
  claimId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<ClaimTimelineResponse>> {
  try {
    const response = await client.get<ClaimTimelineResponse>(
      `/api/v1/operator/claims/${encodeURIComponent(claimId)}/timeline`,
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
