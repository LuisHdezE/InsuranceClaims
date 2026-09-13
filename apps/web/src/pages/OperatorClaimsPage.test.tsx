import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listClaims } from '../api/claims';
import { OperatorClaimsPage } from './OperatorClaimsPage';

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

vi.mock('../api/claims', () => ({ listClaims: vi.fn() }));

const mockedListClaims = vi.mocked(listClaims);
const receivedClaim = {
  claimId: 'claim-api-1',
  trackingCode: 'CLM-API-001',
  status: 'RECEIVED' as const,
  occurredAt: '2026-09-12T16:00:00.000Z',
  policyReference: 'POL-API-001',
  vehicleReference: 'UY-API-123',
  operationalStage: { stageKey: 'INTAKE', displayName: 'Recepción técnica', sortOrder: 1 },
  operationalWorkItemVersion: 4,
  createdAt: '2026-09-12T16:05:00.000Z',
};

function responseFor(status?: string) {
  const items = status === 'RECEIVED' ? [receivedClaim] : [];
  return {
    data: { items, page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length ? 1 : 0 },
    requestId: `req-${status ?? 'all'}`,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/claims']}>
        <OperatorClaimsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorClaimsPage R3 workspace', () => {
  beforeEach(() => {
    mockedListClaims.mockReset();
    mockedListClaims.mockImplementation(async (params) => responseFor(params.status));
  });

  afterEach(() => cleanup());

  it('renders claim card content exclusively from API list responses', async () => {
    renderPage();

    expect(await screen.findByText(receivedClaim.trackingCode)).toBeTruthy();
    expect(screen.getByText(receivedClaim.policyReference)).toBeTruthy();
    expect(screen.getByText(receivedClaim.vehicleReference)).toBeTruthy();
    expect(screen.getByText(receivedClaim.operationalStage.displayName)).toBeTruthy();

    await waitFor(() => expect(mockedListClaims).toHaveBeenCalledTimes(6));
    expect(mockedListClaims).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20, status: 'RECEIVED', sort: 'createdAt:desc' }),
      'test-token',
    );

    expect(screen.queryByRole('button', { name: /nuevo siniestro/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /nuevo siniestro/i })).toBeNull();
  });

  it('uses the selected status as an API filter and switches to list view', async () => {
    renderPage();
    await screen.findByText(receivedClaim.trackingCode);

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'OBSERVED' } });

    await waitFor(() => {
      const observedCalls = mockedListClaims.mock.calls.filter(([params]) => params.status === 'OBSERVED');
      expect(observedCalls.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('No hay resultados para los filtros actuales.')).toBeTruthy();
  });

  it('sends submitted search text to the API instead of filtering business records locally', async () => {
    renderPage();
    await screen.findByText(receivedClaim.trackingCode);

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'POL-API-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(mockedListClaims).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'POL-API-001' }),
      'test-token',
    ));
    expect(screen.getByText(/Resultados para/)).toBeTruthy();
  });
});
