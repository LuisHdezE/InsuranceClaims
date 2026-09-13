import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPolicy } from '../api/customer-policy';
import type { PolicyDetail } from '../api/customer-policy-types';
import { OperatorPolicyDetailPage } from './OperatorPolicyDetailPage';

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
  getPolicy: vi.fn(),
}));

const mockedGetPolicy = vi.mocked(getPolicy);

const policy: PolicyDetail = {
  policyId: 'policy-1',
  customerId: 'customer-1',
  policyReference: 'POL-API-008',
  legacyPolicyReference: 'LEG-POL-008',
  insurerReference: 'INS-01',
  recordStatus: 'ACTIVE',
  operationalMetadata: { source: 'SYNTHETIC_API' },
  version: 7,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
  customer: {
    customerId: 'customer-1',
    customerRef: 'CUS-API-1042',
    displayName: 'María API',
    status: 'ACTIVE',
    version: 4,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
  },
  assets: [{
    assetId: 'asset-1',
    assetType: 'VEHICLE',
    assetReference: 'UY-ABC-123',
    legacyAssetReference: 'LEG-ASSET-1',
    metadata: { source: 'LEGACY_SIMULATOR' },
    createdAt: '2026-08-01T10:00:00.000Z',
  }],
  claims: [{
    claimId: 'claim-1',
    trackingCode: 'CLM-API-141',
    status: 'OBSERVED',
    policyReference: 'POL-API-008',
    vehicleReference: 'UY-ABC-123',
    occurredAt: '2026-09-11T12:00:00.000Z',
    createdAt: '2026-09-11T12:30:00.000Z',
  }],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/policies/policy-1']}>
        <Routes>
          <Route path="/operator/policies/:policyId" element={<OperatorPolicyDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorPolicyDetailPage R3 Policy 360', () => {
  beforeEach(() => {
    mockedGetPolicy.mockReset();
    mockedGetPolicy.mockResolvedValue({ data: policy, requestId: 'req-policy' });
  });

  afterEach(() => cleanup());

  it('renders authoritative Policy 360 relations with human labels and permission-aware links', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Póliza 360' })).toBeTruthy();
    expect(screen.getAllByText('POL-API-008')).toHaveLength(2);
    expect(screen.getByText('LEG-POL-008')).toBeTruthy();
    expect(screen.getByText('María API')).toBeTruthy();
    expect(screen.getByText('CUS-API-1042')).toBeTruthy();
    expect(screen.getByText('Vehículo')).toBeTruthy();
    expect(screen.queryByText('VEHICLE')).toBeNull();
    expect(screen.getByText('CLM-API-141')).toBeTruthy();
    expect(screen.getByText('Requiere información')).toBeTruthy();
    expect(screen.queryByText('OBSERVED')).toBeNull();

    expect(screen.getByRole('link', { name: 'Abrir Cliente 360 →' }).getAttribute('href')).toBe('/operator/customers/customer-1');
    expect(screen.getByText('CLM-API-141').closest('a')?.getAttribute('href')).toBe('/operator/claims/claim-1');
    expect(mockedGetPolicy).toHaveBeenCalledWith('policy-1', 'test-token');
  });

  it('keeps record version secondary and excludes commercial or mutating fields outside the R3 contract', async () => {
    renderPage();
    await screen.findByText('POL-API-008');

    expect(screen.getByText('Versión de registro: v7')).toBeTruthy();
    expect(screen.getByText('SYNTHETIC_API')).toBeTruthy();
    expect(screen.getByText('LEGACY_SIMULATOR')).toBeTruthy();
    expect(screen.queryByText(/prima anual/i)).toBeNull();
    expect(screen.queryByText(/vigencia/i)).toBeNull();
    expect(screen.queryByText(/moneda/i)).toBeNull();
    expect(screen.queryByText(/cobertura comercial/i)).toBeNull();
    expect(screen.queryByText(/editar póliza/i)).toBeNull();
    expect(screen.queryByText(/eliminar póliza/i)).toBeNull();
  });
});
