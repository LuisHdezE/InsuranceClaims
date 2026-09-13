import { describe, expect, it } from 'vitest';
import { canAccessStaffPath, resolveStaffLandingRoute } from './staff-access';

describe('R3 governed imports presentation access', () => {
  it('preserves Platform Admin deep links for every productized import route', () => {
    const detail = '/operator/admin/imports/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    expect(canAccessStaffPath('PLATFORM_ADMIN', '/operator/admin/imports')).toBe(true);
    expect(canAccessStaffPath('PLATFORM_ADMIN', '/operator/admin/imports/new')).toBe(true);
    expect(canAccessStaffPath('PLATFORM_ADMIN', detail)).toBe(true);

    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/imports')).toBe('/operator/admin/imports');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', '/operator/admin/imports/new')).toBe('/operator/admin/imports/new');
    expect(resolveStaffLandingRoute('PLATFORM_ADMIN', detail)).toBe(detail);
  });

  it('does not elevate operational roles into governed imports', () => {
    expect(canAccessStaffPath('CLAIMS_OPERATOR', '/operator/admin/imports')).toBe(false);
    expect(canAccessStaffPath('CLAIMS_SUPERVISOR', '/operator/admin/imports/new')).toBe(false);
    expect(resolveStaffLandingRoute('CLAIMS_OPERATOR', '/operator/admin/imports')).toBe('/operator/dashboard');
    expect(resolveStaffLandingRoute('CLAIMS_SUPERVISOR', '/operator/admin/imports/new')).toBe('/operator/dashboard');
  });
});
