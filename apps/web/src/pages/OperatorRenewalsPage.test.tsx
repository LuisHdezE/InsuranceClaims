import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listRenewals } from '../api/renewals';
import type { RenewalCaseProjection } from '../api/renewals-types';
import { OperatorRenewalsPage } from './OperatorRenewalsPage';

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

vi.mock('../api/renewals', () => ({ listRenewals: vi.fn() }));

const mockedListRenewals = vi.mocked(listRenewals);

const renewal: RenewalCaseProjection = {
  renewalId: 'renewal-1',
  customerId: 'customer-1',
  policyId: 'policy-1',
  status: 'OPEN',
  allowedTransitions: ['COMPLETED', 'CANCELLED'],
  version: 4,
  customer: { customerRef: 'CUS-R3-001', displayName: 'Cliente Renovación API', status: 'ACTIVE' },
  policy: { policyReference: 'POL-R3-001', insurerReference: 'INS-R3-001', recordStatus: 'ACTIVE' },
  pipeline: {
    workItemId: 'work-1',
    consumerType: 'RENEWAL',
    consumerId: 'renewal-1',
    pipelineDefinitionId: 'pipeline-definition-1',
    pipelineVersionId: 'pipeline-version-1',
    currentStage: { stageKey: 'CONTACT_CUSTOMER', displayName: 'Contactar cliente', sortOrder: 1 },
    allowedNextStageKeys: ['REVIEW_OFFER'],
    version: 7,
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
  },
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><OperatorRenewalsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorRenewalsPage R3', () => {
  beforeEach(() => {
    mockedListRenewals.mockReset();
    mockedListRenewals.mockResolvedValue({
      data: { items: [renewal], page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      requestId: 'req-renewals',
    });
  });

  afterEach(() => cleanup());

  it('renders only authoritative renewal list data with visible pipeline naming', async () => {
    renderPage();

    expect(await screen.findByText('Cliente Renovación API')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Renovaciones' })).toBeTruthy();
    expect(screen.getByText('CUS-R3-001')).toBeTruthy();
    expect(screen.getByText('POL-R3-001')).toBeTruthy();
    expect(screen.getByText('Abierta')).toBeTruthy();
    expect(screen.getByText('Contactar cliente')).toBeTruthy();
    expect(screen.queryByText('CONTACT_CUSTOMER')).toBeNull();
    expect(screen.queryByText(/v4|p7/)).toBeNull();
    expect(mockedListRenewals).toHaveBeenCalledWith({ page: 1, pageSize: 25 }, 'test-token');
  });

  it('does not invent filters, pricing or commercial actions absent from the contract', async () => {
    renderPage();
    await screen.findByText('Cliente Renovación API');

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/prima/i)).toBeNull();
    expect(screen.queryByText(/cotizaci/i)).toBeNull();
    expect(screen.queryByText(/oferta/i)).toBeNull();
    expect(screen.queryByText(/exportar/i)).toBeNull();
  });
});
