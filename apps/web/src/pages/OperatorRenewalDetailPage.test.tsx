import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRenewal, moveRenewalStage, transitionRenewal } from '../api/renewals';
import type { RenewalCaseProjection } from '../api/renewals-types';
import { OperatorRenewalDetailPage } from './OperatorRenewalDetailPage';

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

vi.mock('../api/renewals', () => ({
  getRenewal: vi.fn(),
  transitionRenewal: vi.fn(),
  moveRenewalStage: vi.fn(),
}));

const mockedGetRenewal = vi.mocked(getRenewal);
const mockedTransitionRenewal = vi.mocked(transitionRenewal);
const mockedMoveRenewalStage = vi.mocked(moveRenewalStage);

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
      <MemoryRouter initialEntries={['/operator/renewals/renewal-1']}>
        <Routes><Route path="/operator/renewals/:renewalId" element={<OperatorRenewalDetailPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorRenewalDetailPage R3', () => {
  beforeEach(() => {
    mockedGetRenewal.mockReset();
    mockedTransitionRenewal.mockReset();
    mockedMoveRenewalStage.mockReset();
    mockedGetRenewal.mockResolvedValue({ data: renewal, requestId: 'req-renewal' });
    mockedTransitionRenewal.mockResolvedValue({ data: renewal, requestId: 'req-transition' });
    mockedMoveRenewalStage.mockResolvedValue({ data: renewal.pipeline!, requestId: 'req-stage' });
  });

  afterEach(() => cleanup());

  it('keeps lifecycle and pipeline separate while using server versions internally', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Cliente Renovación API' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ciclo de vida' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Pipeline operativo' })).toBeTruthy();
    expect(screen.getAllByText('Contactar cliente').length).toBeGreaterThan(0);
    expect(screen.getByText('Clave: CONTACT_CUSTOMER')).toBeTruthy();
    expect(screen.queryByText(/Versión esperada/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Completar renovación' }));
    await waitFor(() => expect(mockedTransitionRenewal).toHaveBeenCalledWith(
      'renewal-1',
      { toStatus: 'COMPLETED', expectedVersion: 4 },
      'test-token',
    ));
  });

  it('uses the pipeline work-item version and permission-aware 360 links', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Cliente Renovación API' });

    expect(screen.getByRole('link', { name: 'Abrir Cliente 360 →' }).getAttribute('href')).toBe('/operator/customers/customer-1');
    expect(screen.getByRole('link', { name: 'Abrir Póliza 360 →' }).getAttribute('href')).toBe('/operator/policies/policy-1');

    fireEvent.click(screen.getByRole('button', { name: /Mover a REVIEW_OFFER/ }));
    await waitFor(() => expect(mockedMoveRenewalStage).toHaveBeenCalledWith(
      'renewal-1',
      { toStageKey: 'REVIEW_OFFER', expectedVersion: 7 },
      'test-token',
    ));
    expect(mockedGetRenewal).toHaveBeenCalledWith('renewal-1', 'test-token');
  });
});
