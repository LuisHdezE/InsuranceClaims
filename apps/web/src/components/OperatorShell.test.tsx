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

  it('groups visible navigation while preserving operator permission filtering', () => {
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

    expect(screen.getByRole('link', { name: /Dashboard/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: /Claims/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Tasks/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Analytics/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Pipelines/ })).toBeNull();
  });

  it('does not elevate platform admin into Claims navigation', () => {
    sessionState.role = 'PLATFORM_ADMIN';

    render(
      <MemoryRouter initialEntries={['/operator/workspace']}>
        <OperatorShell><div>Contenido</div></OperatorShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Administración' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Analytics/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pipelines/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Dashboard/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Claims$/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^Tasks$/ })).toBeNull();
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
