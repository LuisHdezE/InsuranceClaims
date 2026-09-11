import { describe, expect, it } from 'vitest';
import {
  defaultStaffRoute,
  hasAllPermissions,
  hasPermission,
  permissionsForRole,
  resolveStaffLandingRoute,
} from './staff-access';

describe('R3 staff presentation access', () => {
  it('keeps Platform Admin out of business-operation permissions', () => {
    expect(hasPermission('PLATFORM_ADMIN', 'claims.backoffice.read')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'claims.backoffice.transition')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'claims.tasks.manage')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'renewals.read')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'renewals.manage')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'collections.read')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'collections.manage')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'claims.analytics.read')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'pipelines.admin')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'communications.admin')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'guidance.admin')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'custom_fields.admin')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'operations.integration.read')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'operations.dead_letters.read')).toBe(true);
    expect(hasPermission('PLATFORM_ADMIN', 'operations.dead_letters.manage')).toBe(true);
  });

  it('gives Supervisor operator capabilities plus analytics and bulk', () => {
    expect(hasAllPermissions('CLAIMS_SUPERVISOR', [
      'claims.backoffice.read',
      'claims.tasks.manage',
      'claims.analytics.read',
      'bulk.execute',
      'customers.read',
      'policies.read',
      'renewals.read',
      'renewals.manage',
      'collections.read',
      'collections.manage',
    ])).toBe(true);
  });

  it('keeps the presentation grants duplicate-free', () => {
    for (const role of ['CLAIMS_OPERATOR', 'CLAIMS_SUPERVISOR', 'PLATFORM_ADMIN'] as const) {
      const grants = permissionsForRole(role);
      expect(new Set(grants).size).toBe(grants.length);
    }
  });

  it('routes operational staff to Dashboard and Platform Admin to Workspace', () => {
    expect(defaultStaffRoute('CLAIMS_OPERATOR')).toBe('/operator/dashboard');
    expect(defaultStaffRoute('CLAIMS_SUPERVISOR')).toBe('/operator/dashboard');
    expect(defaultStaffRoute('PLATFORM_ADMIN')).toBe('/operator/workspace');
  });

  it('honors permitted operational deep links without elevating Platform Admin', () => {
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/claims')).toBe('/operator/claims');
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/tasks/11111111-1111-4111-8111-111111111111')).toBe('/operator/tasks/11111111-1111-4111-8111-111111111111');
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/customers/11111111-1111-4111-8111-111111111111')).toBe('/operator/customers/11111111-1111-4111-8111-111111111111');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/policies')).toBe('/operator/policies');
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/renewals/33333333-3333-4333-8333-333333333333')).toBe('/operator/renewals/33333333-3333-4333-8333-333333333333');
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/collections/44444444-4444-4444-8444-444444444444')).toBe('/operator/collections/44444444-4444-4444-8444-444444444444');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/customers')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/policies/22222222-2222-4222-8222-222222222222')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/renewals')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/collections')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/claims')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/workspace')).toBe('/operator/workspace');
  });

  it('permits Analytics deep links only for roles with claims.analytics.read', () => {
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/analytics')).toBe('/operator/analytics');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/analytics')).toBe('/operator/analytics');
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/analytics')).toBe('/operator/dashboard');
  });

  it('permits Pipeline Admin deep links only for Platform Admin', () => {
    const detail = '/operator/admin/pipelines/55555555-5555-4555-8555-555555555555';
    const versionEditor = `${detail}/versions/new`;

    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/pipelines')).toBe('/operator/admin/pipelines');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/pipelines/new')).toBe('/operator/admin/pipelines/new');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', detail)).toBe(detail);
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', versionEditor)).toBe(versionEditor);
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', detail)).toBe('/operator/dashboard');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/admin/pipelines')).toBe('/operator/dashboard');
  });

  it('permits Communication Template Admin deep links only for Platform Admin', () => {
    const detail = '/operator/admin/communication-templates/66666666-6666-4666-8666-666666666666';
    const versionEditor = `${detail}/versions/new`;

    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/communication-templates')).toBe('/operator/admin/communication-templates');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/communication-templates/new')).toBe('/operator/admin/communication-templates/new');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', detail)).toBe(detail);
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', versionEditor)).toBe(versionEditor);
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', detail)).toBe('/operator/dashboard');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/admin/communication-templates')).toBe('/operator/dashboard');
  });

  it('permits Custom Field Admin deep links only for Platform Admin', () => {
    const detail = '/operator/admin/custom-fields/88888888-8888-4888-8888-888888888888';
    const versionEditor = `${detail}/versions/new`;

    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/custom-fields')).toBe('/operator/admin/custom-fields');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/custom-fields/new')).toBe('/operator/admin/custom-fields/new');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', detail)).toBe(detail);
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', versionEditor)).toBe(versionEditor);
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', detail)).toBe('/operator/dashboard');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/admin/custom-fields')).toBe('/operator/dashboard');
  });

  it('permits Guidance Admin deep links only for Platform Admin', () => {
    const detail = '/operator/admin/guidance/99999999-9999-4999-8999-999999999999';
    const versionEditor = `${detail}/versions/new`;

    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/guidance')).toBe('/operator/admin/guidance');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/guidance/new')).toBe('/operator/admin/guidance/new');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', detail)).toBe(detail);
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', versionEditor)).toBe(versionEditor);
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', detail)).toBe('/operator/dashboard');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/admin/guidance')).toBe('/operator/dashboard');
  });

  it('permits Recovery deep links only for Platform Admin', () => {
    const detail = '/operator/admin/recovery/dead-letters/77777777-7777-4777-8777-777777777777';

    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/recovery')).toBe('/operator/admin/recovery');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', detail)).toBe(detail);
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/admin/recovery')).toBe('/operator/dashboard');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', detail)).toBe('/operator/dashboard');
  });
});
