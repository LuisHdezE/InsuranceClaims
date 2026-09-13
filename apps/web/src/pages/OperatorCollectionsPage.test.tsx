import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCollections } from '../api/collections';
import type { CollectionCaseProjection } from '../api/collections-types';
import { OperatorCollectionsPage } from './OperatorCollectionsPage';

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

vi.mock('../api/collections', () => ({ listCollections: vi.fn() }));

const mockedListCollections = vi.mocked(listCollections);

const collection: CollectionCaseProjection = {
  collectionId: 'collection-1',
  customerId: 'customer-1',
  policyId: 'policy-1',
  status: 'OPEN',
  paymentState: 'SERVER_STATE_ALPHA',
  allowedTransitions: ['COMPLETED', 'CANCELLED'],
  version: 5,
  customer: { customerRef: 'CUS-COL-001', displayName: 'Cliente Cobranza API', status: 'ACTIVE' },
  policy: { policyReference: 'POL-COL-001', insurerReference: 'INS-COL-001', recordStatus: 'ACTIVE' },
  pipeline: {
    workItemId: 'work-collection-1',
    consumerType: 'COLLECTION',
    consumerId: 'collection-1',
    pipelineDefinitionId: 'pipeline-definition-1',
    pipelineVersionId: 'pipeline-version-1',
    currentStage: { stageKey: 'CONTACT_ACCOUNT', displayName: 'Contactar cuenta', sortOrder: 1 },
    allowedNextStageKeys: ['FOLLOW_UP'],
    version: 9,
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
      <MemoryRouter><OperatorCollectionsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorCollectionsPage R3', () => {
  beforeEach(() => {
    mockedListCollections.mockReset();
    mockedListCollections.mockResolvedValue({
      data: { items: [collection], page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      requestId: 'req-collections',
    });
  });

  afterEach(() => cleanup());

  it('renders server-authoritative payment state and named operational stage', async () => {
    renderPage();

    expect(await screen.findByText('Cliente Cobranza API')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cobranzas' })).toBeTruthy();
    expect(screen.getByText('POL-COL-001')).toBeTruthy();
    expect(screen.getByText('SERVER_STATE_ALPHA')).toBeTruthy();
    expect(screen.getByText('Contactar cuenta')).toBeTruthy();
    expect(screen.queryByText('CONTACT_ACCOUNT')).toBeNull();
    expect(screen.queryByText(/v5|p9/)).toBeNull();
    expect(mockedListCollections).toHaveBeenCalledWith({ page: 1, pageSize: 25 }, 'test-token');
  });

  it('does not invent financial fields, filters or unsupported actions', async () => {
    renderPage();
    await screen.findByText('Cliente Cobranza API');

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/importe/i)).toBeNull();
    expect(screen.queryByText(/factura/i)).toBeNull();
    expect(screen.queryByText(/recibo/i)).toBeNull();
    expect(screen.queryByText(/vencimiento/i)).toBeNull();
    expect(screen.queryByText(/exportar/i)).toBeNull();
  });
});
