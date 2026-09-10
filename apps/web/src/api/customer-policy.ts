import type { AxiosInstance } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';
import type {
  CustomerDetail,
  CustomerListInput,
  CustomerListItem,
  PageResponse,
  PolicyDetail,
  PolicyListInput,
  PolicyListItem,
} from './customer-policy-types';

const browserClient = createApiClient();

export async function listCustomers(
  input: CustomerListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PageResponse<CustomerListItem>>> {
  try {
    const response = await client.get<PageResponse<CustomerListItem>>('/api/v1/operator/customers', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getCustomer(
  customerId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<CustomerDetail>> {
  try {
    const response = await client.get<CustomerDetail>(
      `/api/v1/operator/customers/${encodeURIComponent(customerId)}`,
      { headers: bearerHeaders(accessToken) },
    );
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function listPolicies(
  input: PolicyListInput,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PageResponse<PolicyListItem>>> {
  try {
    const response = await client.get<PageResponse<PolicyListItem>>('/api/v1/operator/policies', {
      params: input,
      headers: bearerHeaders(accessToken),
    });
    return { data: response.data, requestId: readHeader(response.headers['x-request-id']) };
  } catch (error) {
    throw toApiFailure(error);
  }
}

export async function getPolicy(
  policyId: string,
  accessToken: string,
  client: AxiosInstance = browserClient,
): Promise<ApiResult<PolicyDetail>> {
  try {
    const response = await client.get<PolicyDetail>(
      `/api/v1/operator/policies/${encodeURIComponent(policyId)}`,
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
