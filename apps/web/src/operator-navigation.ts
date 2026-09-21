import type { StaffRole } from './api/types';
import { hasAllPermissions, type StaffPermission } from './auth/staff-access';

export type OperatorNavGroupKey = 'operations' | 'portfolio' | 'administration';
export type OperatorNavMaturity = 'ready' | 'pending';
export type OperatorWorkspaceGroupKey = 'operations' | 'supervision' | 'platform' | 'technical';
export type OperatorWorkspaceTone = 'cyan' | 'blue' | 'violet' | 'yellow' | 'green';

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

export type OperatorWorkspaceGroup = {
  key: OperatorWorkspaceGroupKey;
  label: string;
  description: string;
};

export type OperatorWorkspaceCard = {
  group: OperatorWorkspaceGroupKey;
  kicker: string;
  title: string;
  description: string;
  navPaths: readonly string[];
  href: string;
  action: string;
  tone: OperatorWorkspaceTone;
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
 * visual increment is approved. Workspace launch cards consume this same maturity
 * authority, so a pending module cannot become clickable through a second catalog.
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
    maturity: 'ready',
    context: 'Tareas R3 · Trabajo operativo independiente del ciclo de vida del siniestro',
  },
  {
    to: '/operator/analytics',
    label: 'Analítica',
    glyph: '◫',
    group: 'operations',
    allOf: ['claims.analytics.read'],
    maturity: 'ready',
    context: 'Analítica de siniestros R3 · Métricas agregadas sin elevar permisos de negocio',
  },
  {
    to: '/operator/customers',
    label: 'Clientes',
    glyph: '◎',
    group: 'portfolio',
    allOf: ['customers.read'],
    maturity: 'ready',
    context: 'Cliente 360 R3 · Relaciones autoritativas y solo lectura',
  },
  {
    to: '/operator/policies',
    label: 'Pólizas',
    glyph: '▤',
    group: 'portfolio',
    allOf: ['policies.read'],
    maturity: 'ready',
    context: 'Póliza 360 R3 · Referencias modernas y legacy',
  },
  {
    to: '/operator/renewals',
    label: 'Renovaciones',
    glyph: '↻',
    group: 'portfolio',
    allOf: ['renewals.read'],
    maturity: 'ready',
    context: 'Renovaciones R3 · Ciclo de vida y pipeline operativo con control de versión',
  },
  {
    to: '/operator/collections',
    label: 'Cobranzas',
    glyph: '¤',
    group: 'portfolio',
    allOf: ['collections.read'],
    maturity: 'ready',
    context: 'Cobranzas R3 · Ciclo de vida, pago verificado y pipeline separados',
  },
  {
    to: '/operator/admin/pipelines',
    label: 'Pipelines',
    glyph: '⌘',
    group: 'administration',
    allOf: ['pipelines.admin'],
    maturity: 'ready',
    context: 'Administración de pipelines R3 · Versiones inmutables y activación gobernada',
  },
  {
    to: '/operator/admin/communication-templates',
    label: 'Plantillas',
    glyph: '✉',
    group: 'administration',
    allOf: ['communications.admin'],
    maturity: 'ready',
    context: 'Plantillas de comunicación R3 · Contenido versionado y activación gobernada',
  },
  {
    to: '/operator/admin/custom-fields',
    label: 'Campos',
    glyph: '⊞',
    group: 'administration',
    allOf: ['custom_fields.admin'],
    maturity: 'ready',
    context: 'Campos personalizados R3 · Proyecciones extendidas con versionado y límites de dominio',
  },
  {
    to: '/operator/admin/guidance',
    label: 'Orientación',
    glyph: '◈',
    group: 'administration',
    allOf: ['guidance.admin'],
    maturity: 'ready',
    context: 'Administración de orientación R3 · Contenido versionado sin semántica inventada',
  },
  {
    to: '/operator/admin/automations',
    label: 'Automatizaciones',
    glyph: '⚙',
    group: 'administration',
    allOf: ['automations.admin'],
    maturity: 'ready',
    context: 'Administración de automatizaciones R3 · Reglas versionadas con disparadores y acciones permitidas',
  },
  {
    to: '/operator/admin/imports',
    label: 'Importaciones',
    glyph: '⇧',
    group: 'administration',
    allOf: ['imports.execute'],
    maturity: 'ready',
    context: 'Importaciones gobernadas R3 · Vista previa, mapeo, validación, dry-run y commit gobernados',
  },
  {
    to: '/operator/admin/recovery',
    label: 'Recuperación',
    glyph: '↺',
    group: 'administration',
    allOf: ['operations.integration.read', 'operations.dead_letters.read'],
    maturity: 'ready',
    context: 'Operaciones de recuperación R3 · Integraciones y dead letters con acceso separado',
  },
] as const;

export const OPERATOR_WORKSPACE_GROUPS: readonly OperatorWorkspaceGroup[] = [
  {
    key: 'operations',
    label: 'Operación',
    description: 'El trabajo diario de clientes, pólizas, siniestros, renovaciones y cobranzas.',
  },
  {
    key: 'supervision',
    label: 'Supervisión',
    description: 'Visión agregada para seguimiento y control operacional.',
  },
  {
    key: 'platform',
    label: 'Configuración de plataforma',
    description: 'Herramientas administrativas productizadas para perfiles autorizados.',
  },
  {
    key: 'technical',
    label: 'Operación técnica',
    description: 'Importaciones, integraciones y recuperación operativa cuando alcanzan madurez visual.',
  },
] as const;

/*
 * Workspace presentation is intentionally declared beside the canonical navigation.
 * A card may summarize several related modules, but it cannot invent permissions or
 * readiness. navPaths are resolved back to OPERATOR_NAV_ITEMS at runtime.
 */
