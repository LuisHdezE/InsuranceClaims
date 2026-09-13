import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  hasAllPermissions,
  STAFF_ROLE_LABELS,
  type StaffPermission,
} from '../auth/staff-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../operator-shell-disclosure.css';

type NavGroup = 'operations' | 'portfolio' | 'administration';

type NavItem = {
  to: string;
  label: string;
  glyph: string;
  group: NavGroup;
  allOf?: readonly StaffPermission[];
};

const navGroups: Array<{ key: NavGroup; label: string }> = [
  { key: 'operations', label: 'Operación' },
  { key: 'portfolio', label: 'Clientes y pólizas' },
  { key: 'administration', label: 'Administración' },
];

const navItems: NavItem[] = [
  { to: '/operator/workspace', label: 'Espacio de trabajo', glyph: '◇', group: 'operations' },
  {
    to: '/operator/dashboard',
    label: 'Tablero',
    glyph: '⌂',
    group: 'operations',
    allOf: ['claims.backoffice.read', 'claims.tasks.read'],
  },
  { to: '/operator/analytics', label: 'Analítica', glyph: '◫', group: 'operations', allOf: ['claims.analytics.read'] },
  { to: '/operator/claims', label: 'Siniestros', glyph: '▱', group: 'operations', allOf: ['claims.backoffice.read'] },
  { to: '/operator/tasks', label: 'Tareas', glyph: '☑', group: 'operations', allOf: ['claims.tasks.read'] },
  { to: '/operator/customers', label: 'Clientes', glyph: '◎', group: 'portfolio', allOf: ['customers.read'] },
  { to: '/operator/policies', label: 'Pólizas', glyph: '▤', group: 'portfolio', allOf: ['policies.read'] },
  { to: '/operator/renewals', label: 'Renovaciones', glyph: '↻', group: 'portfolio', allOf: ['renewals.read'] },
  { to: '/operator/collections', label: 'Cobranzas', glyph: '¤', group: 'portfolio', allOf: ['collections.read'] },
  { to: '/operator/admin/pipelines', label: 'Pipelines', glyph: '⌘', group: 'administration', allOf: ['pipelines.admin'] },
  { to: '/operator/admin/communication-templates', label: 'Plantillas', glyph: '✉', group: 'administration', allOf: ['communications.admin'] },
  { to: '/operator/admin/custom-fields', label: 'Campos', glyph: '⊞', group: 'administration', allOf: ['custom_fields.admin'] },
  { to: '/operator/admin/guidance', label: 'Orientación', glyph: '◈', group: 'administration', allOf: ['guidance.admin'] },
  { to: '/operator/admin/automations', label: 'Automatizaciones', glyph: '⚙', group: 'administration', allOf: ['automations.admin'] },
  { to: '/operator/admin/imports', label: 'Importaciones', glyph: '⇧', group: 'administration', allOf: ['imports.execute'] },
  { to: '/operator/admin/recovery', label: 'Recuperación', glyph: '↺', group: 'administration', allOf: ['operations.integration.read', 'operations.dead_letters.read'] },
];

