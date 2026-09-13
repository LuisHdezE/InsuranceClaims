import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClaimsOperationalMetrics } from '../api/claims-work';
import { OperatorAnalyticsPage } from './OperatorAnalyticsPage';

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: {
        id: 'supervisor-1',
        login: 'supervisor@example.test',
        role: 'CLAIMS_SUPERVISOR',
      },
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../components/OperatorShell', () => ({
  OperatorShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../api/claims-work', () => ({
  getClaimsOperationalMetrics: vi.fn(),
}));

const mockedMetrics = vi.mocked(getClaimsOperationalMetrics);

const metricsResponse = {
  data: {
    window: {
      from: '2026-08-14T12:00:00.000Z',
      to: '2026-09-13T12:00:00.000Z',
      semantics: '[from,to)' as const,
    },
    generatedAt: '2026-09-13T12:00:00.000Z',
    openClaims: 128,
    reportedInWindow: 42,
    claimsByStatus: {
      RECEIVED: 48,
      UNDER_REVIEW: 61,
      OBSERVED: 20,
      APPROVED: 26,
      IN_REPAIR: 35,
      CLOSED: 72,
    },
    claimsByOperationalStage: [
      { stageKey: 'INTAKE', displayName: 'Ingreso', count: 52 },
      { stageKey: 'ASSESSMENT', displayName: 'Evaluación', count: 63 },
      { stageKey: 'RESOLUTION', displayName: 'Resolución', count: 37 },
    ],
    evidencePendingReviewClaims: 17,
    openTasks: 64,
    overdueTasks: 9,
    closedClaims: 311,
  },
  requestId: 'req-analytics',
};

function renderAnalytics() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/analytics']}>
        <OperatorAnalyticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectKpi(label: string, value: number) {
  const card = screen.getByText(label).closest('article');
  expect(card).not.toBeNull();
  expect(within(card!).getByText(String(value))).toBeTruthy();
}

describe('OperatorAnalyticsPage', () => {
  beforeEach(() => {
    mockedMetrics.mockReset();
    mockedMetrics.mockResolvedValue(metricsResponse);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders only the authoritative R3 analytics contract', async () => {
    renderAnalytics();

    expect(await screen.findByText('Respuesta R3 autoritativa')).toBeTruthy();
    await waitFor(() => expect(mockedMetrics).toHaveBeenCalledTimes(1));

    expect(mockedMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
      'test-token',
    );

    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: 'Últimos 7 días' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Últimos 30 días' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Últimos 90 días' })).toBeTruthy();

    expectKpi('Claims abiertos', 128);
    expectKpi('Reportados 30d', 42);
    expectKpi('Claims cerrados', 311);
    expectKpi('Tareas abiertas', 64);
    expectKpi('Tareas vencidas', 9);
    expectKpi('Evidencia pendiente', 17);

    for (const label of ['Recibidos', 'En revisión', 'Observados', 'Aprobados', 'En reparación', 'Cerrados']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    for (const status of ['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED']) {
      expect(screen.getByText(status)).toBeTruthy();
    }

    expect(screen.getByText('Ingreso')).toBeTruthy();
    expect(screen.getByText('INTAKE')).toBeTruthy();
    expect(screen.getByText('Evaluación')).toBeTruthy();
    expect(screen.getByText('ASSESSMENT')).toBeTruthy();
    expect(screen.getByText('Resolución')).toBeTruthy();
    expect(screen.getByText('RESOLUTION')).toBeTruthy();

    expect(screen.getAllByText('[from,to)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/reportedInWindow/)).toBeTruthy();
    expect(screen.getByText(/snapshots calculados/i)).toBeTruthy();

    expect(screen.queryByText(/exportar/i)).toBeNull();
    expect(screen.queryByText(/drill.?down/i)).toBeNull();
    expect(screen.queryByText(/forecast/i)).toBeNull();
    expect(screen.queryByText(/comparar períodos/i)).toBeNull();
    expect(screen.queryByText(/métrica financiera/i)).toBeNull();
  });

  it('limits the time selector to 7, 30 and 90 days and supports manual refresh', async () => {
    renderAnalytics();
    await screen.findByText('Respuesta R3 autoritativa');

    const select = screen.getByRole('combobox', { name: 'Ventana' }) as HTMLSelectElement;
    expect(select.value).toBe('30');

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(mockedMetrics).toHaveBeenCalledTimes(2));

    fireEvent.change(select, { target: { value: '7' } });
    await waitFor(() => expect(mockedMetrics.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(select.value).toBe('7');
    expect(screen.getByText('Reportados 7d')).toBeTruthy();
  });
});
