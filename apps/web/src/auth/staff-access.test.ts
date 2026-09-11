import { describe, expect, it } from 'vitest';
import {
  defaultStaffRoute,
  hasAllPermissions,
  hasPermission,
  permissionsForRole,
  resolveStaffLandingRoute,
} from './staff-access';

describe('R3 staff presentation access', () => {
  it('keeps Platform Admin out of Claim and Renewal lifecycle permissions', () => {
    expect(hasPermission('PLATFORM_ADMIN', 'claims.backoffice.read')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'claims.backoffice.transition')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'claims.tasks.manage')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'renewals.read')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'renewals.manage')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'pipelines.admin')).toBe(true);
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
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/customers')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/policies/22222222-2222-4222-8222-222222222222')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/renewals')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/claims')).toBe('/operator/workspace');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/workspace')).toBe('/operator/workspace');
  });
});
