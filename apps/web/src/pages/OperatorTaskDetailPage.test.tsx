import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelClaimTask, completeClaimTask, getClaimTask, updateClaimTask } from '../api/tasks';
import type { ClaimTaskProjection } from '../api/task-types';
import { OperatorTaskDetailPage } from './OperatorTaskDetailPage';

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
  getClaimTask: vi.fn(),
  updateClaimTask: vi.fn(),
  completeClaimTask: vi.fn(),
  cancelClaimTask: vi.fn(),
}));

const mockedGetClaimTask = vi.mocked(getClaimTask);
const mockedUpdateClaimTask = vi.mocked(updateClaimTask);
const mockedCompleteClaimTask = vi.mocked(completeClaimTask);
const mockedCancelClaimTask = vi.mocked(cancelClaimTask);

const task: ClaimTaskProjection = {
  taskId: 'task-api-9',
  claimId: 'claim-api-9',
  trackingCode: 'CLM-API-909',
  policyReference: 'POL-API-909',
  vehicleReference: 'UY-TASK-909',
  type: 'EVIDENCE_REVIEW',
  title: 'Revisar evidencia API',
  description: 'Comprobar la evidencia publicada por el contrato de Tasks.',
  status: 'OPEN',
  priority: 'NORMAL',
  queue: 'CLAIMS',
  assignedOperatorId: null,
  dueAt: null,
  version: 9,
  createdByType: 'SYSTEM',
  createdById: 'system-technical-id',
  correlationId: 'correlation-technical-id',
  createdAt: '2026-09-13T10:00:00.000Z',
  updatedAt: '2026-09-13T10:15:00.000Z',
  completedAt: null,
  completedById: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/tasks/task-api-9']}>
        <Routes>
          <Route path="/operator/tasks/:taskId" element={<OperatorTaskDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorTaskDetailPage R3 detail', () => {
  beforeEach(() => {
    mockedGetClaimTask.mockReset();
    mockedUpdateClaimTask.mockReset();
    mockedCompleteClaimTask.mockReset();
    mockedCancelClaimTask.mockReset();

    mockedGetClaimTask.mockResolvedValue({ data: task, requestId: 'req-detail' });
    mockedUpdateClaimTask.mockImplementation(async (_taskId, payload) => ({
      data: {
        ...task,
        priority: payload.priority ?? task.priority,
        assignedOperatorId: payload.assignedOperatorId === undefined ? task.assignedOperatorId : payload.assignedOperatorId,
        version: 10,
      },
      requestId: 'req-update',
    }));
    mockedCompleteClaimTask.mockResolvedValue({ data: { ...task, status: 'COMPLETED', completedAt: '2026-09-13T12:00:00.000Z', version: 10 }, requestId: 'req-complete' });
    mockedCancelClaimTask.mockResolvedValue({ data: { ...task, status: 'CANCELLED', cancelledAt: '2026-09-13T12:00:00.000Z', cancellationReason: 'DUPLICATE', version: 10 }, requestId: 'req-cancel' });
  });

  afterEach(() => cleanup());

  it('renders API-backed Task context without exposing technical IDs or version controls', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Revisar evidencia API' })).toBeTruthy();
    expect(screen.getByText('CLM-API-909')).toBeTruthy();
    expect(screen.getByText('POL-API-909')).toBeTruthy();
    expect(screen.getByText('UY-TASK-909')).toBeTruthy();
    expect(screen.getByText('Sistema')).toBeTruthy();

    expect(screen.queryByLabelText(/Operator ID/i)).toBeNull();
    expect(screen.queryByText('system-technical-id')).toBeNull();
    expect(screen.queryByText('correlation-technical-id')).toBeNull();
    expect(screen.queryByText(/expectedVersion/i)).toBeNull();
    expect(screen.queryByText(/^v9$/i)).toBeNull();
  });

  it('uses Asignarme instead of manual UUID assignment and keeps expectedVersion inside the API payload', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Revisar evidencia API' });

    fireEvent.click(screen.getByRole('button', { name: 'Asignarme' }));

    await waitFor(() => expect(mockedUpdateClaimTask).toHaveBeenCalledWith(
      'task-api-9',
      { expectedVersion: 9, assignedOperatorId: 'operator-1' },
      'test-token',
    ));
    expect(screen.queryByText('operator-1')).toBeNull();
  });

  it('updates priority through the existing PATCH contract with optimistic concurrency preserved', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Revisar evidencia API' });

    fireEvent.change(screen.getByLabelText('Prioridad'), { target: { value: 'HIGH' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(mockedUpdateClaimTask).toHaveBeenCalledWith(
      'task-api-9',
      { expectedVersion: 9, priority: 'HIGH', dueAt: null },
      'test-token',
    ));
  });

  it('keeps complete and cancel as separate explicit terminal actions', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Revisar evidencia API' });

    fireEvent.click(screen.getByRole('button', { name: 'Completar tarea' }));
    await waitFor(() => expect(mockedCompleteClaimTask).toHaveBeenCalledWith('task-api-9', 'OPEN', 'test-token'));

    cleanup();
    renderPage();
    await screen.findByRole('heading', { level: 1, name: 'Revisar evidencia API' });
    fireEvent.change(screen.getByLabelText('Razón de cancelación'), { target: { value: 'DUPLICATE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar tarea' }));

    await waitFor(() => expect(mockedCancelClaimTask).toHaveBeenCalledWith(
      'task-api-9',
      { expectedVersion: 9, reason: 'DUPLICATE' },
      'test-token',
    ));
  });
});
