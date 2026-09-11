import type { StaffRole } from '../api/types';

export type StaffPermission =
  | 'claims.backoffice.read'
  | 'claims.backoffice.transition'
  | 'claims.tasks.read'
  | 'claims.tasks.manage'
  | 'claims.pipeline.read'
  | 'claims.pipeline.transition'
  | 'claims.analytics.read'
  | 'communications.read'
  | 'communications.send'
  | 'customers.read'
  | 'policies.read'
  | 'renewals.read'
  | 'renewals.manage'
  | 'collections.read'
  | 'collections.manage'
  | 'bulk.execute'
  | 'pipelines.admin'
  | 'communications.admin'
  | 'automations.admin'
  | 'guidance.admin'
  | 'custom_fields.admin'
  | 'imports.execute'
  | 'operations.integration.read'
  | 'operations.dead_letters.read'
  | 'operations.dead_letters.manage';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  CLAIMS_OPERATOR: 'Operador de siniestros',
  CLAIMS_SUPERVISOR: 'Supervisor de siniestros',
  PLATFORM_ADMIN: 'Administrador de plataforma',
};

const ROLE_GRANTS = {
  CLAIMS_OPERATOR: [
    'claims.backoffice.read', 'claims.backoffice.transition', 'claims.tasks.read', 'claims.tasks.manage',
    'claims.pipeline.read', 'claims.pipeline.transition', 'communications.read', 'communications.send',
    'customers.read', 'policies.read', 'renewals.read', 'renewals.manage', 'collections.read', 'collections.manage',
  ],
  CLAIMS_SUPERVISOR: [
    'claims.backoffice.read', 'claims.backoffice.transition', 'claims.tasks.read', 'claims.tasks.manage',
    'claims.pipeline.read', 'claims.pipeline.transition', 'claims.analytics.read', 'communications.read',
    'communications.send', 'customers.read', 'policies.read', 'renewals.read', 'renewals.manage',
    'collections.read', 'collections.manage', 'bulk.execute',
  ],
  PLATFORM_ADMIN: [
    'claims.analytics.read', 'pipelines.admin', 'communications.admin', 'automations.admin', 'guidance.admin',
    'custom_fields.admin', 'imports.execute', 'operations.integration.read', 'operations.dead_letters.read',
    'operations.dead_letters.manage',
  ],
} as const satisfies Record<StaffRole, readonly StaffPermission[]>;

export function permissionsForRole(role: StaffRole): readonly StaffPermission[] {
  return ROLE_GRANTS[role];
}

export function hasPermission(role: StaffRole, permission: StaffPermission): boolean {
  return permissionsForRole(role).includes(permission);
}

export function hasAllPermissions(role: StaffRole, permissions: readonly StaffPermission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}

export function hasAnyPermission(role: StaffRole, permissions: readonly StaffPermission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function defaultStaffRoute(role: StaffRole): string {
  return hasAllPermissions(role, ['claims.backoffice.read', 'claims.tasks.read']) ? '/operator/dashboard' : '/operator/workspace';
}

export function canAccessStaffPath(role: StaffRole, path: string): boolean {
  if (path === '/operator/workspace') return true;
  if (path === '/operator/dashboard') return hasAllPermissions(role, ['claims.backoffice.read', 'claims.tasks.read']);
  if (path === '/operator/analytics') return hasPermission(role, 'claims.analytics.read');
  if (path === '/operator/claims' || /^\/operator\/claims\/[^/]+$/.test(path)) return hasPermission(role, 'claims.backoffice.read');
  if (path === '/operator/tasks' || /^\/operator\/tasks\/[^/]+$/.test(path)) return hasPermission(role, 'claims.tasks.read');
  if (path === '/operator/customers' || /^\/operator\/customers\/[^/]+$/.test(path)) return hasPermission(role, 'customers.read');
  if (path === '/operator/policies' || /^\/operator\/policies\/[^/]+$/.test(path)) return hasPermission(role, 'policies.read');
  if (path === '/operator/renewals' || /^\/operator\/renewals\/[^/]+$/.test(path)) return hasPermission(role, 'renewals.read');
  if (path === '/operator/collections' || /^\/operator\/collections\/[^/]+$/.test(path)) return hasPermission(role, 'collections.read');
  if (
    path === '/operator/admin/pipelines'
    || path === '/operator/admin/pipelines/new'
    || /^\/operator\/admin\/pipelines\/[^/]+$/.test(path)
    || /^\/operator\/admin\/pipelines\/[^/]+\/versions\/new$/.test(path)
  ) return hasPermission(role, 'pipelines.admin');
  if (
    path === '/operator/admin/communication-templates'
    || path === '/operator/admin/communication-templates/new'
    || /^\/operator\/admin\/communication-templates\/[^/]+$/.test(path)
    || /^\/operator\/admin\/communication-templates\/[^/]+\/versions\/new$/.test(path)
  ) return hasPermission(role, 'communications.admin');
  if (
    path === '/operator/admin/custom-fields'
    || path === '/operator/admin/custom-fields/new'
    || /^\/operator\/admin\/custom-fields\/[^/]+$/.test(path)
    || /^\/operator\/admin\/custom-fields\/[^/]+\/versions\/new$/.test(path)
  ) return hasPermission(role, 'custom_fields.admin');
  if (
    path === '/operator/admin/guidance'
    || path === '/operator/admin/guidance/new'
    || /^\/operator\/admin\/guidance\/[^/]+$/.test(path)
    || /^\/operator\/admin\/guidance\/[^/]+\/versions\/new$/.test(path)
  ) return hasPermission(role, 'guidance.admin');
  if (path === '/operator/admin/recovery') {
    return hasAllPermissions(role, ['operations.integration.read', 'operations.dead_letters.read']);
  }
  if (/^\/operator\/admin\/recovery\/dead-letters\/[^/]+$/.test(path)) {
    return hasPermission(role, 'operations.dead_letters.read');
  }
  return false;
}

export function resolveStaffLandingRoute(role: StaffRole, requestedPath?: string | null): string {
  return requestedPath && canAccessStaffPath(role, requestedPath) ? requestedPath : defaultStaffRoute(role);
}
