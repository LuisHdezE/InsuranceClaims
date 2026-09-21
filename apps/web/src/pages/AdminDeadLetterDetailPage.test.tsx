import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeadLetter, requeueDeadLetter, resolveDeadLetter } from '../api/recovery-admin';
import type { ApiFailure } from '../api/types';
import type { DeadLetterProjection } from '../api/recovery-admin-types';
import { AdminDeadLetterDetailPage } from './AdminDeadLetterDetailPage';

const DEAD_LETTER_ID = '77777777-7777-4777-8777-777777777777';

const sessionHarness = vi.hoisted(() => ({
  signOut: vi.fn(),
}));

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'staff-token',
      expiresAt: Date.now() + 60_000,
      operator: {
        id: 'admin-1',
        login: 'admin@example.test',
        role: 'PLATFORM_ADMIN' as const,
      },
    },
    signIn: vi.fn(),
    signOut: sessionHarness.signOut,
  }),
}));

vi.mock('../components/OperatorShell', () => ({
  OperatorShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../api/recovery-admin', () => ({
  getDeadLetter: vi.fn(),
  requeueDeadLetter: vi.fn(),
  resolveDeadLetter: vi.fn(),
}));

const mockedGetDeadLetter = vi.mocked(getDeadLetter);
const mockedRequeueDeadLetter = vi.mocked(requeueDeadLetter);
const mockedResolveDeadLetter = vi.mocked(resolveDeadLetter);

const baseItem: DeadLetterProjection = {
  deadLetterId: DEAD_LETTER_ID,
  jobType: 'SYNTHETIC_EXPORT_JOB',
  status: 'DEAD_LETTER',
  attemptCount: 3,
  maxAttempts: 5,
  availableAt: '2026-09-21T12:00:00.000Z',
  correlationId: 'recovery-test-correlation',
  failureCategory: 'DOWNSTREAM_TIMEOUT',
  completedAt: null,
  version: 3,
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/operator/admin/recovery/dead-letters/${DEAD_LETTER_ID}`]}>
        <Routes>
          <Route path="/operator/admin/recovery/dead-letters/:deadLetterId" element={<AdminDeadLetterDetailPage />} />
          <Route path="/operator/admin/recovery" element={<div>Recovery list destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function problemFailure(status: number, code: string): ApiFailure {
  const error = new Error(code) as ApiFailure;
  error.problem = {
    type: `https://example.test/problems/${code.toLowerCase()}`,
    title: code,
    status,
    detail: code,
    code,
  };
  return error;
}

describe('AdminDeadLetterDetailPage recovery productization', () => {
  beforeEach(() => {
    sessionHarness.signOut.mockReset();
    mockedGetDeadLetter.mockReset();
    mockedRequeueDeadLetter.mockReset();
    mockedResolveDeadLetter.mockReset();
    mockedGetDeadLetter.mockResolvedValue({ data: baseItem, requestId: 'req-detail' });
  });

  afterEach(() => cleanup());

  it('requires explicit confirmation before requeue and supports cancellation without mutation', async () => {
    mockedRequeueDeadLetter.mockResolvedValue({
      data: { ...baseItem, status: 'PENDING', version: 4 },
      requestId: 'req-requeue',
    });

    renderPage();
    await screen.findByRole('heading', { name: 'SYNTHETIC_EXPORT_JOB' });

    const trigger = screen.getByRole('button', { name: 'Reencolar para nuevo intento' });
    fireEvent.click(trigger);

    expect(mockedRequeueDeadLetter).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Confirmar reencolado' });
    expect(dialog.textContent).toContain('expectedVersion 3');
    expect(dialog.textContent).toContain('no repetirá la mutación automáticamente');

    const confirm = screen.getByRole('button', { name: 'Sí, reencolar' });
    await waitFor(() => expect(document.activeElement).toBe(confirm));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockedRequeueDeadLetter).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(trigger));

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reencolar' }));

    await waitFor(() => expect(mockedRequeueDeadLetter).toHaveBeenCalledWith(
      DEAD_LETTER_ID,
      { expectedVersion: 3 },
      'staff-token',
    ));
    expect(await screen.findByText('Recovery list destination')).toBeTruthy();
  });

  it('requires a distinct confirmation before administrative resolution', async () => {
    mockedResolveDeadLetter.mockResolvedValue({
      data: { ...baseItem, status: 'CANCELLED', completedAt: '2026-09-21T12:30:00.000Z', version: 4 },
      requestId: 'req-resolve',
    });

    renderPage();
    await screen.findByRole('heading', { name: 'SYNTHETIC_EXPORT_JOB' });

    fireEvent.click(screen.getByRole('button', { name: 'Resolver administrativamente' }));

    expect(mockedResolveDeadLetter).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog', { name: 'Confirmar resolución administrativa' });
    expect(dialog.textContent).toContain('no será reencolado');

    fireEvent.click(screen.getByRole('button', { name: 'Sí, resolver' }));
    await waitFor(() => expect(mockedResolveDeadLetter).toHaveBeenCalledWith(
      DEAD_LETTER_ID,
      { expectedVersion: 3 },
      'staff-token',
    ));
  });

  it('refetches once on 409, closes confirmation and never retries the stale mutation automatically', async () => {
    const refreshedItem = { ...baseItem, version: 4 };
    mockedGetDeadLetter
      .mockReset()
      .mockResolvedValueOnce({ data: baseItem, requestId: 'req-detail-v3' })
      .mockResolvedValueOnce({ data: refreshedItem, requestId: 'req-detail-v4' });
    mockedResolveDeadLetter.mockRejectedValue(problemFailure(409, 'CONCURRENCY_CONFLICT'));

    renderPage();
    await screen.findByRole('heading', { name: 'SYNTHETIC_EXPORT_JOB' });

    fireEvent.click(screen.getByRole('button', { name: 'Resolver administrativamente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sí, resolver' }));

    await waitFor(() => expect(mockedResolveDeadLetter).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockedGetDeadLetter).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getAllByText('v4').length).toBeGreaterThan(0));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockedResolveDeadLetter).toHaveBeenCalledTimes(1);
  });

  it('allows Escape to dismiss a confirmation without sending a mutation', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'SYNTHETIC_EXPORT_JOB' });

    fireEvent.click(screen.getByRole('button', { name: 'Reencolar para nuevo intento' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirmar reencolado' });
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockedRequeueDeadLetter).not.toHaveBeenCalled();
    expect(mockedResolveDeadLetter).not.toHaveBeenCalled();
  });
});
