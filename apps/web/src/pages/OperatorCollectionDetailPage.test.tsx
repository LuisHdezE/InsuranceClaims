import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCollection, moveCollectionStage, transitionCollection } from '../api/collections';
import type { CollectionCaseProjection } from '../api/collections-types';
import { OperatorCollectionDetailPage } from './OperatorCollectionDetailPage';

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

vi.mock('../api/collections', () => ({
  getCollection: vi.fn(),
  transitionCollection: vi.fn(),
  moveCollectionStage: vi.fn(),
}));

const mockedGetCollection = vi.mocked(getCollection);
const mockedTransitionCollection = vi.mocked(transitionCollection);
const mockedMoveCollectionStage = vi.mocked(moveCollectionStage);

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
      <MemoryRouter initialEntries={['/operator/collections/collection-1']}>
        <Routes><Route path="/operator/collections/:collectionId" element={<OperatorCollectionDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorCollectionDetailPage R3', () => {
  beforeEach(() => {
    mockedGetCollection.mockReset();
    mockedTransitionCollection.mockReset();
    mockedMoveCollectionStage.mockReset();
    mockedGetCollection.mockResolvedValue({ data: collection, requestId: 'req-collection' });
    mockedTransitionCollection.mockResolvedValue({ data: collection, requestId: 'req-transition' });
    mockedMoveCollectionStage.mockResolvedValue({ data: collection.pipeline!, requestId: 'req-stage' });
  });

  afterEach(() => cleanup());

  it('shows payment state as authoritative read-only data because the catalog is not published', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cliente Cobranza API' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ciclo de vida' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Estado de pago' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pipeline operativo' })).toBeTruthy();
    expect(screen.getAllByText('SERVER_STATE_ALPHA').length).toBeGreaterThan(0);
    expect(screen.getByText(/todavía no publica el catálogo permitido/i)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Verificar y aplicar/i })).toBeNull();
    expect(screen.queryByText(/Código de estado aprobado/i)).toBeNull();
  });

  it('keeps lifecycle and pipeline mutations governed by their server versions', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Cliente Cobranza API' });

    expect(screen.getByRole('link', { name: 'Abrir Cliente 360 →' }).getAttribute('href')).toBe('/operator/customers/customer-1');
    expect(screen.getByRole('link', { name: 'Abrir Póliza 360 →' }).getAttribute('href')).toBe('/operator/policies/policy-1');
    expect(screen.getByText('Clave: CONTACT_ACCOUNT')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Completar cobranza' }));
    await waitFor(() => expect(mockedTransitionCollection).toHaveBeenCalledWith(
      'collection-1',
      { toStatus: 'COMPLETED', expectedVersion: 5 },
      'test-token',
    ));

    fireEvent.click(screen.getByRole('button', { name: /Mover a FOLLOW_UP/ }));
    await waitFor(() => expect(mockedMoveCollectionStage).toHaveBeenCalledWith(
      'collection-1',
      { toStageKey: 'FOLLOW_UP', expectedVersion: 9 },
      'test-token',
    ));
  });
});
