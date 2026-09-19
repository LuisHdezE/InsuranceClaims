import { describe, expect, it } from 'vitest';
import { isPublicDemoPath } from './demo-access';

describe('public demo route access', () => {
  it('allows ready routes authorized for a claims operator', () => {
    expect(isPublicDemoPath('/operator/workspace', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/dashboard', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/claims', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/claims/claim-123', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/tasks', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/tasks/task-123', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/customers', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/customers/customer-123', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/policies', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/policies/policy-123', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/renewals', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/renewals/renewal-123', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/collections', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/collections/collection-123', 'CLAIMS_OPERATOR')).toBe(true);
    expect(isPublicDemoPath('/operator/analytics', 'CLAIMS_OPERATOR')).toBe(false);
  });

  it('allows Analytics only to roles that own claims.analytics.read', () => {
    expect(isPublicDemoPath('/operator/analytics', 'CLAIMS_SUPERVISOR')).toBe(true);
    expect(isPublicDemoPath('/operator/analytics', 'PLATFORM_ADMIN')).toBe(true);
  });

  it('does not elevate ready routes beyond the current role permissions', () => {
    expect(isPublicDemoPath('/operator/workspace', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/dashboard', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/claims', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/tasks', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/customers', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/policies', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/renewals', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/collections', 'PLATFORM_ADMIN')).toBe(false);
  });
});
