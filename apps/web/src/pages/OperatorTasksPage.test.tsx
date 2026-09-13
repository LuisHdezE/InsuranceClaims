import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeClaimTask, listTasks, updateClaimTask } from '../api/tasks';
import type { ClaimTaskProjection, ListTasksInput } from '../api/task-types';
import { OperatorTasksPage } from './OperatorTasksPage';

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

vi.mock('../api/tasks', () => ({
  listTasks: vi.fn(),
  completeClaimTask: vi.fn(),
  updateClaimTask: vi.fn(),
}));

const mockedListTasks = vi.mocked(listTasks);
const mockedCompleteClaimTask = vi.mocked(completeClaimTask);
const mockedUpdateClaimTask = vi.mocked(updateClaimTask);

const assignedTask: ClaimTaskProjection = {
  taskId: 'task-assigned',
  claimId: 'claim-1',
  trackingCode: 'CLM-API-301',
  policyReference: 'POL-API-301',
  vehicleReference: 'UY-TASK-301',
  type: 'CLAIM_REVIEW',
  title: 'Revisar cobertura API',
  description: 'Validar la cobertura recibida desde la proyección de tareas.',
  status: 'OPEN',
  priority: 'HIGH',
  queue: 'CLAIMS',
  assignedOperatorId: 'operator-1',
  dueAt: '2099-09-13T15:00:00.000Z',
  version: 6,
  createdByType: 'SYSTEM',
  createdById: null,
  correlationId: null,
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:30:00.000Z',
  completedAt: null,
  completedById: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
};

const unassignedTask: ClaimTaskProjection = {
  ...assignedTask,
  taskId: 'task-unassigned',
  trackingCode: 'CLM-API-302',
  policyReference: 'POL-API-302',
  vehicleReference: 'UY-TASK-302',
  title: 'Solicitar documentación API',
  type: 'MISSING_DOCUMENT_FOLLOWUP',
  priority: 'NORMAL',
  assignedOperatorId: null,
  version: 7,
};

function paged(items: ClaimTaskProjection[], totalItems = items.length) {
  return {
    data: { items, page: 1, pageSize: 100, totalItems, totalPages: totalItems ? 1 : 0 },
    requestId: 'req-tasks',
  };
}

function count(totalItems: number) {
  return {
    data: { items: [], page: 1, pageSize: 1, totalItems, totalPages: totalItems ? totalItems : 0 },
    requestId: 'req-count',
  };
}

function totalFor(input: ListTasksInput) {
  if (input.assignedOperatorId === 'operator-1' && input.status === 'OPEN') return 18;
  if (input.overdue === true && input.status === 'OPEN') return 6;
  if (input.status === 'COMPLETED') return 10;
  if (!input.status && !input.assignedOperatorId && !input.overdue) return 28;
  return 12;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/tasks']}>
        <OperatorTasksPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorTasksPage R3 workspace', () => {
  beforeEach(() => {
    mockedListTasks.mockReset();
    mockedCompleteClaimTask.mockReset();
    mockedUpdateClaimTask.mockReset();

    mockedListTasks.mockImplementation(async (input) => {
      if (input.pageSize === 1) return count(totalFor(input));
      if (input.assignedOperatorId === 'operator-1') return paged([assignedTask], 18);
      return paged([unassignedTask], 12);
    });
    mockedCompleteClaimTask.mockResolvedValue({ data: { ...assignedTask, status: 'COMPLETED', completedAt: '2026-09-13T12:00:00.000Z' }, requestId: 'req-complete' });
    mockedUpdateClaimTask.mockResolvedValue({ data: { ...unassignedTask, assignedOperatorId: 'operator-1', version: 8 }, requestId: 'req-assign' });
  });

  afterEach(() => cleanup());

  it('renders authoritative queue counters and Task context from API responses', async () => {
    renderPage();

    expect(await screen.findByText('Revisar cobertura API')).toBeTruthy();
    expect(screen.getByText('CLM-API-301')).toBeTruthy();
    expect(screen.getByText('POL-API-301')).toBeTruthy();
    expect(screen.getByText('UY-TASK-301')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Mis tareas 18/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Todas 28/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Vencidas 6/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Completadas 10/i })).toBeTruthy();
    });

    expect(mockedListTasks).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 1, status: 'OPEN', assignedOperatorId: 'operator-1' }),
      'test-token',
    );
    expect(screen.queryByText(/v6/i)).toBeNull();
    expect(screen.queryByText('operator-1')).toBeNull();
  });

  it('keeps textual search local to the loaded API results', async () => {
    renderPage();
    await screen.findByText('Revisar cobertura API');

    fireEvent.change(screen.getByLabelText('Buscar en resultados cargados'), { target: { value: 'NO-EXISTE' } });

    expect(await screen.findByText('No hay tareas que coincidan con la cola y los filtros actuales.')).toBeTruthy();
    expect(mockedListTasks.mock.calls.some(([input]) => Object.prototype.hasOwnProperty.call(input, 'search'))).toBe(false);
  });

  it('assigns an unassigned Task to the current operator using the server version only in the mutation payload', async () => {
    renderPage();
    await screen.findByText('Revisar cobertura API');

    fireEvent.click(screen.getByRole('button', { name: /Todas 28/i }));
    expect(await screen.findByText('Solicitar documentación API')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Asignarme' }));

    await waitFor(() => expect(mockedUpdateClaimTask).toHaveBeenCalledWith(
      'task-unassigned',
      { expectedVersion: 7, assignedOperatorId: 'operator-1' },
      'test-token',
    ));
    expect(screen.queryByText('operator-1')).toBeNull();
    expect(screen.queryByText(/v7/i)).toBeNull();
  });

  it('completes an OPEN Task without mutating Claim lifecycle client-side', async () => {
    renderPage();
    await screen.findByText('Revisar cobertura API');

    fireEvent.click(screen.getByRole('button', { name: 'Completar tarea' }));

    await waitFor(() => expect(mockedCompleteClaimTask).toHaveBeenCalledWith('task-assigned', 'OPEN', 'test-token'));
    expect(screen.getByText(/no modifica automáticamente el estado del siniestro/i)).toBeTruthy();
  });
});
