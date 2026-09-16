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

function renderPage(initialEntry: string = '/operator/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/operator/login" element={<OperatorLoginPage />} />
        <Route path="/operator/dashboard" element={<div>Dashboard destino</div>} />
        <Route path="/operator/workspace" element={<div>Workspace destino</div>} />
        <Route path="/operator/analytics" element={<div>Analytics destino</div>} />
        <Route path="/operator/claims" element={<div>Siniestros destino</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OperatorLoginPage R3 contract', () => {
  beforeEach(() => {
    sessionHarness.current = null;
    sessionHarness.signIn.mockReset();
    sessionHarness.signOut.mockReset();
    mockedAuthenticateOperator.mockReset();
    mockedCreateReadOnlyDemoOperatorSession.mockReset();
  });

  afterEach(() => cleanup());

  it('renders contract credentials plus the explicit governed read-only demo entry', () => {
    renderPage();

    const login = screen.getByLabelText('Usuario') as HTMLInputElement;
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;

    expect(login.required).toBe(true);
    expect(login.maxLength).toBe(160);
    expect(login.autocomplete).toBe('username');
    expect(password.required).toBe(true);
    expect(password.maxLength).toBe(256);
    expect(password.autocomplete).toBe('current-password');
    expect(password.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Ingresar al workspace' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar en demo de solo lectura' })).toBeTruthy();
    expect(screen.getByText(/bloquea escrituras y cualquier lectura fuera de ese alcance/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /volver al sitio público/i })).toBeTruthy();

    expect(screen.getByText(/No se selecciona aquí/i)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/recuérdame/i)).toBeNull();
    expect(screen.queryByText(/olvidé mi contraseña/i)).toBeNull();
    expect(screen.queryByText(/recuperar cuenta/i)).toBeNull();
    expect(screen.queryByText(/registrarse|crear cuenta/i)).toBeNull();
    expect(screen.queryByText(/mfa|otp/i)).toBeNull();
    expect(screen.queryByText(/google|microsoft|apple/i)).toBeNull();
  });

  it('opens the public read-only demo without collecting credentials and lands inside the governed claims scope', async () => {
    mockedCreateReadOnlyDemoOperatorSession.mockResolvedValue({
      data: {
        accessToken: 'demo-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        operator: {
          id: '00000000-0000-4000-8000-000000000099',
          login: 'demo.operator@eliasworks.invalid',
          role: 'CLAIMS_OPERATOR',
        },
      },
      requestId: 'req-demo-1',
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar en demo de solo lectura' }));

    await waitFor(() => expect(mockedCreateReadOnlyDemoOperatorSession).toHaveBeenCalledTimes(1));
    expect(mockedAuthenticateOperator).not.toHaveBeenCalled();
    expect(sessionHarness.signIn).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'demo-token',
      operator: expect.objectContaining({ role: 'CLAIMS_OPERATOR' }),
    }));
    expect(await screen.findByText('Siniestros destino')).toBeTruthy();
  });

  it('submits only login and password, trims login and follows the API role', async () => {
    mockedAuthenticateOperator.mockResolvedValue({
      data: {
        accessToken: 'platform-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        operator: { id: 'platform-1', login: 'admin@example.test', role: 'PLATFORM_ADMIN' },
      },
      requestId: 'req-login-1',
    });

    renderPage();
    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: '  admin@example.test  ' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret-value' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar al workspace' }));

    await waitFor(() => expect(mockedAuthenticateOperator).toHaveBeenCalledWith({
      login: 'admin@example.test',
      password: 'secret-value',
    }));
    expect(sessionHarness.signIn).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'platform-token',
      operator: expect.objectContaining({ role: 'PLATFORM_ADMIN' }),
    }));
    expect(await screen.findByText('Workspace destino')).toBeTruthy();
  });

  it('keeps an authorized requested route and never lets the client override the server role', async () => {
    mockedAuthenticateOperator.mockResolvedValue({
      data: {
        accessToken: 'supervisor-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        operator: { id: 'supervisor-1', login: 'supervisor@example.test', role: 'CLAIMS_SUPERVISOR' },
      },
      requestId: 'req-login-2',
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/operator/login', state: { from: '/operator/analytics' } }]}>
        <Routes>
          <Route path="/operator/login" element={<OperatorLoginPage />} />
          <Route path="/operator/analytics" element={<div>Analytics destino</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Usuario'), { target: { value: 'supervisor@example.test' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret-value' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Ingresar al workspace' }).closest('form')!);

    expect(await screen.findByText('Analytics destino')).toBeTruthy();
    expect(mockedAuthenticateOperator).toHaveBeenCalledTimes(1);
    expect(sessionHarness.signIn).toHaveBeenCalledWith(expect.objectContaining({
      operator: expect.objectContaining({ role: 'CLAIMS_SUPERVISOR' }),
    }));
  });
});
