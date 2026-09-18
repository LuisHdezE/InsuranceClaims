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
  });

  it('keeps visually pending routes closed even when the role is authorized', () => {
    expect(isPublicDemoPath('/operator/customers', 'CLAIMS_OPERATOR')).toBe(false);
    expect(isPublicDemoPath('/operator/policies', 'CLAIMS_OPERATOR')).toBe(false);
  });

  it('does not elevate ready routes beyond the current role permissions', () => {
    expect(isPublicDemoPath('/operator/workspace', 'PLATFORM_ADMIN')).toBe(true);
    expect(isPublicDemoPath('/operator/dashboard', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/claims', 'PLATFORM_ADMIN')).toBe(false);
    expect(isPublicDemoPath('/operator/tasks', 'PLATFORM_ADMIN')).toBe(false);
  });
});
