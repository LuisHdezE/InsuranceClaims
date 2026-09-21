import { describe, expect, it } from 'vitest';
import type { StaffRole } from './api/types';
import {
  OPERATOR_NAV_ITEMS,
  OPERATOR_WORKSPACE_CARDS,
  operatorNavItemCanLink,
  operatorNavItemForPath,
  operatorWorkspaceCardCanLink,
  operatorWorkspaceCardsForRole,
} from './operator-navigation';

const ROLES: StaffRole[] = ['CLAIMS_OPERATOR', 'CLAIMS_SUPERVISOR', 'PLATFORM_ADMIN'];

describe('operator navigation integration baseline', () => {
  it('keeps every workspace card anchored to canonical navigation items', () => {
    for (const card of OPERATOR_WORKSPACE_CARDS) {
      expect(card.navPaths).toContain(card.href);
      expect(card.navPaths.length).toBeGreaterThan(0);
      for (const path of card.navPaths) {
        expect(operatorNavItemForPath(path), `${card.title} references ${path}`).toBeTruthy();
      }
    }
  });

  it('represents every ready module in the workspace model except the workspace itself', () => {
    const representedPaths = new Set(OPERATOR_WORKSPACE_CARDS.flatMap((card) => [...card.navPaths]));
    const readyModulePaths = OPERATOR_NAV_ITEMS
      .filter((item) => item.maturity === 'ready' && item.to !== '/operator/workspace')
      .map((item) => item.to);

    for (const path of readyModulePaths) {
      expect(representedPaths.has(path), `${path} must be represented by a workspace card`).toBe(true);
    }
  });

  it('ensures every ready module is linkable by at least one real role without inventing a superuser', () => {
    for (const item of OPERATOR_NAV_ITEMS.filter((candidate) => candidate.maturity === 'ready')) {
      expect(
        ROLES.some((role) => operatorNavItemCanLink(item, role)),
        `${item.to} has no authorized real role`,
      ).toBe(true);
    }
  });

  it('derives workspace visibility from both authorization and visual maturity', () => {
    const operatorTitles = operatorWorkspaceCardsForRole('CLAIMS_OPERATOR').map((card) => card.title);
    expect(operatorTitles).toEqual([
      'Siniestros y trabajo operativo',
      'Clientes y pólizas',
      'Renovaciones',
      'Cobranzas',
    ]);

    const supervisorTitles = operatorWorkspaceCardsForRole('CLAIMS_SUPERVISOR').map((card) => card.title);
    expect(supervisorTitles).toEqual([
      'Siniestros y trabajo operativo',
      'Clientes y pólizas',
      'Renovaciones',
      'Cobranzas',
      'Métricas operacionales',
    ]);

    const adminTitles = operatorWorkspaceCardsForRole('PLATFORM_ADMIN').map((card) => card.title);
    expect(adminTitles).toEqual([
      'Métricas operacionales',
      'Administración de pipelines',
      'Plantillas de comunicación',
      'Campos personalizados',
      'Orientación',
      'Automatizaciones',
      'Importaciones gobernadas',
    ]);
    expect(adminTitles).not.toContain('Integraciones y recuperación');
  });

  it('never lets a pending workspace card become clickable even when the role owns its permission', () => {
    const pendingAdminCards = OPERATOR_WORKSPACE_CARDS.filter((card) => (
      card.navPaths.some((path) => operatorNavItemForPath(path)?.maturity === 'pending')
    ));

    expect(pendingAdminCards.length).toBeGreaterThan(0);
    for (const card of pendingAdminCards) {
      expect(operatorWorkspaceCardCanLink(card, 'PLATFORM_ADMIN'), card.title).toBe(false);
    }
  });
});
