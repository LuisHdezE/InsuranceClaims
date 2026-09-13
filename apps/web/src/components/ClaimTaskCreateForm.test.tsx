import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClaimTask } from '../api/tasks';
import type { ClaimTaskProjection } from '../api/task-types';
import { ClaimTaskCreateForm } from './ClaimTaskCreateForm';

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

vi.mock('../api/tasks', () => ({ createClaimTask: vi.fn() }));

const mockedCreateClaimTask = vi.mocked(createClaimTask);

const createdTask: ClaimTaskProjection = {
  taskId: 'task-created',
  claimId: 'claim-1',
  trackingCode: 'CLM-API-CREATE',
  policyReference: 'POL-API-CREATE',
  vehicleReference: 'UY-CREATE',
  type: 'CLAIM_REVIEW',
  title: 'Validar cobertura',
  description: null,
  status: 'OPEN',
  priority: 'NORMAL',
  queue: 'CLAIMS',
  assignedOperatorId: 'operator-1',
  dueAt: null,
  version: 1,
  createdByType: 'OPERATOR',
  createdById: 'operator-1',
  correlationId: null,
  createdAt: '2026-09-13T12:00:00.000Z',
  updatedAt: '2026-09-13T12:00:00.000Z',
  completedAt: null,
  completedById: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
};

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ClaimTaskCreateForm claimId="claim-1" />
    </QueryClientProvider>,
  );
}

describe('ClaimTaskCreateForm R3 assignment UX', () => {
  beforeEach(() => {
    mockedCreateClaimTask.mockReset();
    mockedCreateClaimTask.mockResolvedValue({ data: createdTask, requestId: 'req-create', idempotencyReplayed: false });
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('offers self-assignment without exposing a manual operator UUID field', async () => {
    renderForm();

    expect(screen.queryByLabelText(/operator id/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/uuid/i)).toBeNull();

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Validar cobertura' } });
    fireEvent.click(screen.getByRole('button', { name: 'Asignarme' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));

    await waitFor(() => expect(mockedCreateClaimTask).toHaveBeenCalledWith(
      'claim-1',
      expect.objectContaining({
        title: 'Validar cobertura',
        assignedOperatorId: 'operator-1',
        queue: 'CLAIMS',
      }),
      '00000000-0000-4000-8000-000000000001',
      'test-token',
    ));
  });
});
