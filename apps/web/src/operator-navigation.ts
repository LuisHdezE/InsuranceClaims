import type { StaffRole } from './api/types';
import { hasAllPermissions, type StaffPermission } from './auth/staff-access';

export type OperatorNavGroupKey = 'operations' | 'portfolio' | 'administration';
export type OperatorNavMaturity = 'ready' | 'pending';

export type OperatorNavGroup = {
  key: OperatorNavGroupKey;
  label: string;
};

export type OperatorNavItem = {
  to: string;
  label: string;
  glyph: string;
  group: OperatorNavGroupKey;
  allOf?: readonly StaffPermission[];
  maturity: OperatorNavMaturity;
  context: string;
};

export const OPERATOR_NAV_GROUPS: readonly OperatorNavGroup[] = [
  { key: 'operations', label: 'Operación' },
  { key: 'portfolio', label: 'Clientes y pólizas' },
  { key: 'administration', label: 'Administración' },
] as const;

/*
 * Single source of truth for the final operator navigation information architecture.
 *
 * A route can be real and authorized while still being visually pending. In that case
 * the sidebar reserves its permanent place but does not link it until the corresponding
 * visual increment is approved. This lets the shell stabilize once while screens mature
 * independently.
 */
export const OPERATOR_NAV_ITEMS: readonly OperatorNavItem[] = [
  {
    to: '/operator/workspace',
    label: 'Espacio de trabajo',
    glyph: '◇',
    group: 'operations',
    maturity: 'ready',
    context: 'Espacio de trabajo por rol · Solo capacidades autorizadas y productizadas',
  },
  {
    to: '/operator/dashboard',
    label: 'Tablero',
    glyph: '⌂',
    group: 'operations',
    allOf: ['claims.backoffice.read', 'claims.tasks.read'],
    maturity: 'ready',
    context: 'Tablero de Operaciones R3 · Priorización del trabajo que requiere atención',
  },
  {
    to: '/operator/claims',
    label: 'Siniestros',
    glyph: '▱',
    group: 'operations',
    allOf: ['claims.backoffice.read'],
    maturity: 'ready',
    context: 'Listado autoritativo del API · Espacio de siniestros protegido y consciente del rol',
  },
  {
    to: '/operator/tasks',
    label: 'Tareas',
    glyph: '☑',
    group: 'operations',
    allOf: ['claims.tasks.read'],
    maturity: 'pending',
    context: 'Tareas R3 · Trabajo operativo independiente del ciclo de vida del siniestro',
  },
  {
    to: '/operator/analytics',
    label: 'Analítica',
    glyph: '◫',
    group: 'operations',
    allOf: ['claims.analytics.read'],
    maturity: 'pending',
    context: 'Analítica de siniestros R3 · Métricas agregadas sin elevar permisos de negocio',
  },
  {
    to: '/operator/customers',
    label: 'Clientes',
    glyph: '◎',
    group: 'portfolio',
    allOf: ['customers.read'],
    maturity: 'pending',
    context: 'Cliente 360 R3 · Relaciones autoritativas y solo lectura',
  },
  {
    to: '/operator/policies',
    label: 'Pólizas',
    glyph: '▤',
    group: 'portfolio',
    allOf: ['policies.read'],
    maturity: 'pending',
    context: 'Póliza 360 R3 · Referencias modernas y legacy',
  },
  {
    to: '/operator/renewals',
    label: 'Renovaciones',
    glyph: '↻',
    group: 'portfolio',
    allOf: ['renewals.read'],
    maturity: 'pending',
    context: 'Renovaciones R3 · Ciclo de vida y pipeline operativo con control de versión',
  },
  {
    to: '/operator/collections',
    label: 'Cobranzas',
    glyph: '¤',
    group: 'portfolio',
    allOf: ['collections.read'],
    maturity: 'pending',
    context: 'Cobranzas R3 · Ciclo de vida, pago verificado y pipeline separados',
  },
  {
    to: '/operator/admin/pipelines',
    label: 'Pipelines',
    glyph: '⌘',
    group: 'administration',
    allOf: ['pipelines.admin'],
    maturity: 'pending',
    context: 'Administración de pipelines R3 · Versiones inmutables y activación gobernada',
  },
  {
    to: '/operator/admin/communication-templates',
    label: 'Plantillas',
    glyph: '✉',
    group: 'administration',
    allOf: ['communications.admin'],
    maturity: 'pending',
    context: 'Plantillas de comunicación R3 · Contenido versionado y activación gobernada',
  },
  {
    to: '/operator/admin/custom-fields',
    label: 'Campos',
    glyph: '⊞',
    group: 'administration',
    allOf: ['custom_fields.admin'],
    maturity: 'pending',
    context: 'Campos personalizados R3 · Proyecciones extendidas con versionado y límites de dominio',
  },
  {
    to: '/operator/admin/guidance',
    label: 'Orientación',
    glyph: '◈',
    group: 'administration',
    allOf: ['guidance.admin'],
    maturity: 'pending',
    context: 'Administración de orientación R3 · Contenido versionado sin semántica inventada',
  },
  {
    to: '/operator/admin/automations',
    label: 'Automatizaciones',
    glyph: '⚙',
    group: 'administration',
    allOf: ['automations.admin'],
    maturity: 'pending',
    context: 'Administración de automatizaciones R3 · Reglas versionadas con disparadores y acciones permitidas',
  },
  {
    to: '/operator/admin/imports',
    label: 'Importaciones',
    glyph: '⇧',
    group: 'administration',
    allOf: ['imports.execute'],
    maturity: 'pending',
    context: 'Importaciones gobernadas R3 · Vista previa, mapeo, validación, dry-run y commit gobernados',
  },
  {
    to: '/operator/admin/recovery',
    label: 'Recuperación',
    glyph: '↺',
    group: 'administration',
    allOf: ['operations.integration.read', 'operations.dead_letters.read'],
    maturity: 'pending',
    context: 'Operaciones de recuperación R3 · Integraciones y dead letters con acceso separado',
  },
] as const;

export function operatorNavItemsForRole(role: StaffRole): readonly OperatorNavItem[] {
  return OPERATOR_NAV_ITEMS.filter((item) => !item.allOf || hasAllPermissions(role, item.allOf));
}

export function operatorNavItemCanLink(item: OperatorNavItem, role: StaffRole | undefined): boolean {
  if (item.maturity !== 'ready' || !role) return false;
  return !item.allOf || hasAllPermissions(role, item.allOf);
}

export function operatorContextForPath(path: string): string {
  const item = OPERATOR_NAV_ITEMS.find((candidate) => (
    path === candidate.to || path.startsWith(`${candidate.to}/`)
  ));

  return item?.context ?? 'Espacio de trabajo protegido y consciente del rol';
}
