import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCustomer } from '../api/customer-policy';
import type { CustomerDetail } from '../api/customer-policy-types';
import { OperatorCustomerDetailPage } from './OperatorCustomerDetailPage';

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: { id: 'operator-1', login: 'operator@example.test', role: 'CLAIMS_OPERATOR' },
    },
    signOut: vi.fn(),
  }),
}));

vi.mock('../components/OperatorShell', () => ({
  OperatorShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../api/customer-policy', () => ({
  getCustomer: vi.fn(),
}));

const mockedGetCustomer = vi.mocked(getCustomer);

const customer: CustomerDetail = {
  customerId: 'customer-1',
  customerRef: 'CUS-API-1042',
  displayName: 'María API',
  status: 'ACTIVE',
  version: 4,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
  policies: [
    {
      policyId: 'policy-1',
      customerId: 'customer-1',
      policyReference: 'POL-API-008',
      legacyPolicyReference: 'LEG-POL-008',
      insurerReference: 'INS-01',
      recordStatus: 'ACTIVE',
      operationalMetadata: {},
      version: 9,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-09-10T10:00:00.000Z',
      assets: [
        {
          assetId: 'asset-1',
          assetType: 'VEHICLE',
          assetReference: 'UY-ABC-123',
          legacyAssetReference: 'LEG-ASSET-1',
          metadata: {},
          createdAt: '2026-08-01T10:00:00.000Z',
        },
      ],
    },
  ],
  claims: [
    {
      claimId: 'claim-1',
      trackingCode: 'CLM-API-141',
      status: 'UNDER_REVIEW',
      policyReference: 'POL-API-008',
      vehicleReference: 'UY-ABC-123',
      occurredAt: '2026-09-11T12:00:00.000Z',
      createdAt: '2026-09-11T12:30:00.000Z',
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/customers/customer-1']}>
        <Routes>
          <Route path="/operator/customers/:customerId" element={<OperatorCustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorCustomerDetailPage R3 Customer 360', () => {
  beforeEach(() => {
    mockedGetCustomer.mockReset();
    mockedGetCustomer.mockResolvedValue({ data: customer, requestId: 'req-customer' });
  });

  afterEach(() => cleanup());

  it('renders authoritative Customer 360 relations with Spanish Claim labels and permission-aware links', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cliente 360' })).toBeTruthy();
    expect(screen.getByText('María API')).toBeTruthy();
    expect(screen.getAllByText('CUS-API-1042')).toHaveLength(2);
    expect(screen.getByText('POL-API-008')).toBeTruthy();
    expect(screen.getByText('Legacy: LEG-POL-008')).toBeTruthy();
    expect(screen.getByText('INS-01')).toBeTruthy();
    expect(screen.getByText('CLM-API-141')).toBeTruthy();
    expect(screen.getByText('POL-API-008 · UY-ABC-123')).toBeTruthy();
    expect(screen.getByText('En revisión')).toBeTruthy();
    expect(screen.queryByText('UNDER REVIEW')).toBeNull();

    expect(screen.getByRole('link', { name: 'Abrir póliza 360 →' }).getAttribute('href')).toBe('/operator/policies/policy-1');
    expect(screen.getByText('CLM-API-141').closest('a')?.getAttribute('href')).toBe('/operator/claims/claim-1');
    expect(mockedGetCustomer).toHaveBeenCalledWith('customer-1', 'test-token');
  });

  it('keeps record version secondary and does not surface unsupported Customer attributes or actions', async () => {
    renderPage();
    await screen.findByText('María API');

    expect(screen.getByText('Versión de registro: v4')).toBeTruthy();
    expect(screen.queryByText('v9')).toBeNull();
    expect(screen.queryByText(/correo/i)).toBeNull();
    expect(screen.queryByText(/teléfono/i)).toBeNull();
    expect(screen.queryByText(/saldo/i)).toBeNull();
    expect(screen.queryByText(/editar cliente/i)).toBeNull();
    expect(screen.queryByText(/crear póliza/i)).toBeNull();
  });
});
