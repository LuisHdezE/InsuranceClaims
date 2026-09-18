import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '../api/types';
import { PUBLIC_DEMO_OPERATOR_ID } from '../demo-access';
import { OperatorShell } from './OperatorShell';

const sessionState = vi.hoisted(() => ({
  id: 'operator-1',
  role: 'CLAIMS_OPERATOR' as StaffRole,
  signOut: vi.fn(),
}));

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: {
        id: sessionState.id,
        login: 'operator@example.test',
        role: sessionState.role,
      },
    },
    signIn: vi.fn(),
    signOut: sessionState.signOut,
  }),
}));

describe('OperatorShell', () => {
  beforeEach(() => {
    sessionState.id = 'operator-1';
    sessionState.role = 'CLAIMS_OPERATOR';
    sessionState.signOut.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('separates authorized navigation from visual maturity for a claims operator', () => {
    render(
      <MemoryRouter initialEntries={['/operator/dashboard']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByText('InsuranceClaims')).toBeTruthy();
    expect(screen.getAllByText('Centro de Operaciones').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Operación' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Clientes y pólizas' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Administración' })).toBeNull();

    expect(screen.getByRole('link', { name: /Espacio de trabajo/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tablero/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Siniestros/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Tareas$/ }).getAttribute('href')).toBe('/operator/tasks');

    const pendingLabels = ['Clientes', 'Pólizas', 'Renovaciones', 'Cobranzas'];
    for (const label of pendingLabels) {
      const text = screen.getByText(label);
      expect(text.closest('[aria-disabled="true"]')).toBeTruthy();
      expect(screen.queryByRole('link', { name: new RegExp(`^${label}$`) })).toBeNull();
    }

    expect(screen.queryByText('Analítica')).toBeNull();
    expect(screen.queryByText('Pipelines')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Claims$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Tasks$/ })).toBeNull();
  });

  it('does not elevate platform admin into business navigation while keeping authorized pending capabilities visible', () => {
    sessionState.role = 'PLATFORM_ADMIN';

    render(
      <MemoryRouter initialEntries={['/operator/workspace']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Administración' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Clientes y pólizas' })).toBeNull();
    expect(screen.getByRole('link', { name: /Espacio de trabajo/ }).getAttribute('aria-current')).toBe('page');

    const pendingLabels = [
      'Analítica',
      'Pipelines',
      'Plantillas',
      'Campos',
      'Orientación',
      'Automatizaciones',
      'Importaciones',
      'Recuperación',
    ];
    for (const label of pendingLabels) {
      const text = screen.getByText(label);
      expect(text.closest('[aria-disabled="true"]')).toBeTruthy();
      expect(screen.queryByRole('link', { name: new RegExp(`^${label}$`) })).toBeNull();
    }

    expect(screen.queryByText('Tablero')).toBeNull();
    expect(screen.queryByText('Siniestros')).toBeNull();
    expect(screen.queryByText('Tareas')).toBeNull();
    expect(screen.queryByText('Clientes')).toBeNull();
    expect(screen.queryByText('Pólizas')).toBeNull();
  });

  it('shows the complete information architecture in the public demo and links ready authorized views', () => {
    sessionState.id = PUBLIC_DEMO_OPERATOR_ID;

    render(
      <MemoryRouter initialEntries={['/operator/claims']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Clientes y pólizas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Administración' })).toBeTruthy();

    const navigation = screen.getByRole('navigation');
    const nav = within(navigation);
    const clickable = nav.getAllByRole('link');
    expect(clickable).toHaveLength(4);

    expect(nav.getByRole('link', { name: /Espacio de trabajo/ }).getAttribute('href')).toBe('/operator/workspace');
    expect(nav.getByRole('link', { name: /Tablero/ }).getAttribute('href')).toBe('/operator/dashboard');
    expect(nav.getByRole('link', { name: /Siniestros/ }).getAttribute('href')).toBe('/operator/claims');
    expect(nav.getByRole('link', { name: /^Tareas$/ }).getAttribute('href')).toBe('/operator/tasks');
    expect(nav.getByRole('link', { name: /Siniestros/ }).getAttribute('aria-current')).toBe('page');

    const completeCatalog = [
      'Espacio de trabajo', 'Tablero', 'Siniestros', 'Tareas', 'Analítica',
      'Clientes', 'Pólizas', 'Renovaciones', 'Cobranzas', 'Pipelines',
      'Plantillas', 'Campos', 'Orientación', 'Automatizaciones', 'Importaciones', 'Recuperación',
    ];
    for (const label of completeCatalog) {
      expect(nav.getByText(label)).toBeTruthy();
    }

    expect(navigation.querySelectorAll('[aria-disabled="true"]')).toHaveLength(12);
  });

  it('keeps logout wired to the existing session action', () => {
    render(
      <MemoryRouter initialEntries={['/operator/dashboard']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(sessionState.signOut).toHaveBeenCalledTimes(1);
  });
});
