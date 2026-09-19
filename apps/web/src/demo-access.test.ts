import { describe, expect, it } from 'vitest';
import { isPublicDemoPath } from './demo-access';

describe('public demo route access', () => {
  it('allows ready read routes authorized for a claims operator', () => {
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
    expect(isPublicDemoPath('/operator/admin/pipelines', 'CLAIMS_OPERATOR')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/communication-templates', 'CLAIMS_OPERATOR')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/custom-fields', 'CLAIMS_OPERATOR')).toBe(false);
    expect(isPublicDemoPath('/operator/analytics', 'CLAIMS_OPERATOR')).toBe(false);
  });

  it('allows productized admin read routes only to roles that own their permissions', () => {
    expect(isPublicDemoPath('/operator/analytics', 'CLAIMS_SUPERVISOR')).toBe(true);
    expect(isPublicDemoPath('/operator/analytics', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/pipelines', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/pipelines/pipeline-123', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/communication-templates', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/communication-templates/template-123', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/custom-fields', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/custom-fields/field-123', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/admin/pipelines', 'CLAIMS_SUPERVISOR')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/communication-templates', 'CLAIMS_SUPERVISOR')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/custom-fields', 'CLAIMS_SUPERVISOR')).toBe(false);
  });

  it('rejects public demo create and nested mutation routes', () => {
    expect(isPublicDemoPath('/operator/admin/pipelines/new', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/pipelines/pipeline-123/versions/new', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/communication-templates/new', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/communication-templates/template-123/versions/new', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/custom-fields/new', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/admin/custom-fields/field-123/versions/new', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/tasks/task-123/complete', 'CLAIMS_OPERATOR')).toBe(false);
    expect(isPublicDemoPath('/operator/renewals/renewal-123/edit', 'CLAIMS_OPERATOR')).toBe(false);
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