import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { getCustomer, getPolicy, listCustomers, listPolicies } from './customer-policy';

function clientWith(overrides: Record<string, unknown>) {
  return overrides as unknown as AxiosInstance;
}

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const POLICY_ID = '22222222-2222-4222-8222-222222222222';

describe('R3 Customer & Policy 360 web client', () => {
  it('lists customers with server-side search, status and bearer authorization', async () => {
    const get = vi.fn().mockResolvedValue({ data: { items: [], page: 2 }, headers: { 'x-request-id': 'req-customers' } });
    const result = await listCustomers(
      { page: 2, pageSize: 25, search: 'CUS-100', status: 'ACTIVE' },
      'staff-token',
      clientWith({ get }),
    );

    expect(get).toHaveBeenCalledWith('/api/v1/operator/customers', {
      params: { page: 2, pageSize: 25, search: 'CUS-100', status: 'ACTIVE' },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(result.requestId).toBe('req-customers');
  });

  it('reads a customer detail resource by encoded id', async () => {
    const get = vi.fn().mockResolvedValue({ data: { customerId: CUSTOMER_ID }, headers: {} });
    await getCustomer(CUSTOMER_ID, 'staff-token', clientWith({ get }));
    expect(get).toHaveBeenCalledWith(`/api/v1/operator/customers/${CUSTOMER_ID}`, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });

  it('lists policies with the R3 status filter and opens policy detail', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ data: { items: [], page: 1 }, headers: {} })
      .mockResolvedValueOnce({ data: { policyId: POLICY_ID }, headers: {} });
    const client = clientWith({ get });

    await listPolicies({ page: 1, pageSize: 50, search: 'POL-', status: 'INACTIVE' }, 'staff-token', client);
    await getPolicy(POLICY_ID, 'staff-token', client);

    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/operator/policies', {
      params: { page: 1, pageSize: 50, search: 'POL-', status: 'INACTIVE' },
      headers: { Authorization: 'Bearer staff-token' },
    });
    expect(get).toHaveBeenNthCalledWith(2, `/api/v1/operator/policies/${POLICY_ID}`, {
      headers: { Authorization: 'Bearer staff-token' },
    });
  });
});
