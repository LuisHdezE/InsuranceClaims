import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listPolicies } from '../api/customer-policy';
import type { PolicyListItem } from '../api/customer-policy-types';
import { OperatorPoliciesPage } from './OperatorPoliciesPage';

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
  listPolicies: vi.fn(),
}));

const mockedListPolicies = vi.mocked(listPolicies);

const policy: PolicyListItem = {
  policyId: 'policy-1',
  customerId: 'customer-1',
  policyReference: 'POL-API-008',
  legacyPolicyReference: 'LEG-POL-008',
  insurerReference: 'INS-01',
  recordStatus: 'ACTIVE',
  operationalMetadata: {},
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
    metadata: {},
    createdAt: '2026-08-01T10:00:00.000Z',
  }],
  claimCount: 2,
};

function page(items = [policy]) {
  return {
    data: { items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 },
    requestId: 'req-policies',
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/policies']}>
        <OperatorPoliciesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorPoliciesPage R3 directory', () => {
  beforeEach(() => {
    mockedListPolicies.mockReset();
    mockedListPolicies.mockResolvedValue(page());
  });

  afterEach(() => cleanup());

  it('renders the authoritative policy directory without unsupported business actions', async () => {
    renderPage();

    expect(await screen.findByText('POL-API-008')).toBeTruthy();
    expect(screen.getByText('Legacy: LEG-POL-008')).toBeTruthy();
    expect(screen.getByText('María API')).toBeTruthy();
    expect(screen.getByText('CUS-API-1042')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();
    expect(screen.getByText('v7')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir 360 →' }).getAttribute('href')).toBe('/operator/policies/policy-1');

    expect(screen.queryByText(/crear póliza/i)).toBeNull();
    expect(screen.queryByText(/editar póliza/i)).toBeNull();
    expect(screen.queryByText(/eliminar póliza/i)).toBeNull();
    expect(screen.queryByText(/exportar/i)).toBeNull();
    expect(screen.queryByText(/prima/i)).toBeNull();
    expect(screen.queryByText(/vigencia/i)).toBeNull();
  });

  it('sends search and status filters to the API with the canonical page size', async () => {
    renderPage();
    await screen.findByText('POL-API-008');

    expect(mockedListPolicies).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, search: undefined, status: undefined },
      'test-token',
    );

    fireEvent.change(screen.getByLabelText('Buscar póliza'), { target: { value: 'POL-API' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(mockedListPolicies).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, search: 'POL-API', status: undefined },
      'test-token',
    ));

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'INACTIVE' } });

    await waitFor(() => expect(mockedListPolicies).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, search: 'POL-API', status: 'INACTIVE' },
      'test-token',
    ));
  });
});
