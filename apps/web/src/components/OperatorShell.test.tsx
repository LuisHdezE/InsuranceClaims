import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '../api/types';
import { PUBLIC_DEMO_PERSONAS } from '../demo-access';
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
    expect(screen.getByRole('link', { name: /^Clientes$/ }).getAttribute('href')).toBe('/operator/customers');
    expect(screen.getByRole('link', { name: /^Pólizas$/ }).getAttribute('href')).toBe('/operator/policies');
    expect(screen.getByRole('link', { name: /^Renovaciones$/ }).getAttribute('href')).toBe('/operator/renewals');
    expect(screen.getByRole('link', { name: /^Cobranzas$/ }).getAttribute('href')).toBe('/operator/collections');

    expect(screen.queryByText('Analítica')).toBeNull();
    expect(screen.queryByText('Pipelines')).toBeNull();
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

    for (const label of ['Orientación', 'Automatizaciones', 'Importaciones', 'Recuperación']) {
      const text = screen.getByText(label);
      expect(text.closest('[aria-disabled="true"]')).toBeTruthy();
      expect(screen.queryByRole('link', { name: new RegExp(`^${label}$`) })).toBeNull();
    }

    expect(screen.queryByText('Tablero')).toBeNull();
    expect(screen.queryByText('Siniestros')).toBeNull();
    expect(screen.queryByText('Tareas')).toBeNull();
    expect(screen.queryByText('Clientes')).toBeNull();
    expect(screen.queryByText('Pólizas')).toBeNull();
    expect(screen.queryByText('Renovaciones')).toBeNull();
    expect(screen.queryByText('Cobranzas')).toBeNull();
  });

  it('makes the operations demo sidebar fully traversable instead of exposing dead admin links', () => {
    sessionState.id = PUBLIC_DEMO_PERSONAS.operations.id;
    sessionState.role = PUBLIC_DEMO_PERSONAS.operations.role;

    render(
      <MemoryRouter initialEntries={['/operator/claims']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

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
    expect(nav.queryByText('Analítica')).toBeNull();
    expect(nav.queryByText('Pipelines')).toBeNull();
    expect(navigation.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it('gives the supervision demo analytics without administrative capabilities', () => {
    sessionState.id = PUBLIC_DEMO_PERSONAS.supervision.id;
    sessionState.role = PUBLIC_DEMO_PERSONAS.supervision.role;

    render(
      <MemoryRouter initialEntries={['/operator/analytics']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: /^Analítica$/ }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: /^Analítica$/ }).getAttribute('href')).toBe('/operator/analytics');
    expect(nav.queryByText('Pipelines')).toBeNull();
    expect(nav.queryByText('Campos')).toBeNull();
  });

  it('gives the administration demo only ready administration links and keeps pending modules disabled', () => {
    sessionState.id = PUBLIC_DEMO_PERSONAS.administration.id;
    sessionState.role = PUBLIC_DEMO_PERSONAS.administration.role;

    render(
      <MemoryRouter initialEntries={['/operator/admin/pipelines']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation');
    const nav = within(navigation);
    expect(nav.getByRole('link', { name: /^Pipelines$/ }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: /^Analítica$/ })).toBeTruthy();
    expect(nav.getByRole('link', { name: /^Plantillas$/ })).toBeTruthy();
    expect(nav.getByRole('link', { name: /^Campos$/ })).toBeTruthy();
    expect(nav.queryByText('Tablero')).toBeNull();
    expect(nav.queryByText('Siniestros')).toBeNull();

    for (const label of ['Orientación', 'Automatizaciones', 'Importaciones', 'Recuperación']) {
      expect(nav.getByText(label).closest('[aria-disabled="true"]')).toBeTruthy();
    }
    expect(navigation.querySelectorAll('[aria-disabled="true"]')).toHaveLength(4);
  });

  it('keeps the brand link role-safe for every demo persona', () => {
    sessionState.id = PUBLIC_DEMO_PERSONAS.administration.id;
    sessionState.role = PUBLIC_DEMO_PERSONAS.administration.role;

    render(
      <MemoryRouter initialEntries={['/operator/admin/custom-fields']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Ir al espacio de trabajo/ }).getAttribute('href')).toBe('/operator/workspace');
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
