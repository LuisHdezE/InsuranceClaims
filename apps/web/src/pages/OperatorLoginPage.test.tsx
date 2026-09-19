import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateOperator, createReadOnlyDemoOperatorSession } from '../api/claims';
import { OperatorLoginPage } from './OperatorLoginPage';

const sessionHarness = vi.hoisted(() => ({
  current: null as null | {
    accessToken: string;
    expiresAt: number;
    operator: { id: string; login: string; role: 'CLAIMS_OPERATOR' | 'CLAIMS_SUPERVISOR' | 'PLATFORM_ADMIN' };
  },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: sessionHarness.current,
    signIn: sessionHarness.signIn,
    signOut: sessionHarness.signOut,
  }),
}));

vi.mock('../api/claims', () => ({
  authenticateOperator: vi.fn(),
  createReadOnlyDemoOperatorSession: vi.fn(),
}));

const mockedAuthenticateOperator = vi.mocked(authenticateOperator);
const mockedCreateReadOnlyDemoOperatorSession = vi.mocked(createReadOnlyDemoOperatorSession);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/operator/login']}>
      <Routes>
        <Route path="/operator/login" element={<OperatorLoginPage />} />
        <Route path="/operator/dashboard" element={<div>Dashboard destino</div>} />
        <Route path="/operator/workspace" element={<div>Workspace destino</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OperatorLoginPage demo personas', () => {
  beforeEach(() => {
    sessionHarness.current = null;
    sessionHarness.signIn.mockReset();
    sessionHarness.signOut.mockReset();
    mockedAuthenticateOperator.mockReset();
    mockedCreateReadOnlyDemoOperatorSession.mockReset();
  });

  afterEach(() => cleanup());

  it('renders the three governed public demo personas without changing product credential semantics', () => {
    renderPage();

    const operations = screen.getByRole('button', { name: 'Entrar en demo de solo lectura' });
    expect(operations.textContent).toContain('Operations');
    expect(screen.getByRole('button', { name: 'Explorar como Supervision' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Explorar como Administration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ingresar al workspace' })).toBeTruthy();
    expect(screen.getByText(/cada persona recibe su propio JWT/i)).toBeTruthy();
  });

  it('opens Operations with the real CLAIMS_OPERATOR landing', async () => {
    mockedCreateReadOnlyDemoOperatorSession.mockResolvedValue({
      data: {
        accessToken: 'demo-token', tokenType: 'Bearer', expiresIn: 900,
        operator: {
          id: '00000000-0000-4000-8000-000000000096',
          login: 'demo.operator@eliasworks.invalid',
          role: 'CLAIMS_OPERATOR',
        },
      },
      requestId: 'req-demo-operations',
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar en demo de solo lectura' }));

    await waitFor(() => expect(mockedCreateReadOnlyDemoOperatorSession).toHaveBeenCalledWith('operations'));
    expect(mockedAuthenticateOperator).not.toHaveBeenCalled();
    expect(await screen.findByText('Dashboard destino')).toBeTruthy();
  });

  it('opens Administration with PLATFORM_ADMIN and lands on Workspace instead of Claims', async () => {
    mockedCreateReadOnlyDemoOperatorSession.mockResolvedValue({
      data: {
        accessToken: 'admin-demo-token', tokenType: 'Bearer', expiresIn: 900,
        operator: {
          id: '00000000-0000-4000-8000-000000000094',
          login: 'demo.admin@eliasworks.invalid',
          role: 'PLATFORM_ADMIN',
        },
      },
      requestId: 'req-demo-administration',
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Explorar como Administration' }));

    await waitFor(() => expect(mockedCreateReadOnlyDemoOperatorSession).toHaveBeenCalledWith('administration'));
    expect(sessionHarness.signIn).toHaveBeenCalledWith(expect.objectContaining({
      operator: expect.objectContaining({ role: 'PLATFORM_ADMIN' }),
    }));
    expect(await screen.findByText('Workspace destino')).toBeTruthy();
  });
});
