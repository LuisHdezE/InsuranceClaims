import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listClaims } from '../api/claims';
import { getClaimsOperationalMetrics } from '../api/claims-work';
import { listTasks } from '../api/tasks';
import type { StaffRole } from '../api/types';
import { OperatorDashboardPage } from './OperatorDashboardPage';

const sessionState = vi.hoisted(() => ({
  role: 'CLAIMS_SUPERVISOR' as StaffRole,
  signOut: vi.fn(),
}));

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: {
        id: 'operator-1',
        login: 'supervisor@example.test',
        role: sessionState.role,
      },
    },
    signIn: vi.fn(),
    signOut: sessionState.signOut,
  }),
}));

vi.mock('../api/claims', () => ({ listClaims: vi.fn() }));
vi.mock('../api/claims-work', () => ({ getClaimsOperationalMetrics: vi.fn() }));
vi.mock('../api/tasks', () => ({ listTasks: vi.fn() }));

const mockedListClaims = vi.mocked(listClaims);
const mockedMetrics = vi.mocked(getClaimsOperationalMetrics);
const mockedListTasks = vi.mocked(listTasks);

const metricsResponse = {
  data: {
    window: {
      from: '2026-08-14T12:00:00.000Z',
      to: '2026-09-13T12:00:00.000Z',
      semantics: '[from,to)' as const,
    },
    generatedAt: '2026-09-13T12:00:00.000Z',
    openClaims: 18,
    reportedInWindow: 9,
    claimsByStatus: {
      RECEIVED: 4,
      UNDER_REVIEW: 6,
      OBSERVED: 2,
      APPROVED: 3,
      IN_REPAIR: 3,
      CLOSED: 11,
    },
    claimsByOperationalStage: [
      { stageKey: 'INTAKE', displayName: 'Intake', count: 5 },
      { stageKey: 'ASSESSMENT', displayName: 'Assessment', count: 8 },
      { stageKey: 'RESOLUTION', displayName: 'Resolution', count: 3 },
    ],
    evidencePendingReviewClaims: 4,
    openTasks: 7,
    overdueTasks: 2,
    closedClaims: 11,
  },
  requestId: 'req-metrics',
};

const tasksResponse = {
  data: {
    items: [{
      taskId: 'task-1',
      claimId: 'claim-1',
      trackingCode: 'CLM-2026-001',
      policyReference: 'POL-001',
      vehicleReference: 'ABC1234',
      type: 'CLAIM_REVIEW' as const,
      title: 'Revisar declaración inicial',
      description: null,
      status: 'OPEN' as const,
      priority: 'HIGH' as const,
      queue: 'CLAIMS' as const,
      assignedOperatorId: null,
      dueAt: '2026-09-10T12:00:00.000Z',
      version: 1,
      createdByType: 'SYSTEM' as const,
      createdById: null,
      correlationId: null,
      createdAt: '2026-09-09T12:00:00.000Z',
      updatedAt: '2026-09-09T12:00:00.000Z',
      completedAt: null,
      completedById: null,
      cancelledAt: null,
      cancelledById: null,
      cancellationReason: null,
    }],
    page: 1,
    pageSize: 5,
    totalItems: 1,
    totalPages: 1,
  },
  requestId: 'req-tasks',
};

const claimsResponse = {
  data: {
    items: [{
      claimId: 'claim-1',
      trackingCode: 'CLM-2026-001',
      status: 'RECEIVED' as const,
      occurredAt: '2026-09-12T16:00:00.000Z',
      policyReference: 'POL-001',
      vehicleReference: 'ABC1234',
      operationalStage: { stageKey: 'INTAKE', displayName: 'Intake', sortOrder: 1 },
      operationalWorkItemVersion: 2,
      createdAt: '2026-09-12T16:05:00.000Z',
    }],
    page: 1,
    pageSize: 6,
    totalItems: 1,
    totalPages: 1,
  },
  requestId: 'req-claims',
};

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/dashboard']}>
        <OperatorDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectKpiValue(label: string, value: number) {
  const card = screen.getByText(label).closest('article');
  expect(card).not.toBeNull();
  expect(within(card!).getByText(String(value))).toBeTruthy();
}