export function OperatorShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, signOut } = useOperatorSession();
  const role = session?.operator.role;
  const visibleNavItems = role
    ? navItems.filter((item) => !item.allOf || hasAllPermissions(role, item.allOf))
    : [];
  const topbarContext = contextForPath(location.pathname);

  return (
    <div className="operator-shell operator-ops-shell r3-ui-shell">
      <aside className="ops-sidebar r3-ui-sidebar" aria-label="Navegación principal del Centro de Operaciones">
        <Link className="ops-brand r3-ui-brand" to="/operator/workspace" aria-label="Ir al espacio de trabajo del Centro de Operaciones">
          <span className="r3-ui-brand-mark" aria-hidden="true">IC</span>
          <span className="r3-ui-brand-copy">
            <strong className="r3-ui-brand-name">InsuranceClaims</strong>
            <span className="r3-ui-brand-tagline">Centro de Operaciones</span>
          </span>
        </Link>

        <nav className="ops-nav r3-ui-nav">
          {navGroups.map((group) => {
            const items = visibleNavItems.filter((item) => item.group === group.key);
            if (items.length === 0) return null;

            return (
              <section className="r3-ui-nav-group" aria-labelledby={`r3-nav-${group.key}`} key={group.key}>
                <h2 id={`r3-nav-${group.key}`} className="r3-ui-nav-label">{group.label}</h2>
                <div className="r3-ui-nav-links">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `ops-nav-link${isActive ? ' is-active' : ''}`}
                    >
                      <span className="ops-nav-icon" aria-hidden="true">{item.glyph}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </section>
            );
          })}
        </nav>

        <div className="ops-sidebar-footer r3-ui-sidebar-footer">
          <Link className="ops-public-link" to="/">Sitio público ↗</Link>
          <strong>Centro de Operaciones R3</strong>
          <span>Caso técnico no oficial · No oficial · Sin afiliación</span>
          <span>Datos exclusivamente sintéticos.</span>
        </div>
      </aside>

      <div className="ops-workspace r3-ui-workspace">
        <header className="operator-header ops-topbar r3-ui-topbar">
          <div className="ops-topbar-title r3-ui-topbar-title">
            <strong>Centro de Operaciones</strong>
            <span>{topbarContext}</span>
            <small className="ops-mobile-disclosure">
              Caso técnico no oficial · No oficial · Sin afiliación
              <br />
              Datos exclusivamente sintéticos.
            </small>
          </div>

          <label className="ops-global-search r3-ui-global-search">
            <span className="sr-only">Búsqueda global</span>
            <input type="search" placeholder="Búsqueda global · próximo corte" disabled />
          </label>

          <div className="ops-operator-area r3-ui-operator-area">
            <span className="ops-avatar" aria-hidden="true">{operatorInitials(session?.operator.login)}</span>
            <span className="r3-operator-copy">
              <strong className="operator-identity">{session?.operator.login}</strong>
              {role && <small className="r3-topbar-role">{STAFF_ROLE_LABELS[role]}</small>}
            </span>
            <button className="ops-signout" type="button" onClick={signOut}>Cerrar sesión</button>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}

function contextForPath(path: string) {
  if (path === '/operator/workspace') return 'Espacio de trabajo por rol · Solo capacidades autorizadas y productizadas';
  if (path === '/operator/dashboard') return 'Tablero de Operaciones R3 · Priorización del trabajo que requiere atención';
  if (path === '/operator/analytics') return 'Analítica de siniestros R3 · Métricas agregadas sin elevar permisos de negocio';
  if (path.startsWith('/operator/claims')) return 'Listado autoritativo del API · Espacio de siniestros protegido y consciente del rol';
  if (path.startsWith('/operator/tasks')) return 'Tareas R3 · Trabajo operativo independiente del ciclo de vida del siniestro';
  if (path.startsWith('/operator/customers')) return 'Cliente 360 R3 · Relaciones autoritativas y solo lectura';
  if (path.startsWith('/operator/policies')) return 'Póliza 360 R3 · Referencias modernas y legacy';
  if (path.startsWith('/operator/renewals')) return 'Renovaciones R3 · Ciclo de vida y pipeline operativo con control de versión';
  if (path.startsWith('/operator/collections')) return 'Cobranzas R3 · Ciclo de vida, pago verificado y pipeline separados';
  if (path.startsWith('/operator/admin/pipelines')) return 'Administración de pipelines R3 · Versiones inmutables y activación gobernada';
  if (path.startsWith('/operator/admin/communication-templates')) return 'Plantillas de comunicación R3 · Contenido versionado y activación gobernada';
  if (path.startsWith('/operator/admin/custom-fields')) return 'Campos personalizados R3 · Proyecciones extendidas con versionado y límites de dominio';
  if (path.startsWith('/operator/admin/guidance')) return 'Administración de orientación R3 · Contenido versionado sin semántica inventada';
  if (path.startsWith('/operator/admin/automations')) return 'Administración de automatizaciones R3 · Reglas versionadas con disparadores y acciones permitidas';
  if (path.startsWith('/operator/admin/imports')) return 'Importaciones gobernadas R3 · Vista previa, mapeo, validación, dry-run y commit gobernados';
  if (path.startsWith('/operator/admin/recovery')) return 'Operaciones de recuperación R3 · Integraciones y dead letters con acceso separado';
  return 'Espacio de trabajo protegido y consciente del rol';
}

function operatorInitials(login: string | undefined) {
  if (!login) return 'OP';
  const local = login.split('@')[0] ?? login;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'OP';
}
