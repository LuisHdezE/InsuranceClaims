import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '../api/types';
import { PUBLIC_DEMO_OPERATOR_ID, PUBLIC_DEMO_PERSONAS } from '../demo-access';
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
    expect(screen.queryByText('Demo pública · solo lectura')).toBeNull();

    expect(screen.getByRole('link', { name: /Espacio de trabajo/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tablero/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Siniestros/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Tareas$/ }).getAttribute('href')).toBe('/operator/tasks');
    expect(screen.getByRole('link', { name: /^Clientes$/ }).getAttribute('href')).toBe('/operator/customers');
    expect(screen.getByRole('link', { name: /^Pólizas$/ }).getAttribute('href')).toBe('/operator/policies');
    expect(screen.getByRole('link', { name: /^Renovaciones$/ }).getAttribute('href')).toBe('/operator/renewals');
    expect(screen.getByRole('link', { name: /^Cobranzas$/ }).getAttribute('href')).toBe('/operator/collections');

    expect(screen.queryByText('Analítica')).toBeNull();
    expect(screen.queryByText('Pipelines')).toBeNull();
    expect(screen.queryByRole('link', { name: /^Claims$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Tasks$/ })).toBeNull();
  });

  it('does not elevate platform admin into business navigation while linking productized admin capabilities', () => {
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
    expect(screen.getByRole('link', { name: /^Analítica$/ }).getAttribute('href')).toBe('/operator/analytics');
    expect(screen.getByRole('link', { name: /^Pipelines$/ }).getAttribute('href')).toBe('/operator/admin/pipelines');
    expect(screen.getByRole('link', { name: /^Plantillas$/ }).getAttribute('href')).toBe('/operator/admin/communication-templates');
    expect(screen.getByRole('link', { name: /^Campos$/ }).getAttribute('href')).toBe('/operator/admin/custom-fields');
    expect(screen.getByRole('link', { name: /^Orientación$/ }).getAttribute('href')).toBe('/operator/admin/guidance');
    expect(screen.getByRole('link', { name: /^Automatizaciones$/ }).getAttribute('href')).toBe('/operator/admin/automations');
    expect(screen.getByRole('link', { name: /^Importaciones$/ }).getAttribute('href')).toBe('/operator/admin/imports');
    expect(screen.getByRole('link', { name: /^Recuperación$/ }).getAttribute('href')).toBe('/operator/admin/recovery');

    expect(screen.queryByText('Tablero')).toBeNull();
    expect(screen.queryByText('Siniestros')).toBeNull();
    expect(screen.queryByText('Tareas')).toBeNull();
    expect(screen.queryByText('Clientes')).toBeNull();
    expect(screen.queryByText('Pólizas')).toBeNull();
    expect(screen.queryByText('Renovaciones')).toBeNull();
    expect(screen.queryByText('Cobranzas')).toBeNull();
  });

  it('shows only ready authorized navigation and read-only disclosure for the public Operations persona', () => {
    sessionState.id = PUBLIC_DEMO_OPERATOR_ID;

    render(
      <MemoryRouter initialEntries={['/operator/claims']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Operación' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Clientes y pólizas' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Administración' })).toBeNull();
    expect(screen.getByText('Demo pública · solo lectura')).toBeTruthy();
    expect(screen.getByText(/acciones que cambian estado o configuración están ocultas/i)).toBeTruthy();

    const navigation = screen.getByRole('navigation');
    const nav = within(navigation);
    const clickable = nav.getAllByRole('link');
    expect(clickable).toHaveLength(8);

    expect(nav.getByRole('link', { name: /Espacio de trabajo/ }).getAttribute('href')).toBe('/operator/workspace');
    expect(nav.getByRole('link', { name: /Tablero/ }).getAttribute('href')).toBe('/operator/dashboard');
    expect(nav.getByRole('link', { name: /Siniestros/ }).getAttribute('href')).toBe('/operator/claims');
    expect(nav.getByRole('link', { name: /^Tareas$/ }).getAttribute('href')).toBe('/operator/tasks');
    expect(nav.getByRole('link', { name: /^Clientes$/ }).getAttribute('href')).toBe('/operator/customers');
    expect(nav.getByRole('link', { name: /^Pólizas$/ }).getAttribute('href')).toBe('/operator/policies');
    expect(nav.getByRole('link', { name: /^Renovaciones$/ }).getAttribute('href')).toBe('/operator/renewals');
    expect(nav.getByRole('link', { name: /^Cobranzas$/ }).getAttribute('href')).toBe('/operator/collections');
    expect(nav.getByRole('link', { name: /Siniestros/ }).getAttribute('aria-current')).toBe('page');

    const authorizedCatalog = [
      'Espacio de trabajo', 'Tablero', 'Siniestros', 'Tareas',
      'Clientes', 'Pólizas', 'Renovaciones', 'Cobranzas',
    ];
    for (const label of authorizedCatalog) {
      expect(nav.getByText(label)).toBeTruthy();
    }

    for (const hiddenLabel of ['Analítica', 'Pipelines', 'Plantillas', 'Campos', 'Orientación', 'Automatizaciones', 'Importaciones', 'Recuperación']) {
      expect(nav.queryByText(hiddenLabel)).toBeNull();
    }
    expect(navigation.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it('keeps Recovery hidden from the public Administration persona after productization', () => {
    sessionState.id = PUBLIC_DEMO_PERSONAS.administration.id;
    sessionState.role = 'PLATFORM_ADMIN';

    render(
      <MemoryRouter initialEntries={['/operator/workspace']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation');
    const nav = within(navigation);
    expect(nav.getByRole('link', { name: /^Importaciones$/ })).toBeTruthy();
    expect(nav.queryByRole('link', { name: /^Recuperación$/ })).toBeNull();
    expect(nav.queryByText('Recuperación')).toBeNull();
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
