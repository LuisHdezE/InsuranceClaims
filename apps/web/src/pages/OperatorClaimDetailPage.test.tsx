import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClaimDetail, transitionClaimStatus } from '../api/claims';
import { OperatorClaimDetailPage } from './OperatorClaimDetailPage';

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
vi.mock('../components/ClaimOperationalStagePanel', () => ({
  ClaimOperationalStagePanel: () => <section><h2>Etapa API</h2></section>,
}));
vi.mock('../components/ClaimTasksPanel', () => ({
  ClaimTasksPanel: () => <section><h2>Tareas API</h2></section>,
}));
vi.mock('../components/ClaimEvidenceAttentionPanel', () => ({
  ClaimEvidenceAttentionPanel: () => <section><h2>Evidencia API</h2></section>,
}));
vi.mock('../components/ClaimTimelinePanel', () => ({
  ClaimTimelinePanel: () => <section><h2>Historial API</h2></section>,
}));
vi.mock('../api/claims', () => ({
  getClaimDetail: vi.fn(),
  transitionClaimStatus: vi.fn(),
}));

const mockedGetClaimDetail = vi.mocked(getClaimDetail);
const mockedTransition = vi.mocked(transitionClaimStatus);

const detailResponse = {
  data: {
    claimId: 'claim-api-1',
    trackingCode: 'CLM-API-001',
    status: 'RECEIVED' as const,
    occurredAt: '2026-09-12T16:00:00.000Z',
    eventType: 'COLLISION',
    locationText: 'Montevideo',
    description: 'Descripción autoritativa desde API',
    policyReference: 'POL-API-001',
    vehicleReference: 'UY-API-123',
    verifiedCustomerLabel: 'Cliente API',
    allowedTransitions: ['UNDER_REVIEW' as const],
    evidence: [],
    history: [],
    auditEvents: [],
    createdAt: '2026-09-12T16:05:00.000Z',
    updatedAt: '2026-09-12T17:00:00.000Z',
  },
  requestId: 'req-detail',
};

const transitionResponse = {
  data: {
    claimId: 'claim-api-1',
    fromStatus: 'RECEIVED' as const,
    toStatus: 'UNDER_REVIEW' as const,
    status: 'UNDER_REVIEW' as const,
    allowedTransitions: ['OBSERVED' as const, 'APPROVED' as const],
    transitionedAt: '2026-09-12T17:05:00.000Z',
  },
  requestId: 'req-transition',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/claims/claim-api-1']}>
        <Routes>
          <Route path="/operator/claims/:claimId" element={<OperatorClaimDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorClaimDetailPage R3 detail', () => {
  beforeEach(() => {
    mockedGetClaimDetail.mockReset();
    mockedTransition.mockReset();
    mockedGetClaimDetail.mockResolvedValue(detailResponse);
    mockedTransition.mockResolvedValue(transitionResponse);
  });

  afterEach(() => cleanup());

  it('renders API detail and only navigation anchors backed by implemented capabilities', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: detailResponse.data.trackingCode })).toBeTruthy();
    expect(screen.getAllByText(detailResponse.data.policyReference, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText(detailResponse.data.description)).toBeTruthy();
    expect(screen.getByText(detailResponse.data.verifiedCustomerLabel)).toBeTruthy();

    const nav = screen.getByRole('navigation', { name: 'Secciones del siniestro' });
    expect(nav.querySelector('a[href="#resumen"]')).not.toBeNull();
    expect(nav.querySelector('a[href="#flujo"]')).not.toBeNull();
    expect(nav.querySelector('a[href="#etapa"]')).not.toBeNull();
    expect(nav.querySelector('a[href="#tareas"]')).not.toBeNull();
    expect(nav.querySelector('a[href="#evidencia"]')).not.toBeNull();
    expect(nav.querySelector('a[href="#historial"]')).not.toBeNull();
    expect(nav.querySelector('a[href="#auditoria"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Comunicaciones' })).toBeNull();
  });

  it('offers only server-provided ClaimStatus transitions', async () => {
    renderPage();
    await screen.findByRole('heading', { name: detailResponse.data.trackingCode });

    const select = screen.getByLabelText('Transición autorizada') as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(['', 'UNDER_REVIEW']);
    expect(screen.queryByRole('option', { name: 'Aprobado' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'En reparación' })).toBeNull();
  });

  it('submits expectedFromStatus from the current API detail', async () => {
    renderPage();
    await screen.findByRole('heading', { name: detailResponse.data.trackingCode });

    fireEvent.change(screen.getByLabelText('Transición autorizada'), { target: { value: 'UNDER_REVIEW' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mockedTransition).toHaveBeenCalledWith(
      'claim-api-1',
      { expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' },
      'test-token',
    ));
  });
});
