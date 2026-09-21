import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '../api/types';
import { PUBLIC_DEMO_PERSONAS } from '../demo-access';
import { StaffWorkspacePage } from './StaffWorkspacePage';

const sessionState = vi.hoisted(() => ({
  id: 'operator-1',
  role: 'PLATFORM_ADMIN' as StaffRole,
}));

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: {
        id: sessionState.id,
        login: 'staff@example.test',
        role: sessionState.role,
      },
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../components/OperatorShell', () => ({
  OperatorShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/operator/workspace']}>
      <StaffWorkspacePage />
    </MemoryRouter>,
  );
}

describe('StaffWorkspacePage', () => {
  beforeEach(() => {
    sessionState.id = 'operator-1';
    sessionState.role = 'PLATFORM_ADMIN';
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Platform Admin with only authorized and productized launch cards', () => {
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Tu espacio de trabajo' })).toBeTruthy();
    expect(screen.getAllByText('Administrador de plataforma').length).toBeGreaterThan(0);
    expect(screen.getByText('8 módulos disponibles')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Supervisión' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Configuración de plataforma' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Operación técnica' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Operación' })).toBeNull();

    const expectedLinks = [
      'Métricas operacionales',
      'Administración de pipelines',
      'Plantillas de comunicación',
      'Campos personalizados',
      'Orientación',
      'Automatizaciones',
      'Importaciones gobernadas',
      'Integraciones y recuperación',
    ];

    for (const name of expectedLinks) {
      expect(screen.getByRole('link', { name: new RegExp(name, 'i') })).toBeTruthy();
    }
    expect(screen.getAllByRole('link')).toHaveLength(expectedLinks.length);

    expect(screen.queryByText('Custom Fields')).toBeNull();
    expect(screen.queryByText('Guidance')).toBeNull();
    expect(screen.queryByText('Imports gobernados')).toBeNull();
    expect(screen.queryByText('Siniestros y trabajo operativo')).toBeNull();
    expect(screen.queryByText('Clientes y pólizas')).toBeNull();
    expect(screen.queryByText('Renovaciones')).toBeNull();
    expect(screen.queryByText('Cobranzas')).toBeNull();
    expect(screen.queryByText(/UI planificada/i)).toBeNull();
    expect(screen.queryByText(/permisos de presentación/i)).toBeNull();
    expect(screen.getByText(/Sin superusuario implícito/i)).toBeTruthy();
  });

  it('keeps Recovery out of the public Administration demo workspace', () => {
    sessionState.id = PUBLIC_DEMO_PERSONAS.administration.id;
    renderWorkspace();

    expect(screen.getByText('7 módulos disponibles')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Importaciones gobernadas/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Integraciones y recuperación/i })).toBeNull();
  });

  it('gives Claims Supervisor concise operations plus Analítica but no platform administration', () => {
    sessionState.role = 'CLAIMS_SUPERVISOR';
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Supervisión' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Configuración de plataforma' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Operación técnica' })).toBeNull();

    expect(screen.getByRole('link', { name: /Siniestros y trabajo operativo/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Clientes y pólizas/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Renovaciones/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Cobranzas/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Métricas operacionales/i })).toBeTruthy();
    expect(screen.queryByText('Administración de pipelines')).toBeNull();
    expect(screen.queryByText('Automatizaciones')).toBeNull();
    expect(screen.queryByText('Importaciones gobernadas')).toBeNull();
  });

  it('keeps Claims Operator operational and does not synthesize Analítica access', () => {
    sessionState.role = 'CLAIMS_OPERATOR';
    renderWorkspace();

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Supervisión' })).toBeNull();
    expect(screen.queryByText('Métricas operacionales')).toBeNull();
    expect(screen.queryByText('Administración de pipelines')).toBeNull();
    expect(screen.getByText(/sin Analítica ni administración de plataforma/i)).toBeTruthy();
  });
});
