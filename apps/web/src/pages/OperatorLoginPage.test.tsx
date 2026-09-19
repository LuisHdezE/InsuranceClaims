import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateOperator } from '../api/claims';
import { createReadOnlyDemoOperatorSession } from '../api/demo-session';
import { PUBLIC_DEMO_PERSONAS } from '../demo-access';
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
}));

vi.mock('../api/demo-session', () => ({
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

  it('renders contract credentials plus three explicit governed read-only demo personas', () => {
    renderPage();

    const login = screen.getByLabelText('Usuario') as HTMLInputElement;
    const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
    const wordmarks = screen.getAllByRole('img', { name: 'FAR Seguros' }) as HTMLImageElement[];

    expect(wordmarks).toHaveLength(2);
    expect(wordmarks.every((wordmark) => wordmark.getAttribute('src') === '/far-demo-wordmark-v2.svg')).toBe(true);
    expect(login.required).toBe(true);
    expect(login.maxLength).toBe(160);
    expect(login.autocomplete).toBe('username');
    expect(password.required).toBe(true);
    expect(password.maxLength).toBe(256);
    expect(password.autocomplete).toBe('current-password');
    expect(password.type).toBe('password');
    expect(screen.getByRole('button', { name: 'Ingresar al workspace' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar a la demo de Operación' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar a la demo de Supervisión' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar a la demo de Administración' })).toBeTruthy();
    expect(screen.getByText(/Sidebar muestra únicamente módulos autorizados y productizados/i)).toBeTruthy();
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

  it('opens the operations demo without collecting credentials and lands on its role-safe dashboard', async () => {
    mockedCreateReadOnlyDemoOperatorSession.mockResolvedValue({
      data: {
        accessToken: 'demo-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        operator: {
          id: PUBLIC_DEMO_PERSONAS.operations.id,
          login: PUBLIC_DEMO_PERSONAS.operations.login,
          role: PUBLIC_DEMO_PERSONAS.operations.role,
        },
      },
      requestId: 'req-demo-1',
    });

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a la demo de Operación' }));

    await waitFor(() => expect(mockedCreateReadOnlyDemoOperatorSession).toHaveBeenCalledWith('operations'));
    expect(mockedAuthenticateOperator).not.toHaveBeenCalled();
    expect(sessionHarness.signIn).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: 'demo-token',
      operator: expect.objectContaining({ role: 'CLAIMS_OPERATOR' }),
    }));
    expect(await screen.findByText('Dashboard destino')).toBeTruthy();
  });

  it('opens supervision and administration with their real server roles and distinct safe landings', async () => {
    mockedCreateReadOnlyDemoOperatorSession.mockImplementation(async (persona) => {
      const definition = PUBLIC_DEMO_PERSONAS[persona];
      return {
        data: {
          accessToken: `${persona}-token`,
          tokenType: 'Bearer' as const,
          expiresIn: 900,
          operator: { id: definition.id, login: definition.login, role: definition.role },
        },
        requestId: `req-${persona}`,
      };
    });

    const supervision = renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a la demo de Supervisión' }));
    expect(await screen.findByText('Dashboard destino')).toBeTruthy();
    expect(mockedCreateReadOnlyDemoOperatorSession).toHaveBeenCalledWith('supervision');
    supervision.unmount();
    cleanup();

    sessionHarness.signIn.mockClear();
    mockedCreateReadOnlyDemoOperatorSession.mockClear();

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Entrar a la demo de Administración' }));
    expect(await screen.findByText('Workspace destino')).toBeTruthy();
    expect(mockedCreateReadOnlyDemoOperatorSession).toHaveBeenCalledWith('administration');
    expect(sessionHarness.signIn).toHaveBeenCalledWith(expect.objectContaining({
      operator: expect.objectContaining({ role: 'PLATFORM_ADMIN' }),
    }));
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