describe('OperatorDashboardPage', () => {
  beforeEach(() => {
    sessionState.role = 'CLAIMS_SUPERVISOR';
    sessionState.signOut.mockClear();
    mockedMetrics.mockReset();
    mockedListTasks.mockReset();
    mockedListClaims.mockReset();
    mockedMetrics.mockResolvedValue(metricsResponse);
    mockedListTasks.mockResolvedValue(tasksResponse);
    mockedListClaims.mockResolvedValue(claimsResponse);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders API-backed operational data and only the governed analytics windows', async () => {
    renderDashboard();

    expect(await screen.findByText('Claims abiertos')).toBeTruthy();

    expectKpiValue('Claims abiertos', metricsResponse.data.openClaims);
    expectKpiValue('Reportados 30d', metricsResponse.data.reportedInWindow);
    expectKpiValue('Claims cerrados', metricsResponse.data.closedClaims);
    expectKpiValue('Tareas abiertas', metricsResponse.data.openTasks);
    expectKpiValue('Tareas vencidas', metricsResponse.data.overdueTasks);
    expectKpiValue('Evidencia pendiente', metricsResponse.data.evidencePendingReviewClaims);

    await waitFor(() => {
      expect(mockedMetrics).toHaveBeenCalledTimes(1);
      expect(mockedListTasks).toHaveBeenCalledTimes(1);
      expect(mockedListClaims).toHaveBeenCalledTimes(1);
    });
    expect(mockedListTasks).toHaveBeenCalledWith(
      { page: 1, pageSize: 5, status: 'OPEN' },
      'test-token',
    );
    expect(mockedListClaims).toHaveBeenCalledWith(
      { page: 1, pageSize: 6, status: 'RECEIVED', sort: 'createdAt:desc' },
      'test-token',
    );

    expect(screen.getByText(tasksResponse.data.items[0].title)).toBeTruthy();
    expect(screen.getByText('Assessment')).toBeTruthy();
    expect(screen.getByRole('link', { name: claimsResponse.data.items[0].trackingCode })).toBeTruthy();
    expect(screen.getByText(claimsResponse.data.items[0].vehicleReference)).toBeTruthy();

    expect(screen.getByRole('option', { name: 'Últimos 7 días' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Últimos 30 días' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Últimos 90 días' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(3);

    expect(screen.getByRole('heading', { name: 'Distribución por estado' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Etapas operacionales' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Requiere acción' })).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();

    expect(screen.queryByText(/exportar/i)).toBeNull();
    expect(screen.queryByText(/forecast/i)).toBeNull();
    expect(screen.queryByText(/comparar períodos/i)).toBeNull();
  });

  it('changes analytics only among 7, 30 and 90 day windows', async () => {
    renderDashboard();
    await screen.findByText('Claims abiertos');

    const select = screen.getByRole('combobox', { name: 'Ventana' }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '7' } });

    await waitFor(() => expect(mockedMetrics.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(select.value).toBe('7');
  });

  it('does not synthesize analytics for a role without claims.analytics.read', async () => {
    sessionState.role = 'CLAIMS_OPERATOR';
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Métricas canónicas reservadas' })).toBeTruthy();
    expect(mockedMetrics).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Ventana' })).toBeNull();
    expect(screen.getByText(/No sustituimos esa ausencia/i)).toBeTruthy();
  });

  it('keeps available authoritative data visible on a partial failure and exposes retry', async () => {
    const failure = Object.assign(new Error('Tasks unavailable'), { network: true });
    mockedListTasks.mockRejectedValue(failure);
    renderDashboard();

    expect(await screen.findByText('Claims abiertos')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    const retry = screen.getByRole('button', { name: 'Reintentar consultas' });
    fireEvent.click(retry);

    await waitFor(() => expect(mockedListTasks.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(screen.getByRole('table')).toBeTruthy();
  });

  it('renders explicit empty states without inventing records', async () => {
    mockedListTasks.mockResolvedValue({
      data: { ...tasksResponse.data, items: [], totalItems: 0, totalPages: 0 },
      requestId: 'req-empty-tasks',
    });
    mockedListClaims.mockResolvedValue({
      data: { ...claimsResponse.data, items: [], totalItems: 0, totalPages: 0 },
      requestId: 'req-empty-claims',
    });
    renderDashboard();

    expect(await screen.findByText('No hay tareas abiertas.')).toBeTruthy();
    expect(screen.getByText('No hay siniestros en RECEIVED.')).toBeTruthy();
    expect(screen.queryByText(tasksResponse.data.items[0].title)).toBeNull();
    expect(screen.queryByRole('link', { name: claimsResponse.data.items[0].trackingCode })).toBeNull();
  });
});
