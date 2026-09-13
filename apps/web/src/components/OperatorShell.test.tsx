import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffRole } from '../api/types';
import { OperatorShell } from './OperatorShell';

const sessionState = vi.hoisted(() => ({
  role: 'CLAIMS_OPERATOR' as StaffRole,
  signOut: vi.fn(),
}));

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: {
        id: 'operator-1',
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
    sessionState.role = 'CLAIMS_OPERATOR';
    sessionState.signOut.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('groups visible navigation in Spanish while preserving operator permission filtering', () => {
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

    expect(screen.getByRole('link', { name: /Tablero/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Siniestros/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tareas/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Analítica/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Pipelines/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Claims$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Tasks$/ })).toBeNull();
  });

  it('does not elevate platform admin into Claims navigation', () => {
    sessionState.role = 'PLATFORM_ADMIN';

    render(
      <MemoryRouter initialEntries={['/operator/workspace']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Administración' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Analítica/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pipelines/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Orientación/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Automatizaciones/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Importaciones/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Recuperación/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Tablero/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Siniestros$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Tareas$/ })).toBeNull();
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
