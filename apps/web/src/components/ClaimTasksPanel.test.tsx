import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listClaimTasks } from '../api/tasks';
import type { ClaimTaskProjection } from '../api/task-types';
import { ClaimTasksPanel } from './ClaimTasksPanel';

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

vi.mock('../api/tasks', () => ({
  listClaimTasks: vi.fn(),
  completeClaimTask: vi.fn(),
  createClaimTask: vi.fn(),
}));

const mockedListClaimTasks = vi.mocked(listClaimTasks);

const task: ClaimTaskProjection = {
  taskId: 'task-panel',
  claimId: 'claim-panel',
  trackingCode: 'CLM-PANEL',
  policyReference: 'POL-PANEL',
  vehicleReference: 'UY-PANEL',
  type: 'CUSTOMER_FOLLOWUP',
  title: 'Contactar cliente',
  description: 'Confirmar datos.',
  status: 'OPEN',
  priority: 'HIGH',
  queue: 'CLAIMS',
  assignedOperatorId: 'operator-other-technical-id',
  dueAt: null,
  version: 42,
  createdByType: 'OPERATOR',
  createdById: 'creator-technical-id',
  correlationId: null,
  createdAt: '2026-09-13T12:00:00.000Z',
  updatedAt: '2026-09-13T12:00:00.000Z',
  completedAt: null,
  completedById: null,
  cancelledAt: null,
  cancelledById: null,
  cancellationReason: null,
};

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ClaimTasksPanel claimId="claim-panel" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ClaimTasksPanel R3 presentation', () => {
  beforeEach(() => {
    mockedListClaimTasks.mockReset();
    mockedListClaimTasks.mockResolvedValue({ data: [task], requestId: 'req-panel' });
  });

  afterEach(() => cleanup());

  it('uses semantic assignment labels and hides technical version and operator IDs', async () => {
    renderPanel();

    expect(await screen.findByText('Contactar cliente')).toBeTruthy();
    expect(screen.getByText(/Asignada a otro operador/i)).toBeTruthy();
    expect(screen.queryByText('operator-other-technical-id')).toBeNull();
    expect(screen.queryByText('creator-technical-id')).toBeNull();
    expect(screen.queryByText(/v42/i)).toBeNull();
  });
});