export const OPERATOR_WORKSPACE_CARDS: readonly OperatorWorkspaceCard[] = [
  {
    group: 'operations',
    kicker: 'Operación de siniestros',
    title: 'Siniestros y trabajo operativo',
    description: 'Revisa el tablero, los siniestros y las tareas que requieren atención.',
    navPaths: ['/operator/dashboard', '/operator/claims', '/operator/tasks'],
    href: '/operator/dashboard',
    action: 'Abrir operaciones',
    tone: 'cyan',
  },
  {
    group: 'operations',
    kicker: 'Cliente 360',
    title: 'Clientes y pólizas',
    description: 'Consulta la información disponible de clientes y sus pólizas asociadas.',
    navPaths: ['/operator/customers', '/operator/policies'],
    href: '/operator/customers',
    action: 'Abrir Cliente 360',
    tone: 'blue',
  },
  {
    group: 'operations',
    kicker: 'Ciclo de póliza',
    title: 'Renovaciones',
    description: 'Da seguimiento al ciclo operativo de renovación de pólizas.',
    navPaths: ['/operator/renewals'],
    href: '/operator/renewals',
    action: 'Abrir renovaciones',
    tone: 'violet',
  },
  {
    group: 'operations',
    kicker: 'Finanzas',
    title: 'Cobranzas',
    description: 'Consulta el estado de pago y el flujo operativo de cobranzas.',
    navPaths: ['/operator/collections'],
    href: '/operator/collections',
    action: 'Abrir cobranzas',
    tone: 'yellow',
  },
  {
    group: 'supervision',
    kicker: 'Analítica',
    title: 'Métricas operacionales',
    description: 'Consulta indicadores y distribuciones agregadas del trabajo operativo.',
    navPaths: ['/operator/analytics'],
    href: '/operator/analytics',
    action: 'Abrir analítica',
    tone: 'violet',
  },
  {
    group: 'platform',
    kicker: 'Pipelines',
    title: 'Administración de pipelines',
    description: 'Gestiona definiciones, versiones y activación de pipelines.',
    navPaths: ['/operator/admin/pipelines'],
    href: '/operator/admin/pipelines',
    action: 'Administrar pipelines',
    tone: 'yellow',
  },
  {
    group: 'platform',
    kicker: 'Comunicaciones',
    title: 'Plantillas de comunicación',
    description: 'Administra plantillas versionadas para los canales disponibles.',
    navPaths: ['/operator/admin/communication-templates'],
    href: '/operator/admin/communication-templates',
    action: 'Administrar plantillas',
    tone: 'green',
  },
  {
    group: 'platform',
    kicker: 'Configuración',
    title: 'Campos personalizados',
    description: 'Gestiona los campos configurables disponibles para cada dominio.',
    navPaths: ['/operator/admin/custom-fields'],
    href: '/operator/admin/custom-fields',
    action: 'Administrar campos',
    tone: 'blue',
  },
  {
    group: 'platform',
    kicker: 'Orientación',
    title: 'Orientación',
    description: 'Administra el contenido de orientación configurado en la plataforma.',
    navPaths: ['/operator/admin/guidance'],
    href: '/operator/admin/guidance',
    action: 'Administrar orientación',
    tone: 'green',
  },
  {
    group: 'platform',
    kicker: 'Reglas',
    title: 'Automatizaciones',
    description: 'Gestiona reglas versionadas, disparadores y acciones disponibles.',
    navPaths: ['/operator/admin/automations'],
    href: '/operator/admin/automations',
    action: 'Administrar automatizaciones',
    tone: 'violet',
  },
  {
    group: 'technical',
    kicker: 'Datos',
    title: 'Importaciones gobernadas',
    description: 'Carga, valida y confirma importaciones mediante el flujo disponible.',
    navPaths: ['/operator/admin/imports'],
    href: '/operator/admin/imports',
    action: 'Abrir importaciones',
    tone: 'yellow',
  },
  {
    group: 'technical',
    kicker: 'Recuperación',
    title: 'Integraciones y recuperación',
    description: 'Consulta integraciones y trabajos pendientes de recuperación operativa.',
    navPaths: ['/operator/admin/recovery'],
    href: '/operator/admin/recovery',
    action: 'Abrir recuperación',
    tone: 'blue',
  },
] as const;

export function operatorNavItemForPath(path: string): OperatorNavItem | undefined {
  return OPERATOR_NAV_ITEMS.find((item) => item.to === path);
}

export function operatorNavItemsForRole(role: StaffRole): readonly OperatorNavItem[] {
  return OPERATOR_NAV_ITEMS.filter((item) => !item.allOf || hasAllPermissions(role, item.allOf));
}

export function operatorNavItemCanLink(item: OperatorNavItem, role: StaffRole | undefined): boolean {
  if (item.maturity !== 'ready' || !role) return false;
  return !item.allOf || hasAllPermissions(role, item.allOf);
}

export function operatorWorkspaceCardCanLink(card: OperatorWorkspaceCard, role: StaffRole | undefined): boolean {
  if (!role || !card.navPaths.includes(card.href)) return false;
  return card.navPaths.every((path) => {
    const item = operatorNavItemForPath(path);
    return Boolean(item && operatorNavItemCanLink(item, role));
  });
}

export function operatorWorkspaceCardsForRole(role: StaffRole): readonly OperatorWorkspaceCard[] {
  return OPERATOR_WORKSPACE_CARDS.filter((card) => operatorWorkspaceCardCanLink(card, role));
}

export function operatorContextForPath(path: string): string {
  const item = OPERATOR_NAV_ITEMS.find((candidate) => (
    path === candidate.to || path.startsWith(`${candidate.to}/`)
  ));

  return item?.context ?? 'Espacio de trabajo protegido y consciente del rol';
}
