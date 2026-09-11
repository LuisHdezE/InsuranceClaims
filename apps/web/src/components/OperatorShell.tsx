import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  hasAllPermissions,
  STAFF_ROLE_LABELS,
  type StaffPermission,
} from '../auth/staff-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../operator-shell-disclosure.css';

type NavItem = {
  to: string;
  label: string;
  glyph: string;
  allOf?: readonly StaffPermission[];
};

const navItems: NavItem[] = [
  { to: '/operator/workspace', label: 'Workspace', glyph: '◇' },
  {
    to: '/operator/dashboard',
    label: 'Dashboard',
    glyph: '⌂',
    allOf: ['claims.backoffice.read', 'claims.tasks.read'],
  },
  { to: '/operator/analytics', label: 'Analytics', glyph: '◫', allOf: ['claims.analytics.read'] },
  { to: '/operator/claims', label: 'Claims', glyph: '▱', allOf: ['claims.backoffice.read'] },
  { to: '/operator/tasks', label: 'Tasks', glyph: '☑', allOf: ['claims.tasks.read'] },
  { to: '/operator/customers', label: 'Clientes', glyph: '◎', allOf: ['customers.read'] },
  { to: '/operator/policies', label: 'Pólizas', glyph: '▤', allOf: ['policies.read'] },
  { to: '/operator/renewals', label: 'Renovaciones', glyph: '↻', allOf: ['renewals.read'] },
  { to: '/operator/collections', label: 'Cobranzas', glyph: '¤', allOf: ['collections.read'] },
  { to: '/operator/admin/pipelines', label: 'Pipelines', glyph: '⌘', allOf: ['pipelines.admin'] },
  { to: '/operator/admin/communication-templates', label: 'Plantillas', glyph: '✉', allOf: ['communications.admin'] },
  { to: '/operator/admin/custom-fields', label: 'Campos', glyph: '⊞', allOf: ['custom_fields.admin'] },
  { to: '/operator/admin/recovery', label: 'Recovery', glyph: '↺', allOf: ['operations.integration.read', 'operations.dead_letters.read'] },
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
    <div className="operator-shell operator-ops-shell">
      <aside className="ops-sidebar" aria-label="Navegación principal de Insurance Operations">
        <Link className="ops-brand" to="/operator/workspace" aria-label="Ir al workspace de Insurance Operations">
          <span className="ops-brand-name">FAR <strong>demo</strong></span>
          <span className="ops-brand-tagline">Personas. Procesos. Confianza.</span>
        </Link>

        <nav className="ops-nav">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `ops-nav-link${isActive ? ' is-active' : ''}`}
            >
              <span className="ops-nav-icon" aria-hidden="true">{item.glyph}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="ops-sidebar-footer">
          <Link className="ops-public-link" to="/">Sitio público ↗</Link>
          <strong>Insurance Operations R3</strong>
          <span>Caso técnico no oficial · No oficial · Sin afiliación</span>
          <span>Datos exclusivamente sintéticos.</span>
        </div>
      </aside>

      <div className="ops-workspace">
        <header className="operator-header ops-topbar">
          <div className="ops-topbar-title">
            <strong>Insurance Operations</strong>
            <span>{topbarContext}</span>
            <small className="ops-mobile-disclosure">
              Caso técnico no oficial · No oficial · Sin afiliación
              <br />
              Datos exclusivamente sintéticos.
            </small>
          </div>

          <label className="ops-global-search">
            <span className="sr-only">Búsqueda global</span>
            <input type="search" placeholder="Búsqueda global · próximo corte" disabled />
          </label>

          <div className="ops-operator-area">
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
  if (path === '/operator/analytics') return 'Claims Analytics R3 · Métricas agregadas sin elevar permisos de negocio';
  if (path === '/operator/claims') return 'Listado autoritativo del API · Workspace protegido y consciente del rol';
  if (path.startsWith('/operator/customers')) return 'Customer 360 R3 · Relaciones autoritativas y read-only';
  if (path.startsWith('/operator/policies')) return 'Policy 360 R3 · Referencias modernas y legacy';
  if (path.startsWith('/operator/renewals')) return 'Renewals R3 · Lifecycle y pipeline operativo con control de versión';
  if (path.startsWith('/operator/collections')) return 'Collections R3 · Lifecycle, pago verificado y pipeline separados';
  if (path.startsWith('/operator/admin/pipelines')) return 'Pipeline Administration R3 · Versiones inmutables y activación gobernada';
  if (path.startsWith('/operator/admin/communication-templates')) return 'Communication Templates R3 · Contenido versionado y activación gobernada';
  if (path.startsWith('/operator/admin/custom-fields')) return 'Custom Fields R3 · Proyecciones extendidas con versionado y límites de dominio';
  if (path.startsWith('/operator/admin/recovery')) return 'Recovery Operations R3 · Integraciones y dead letters con acceso separado';
  return 'Workspace protegido y consciente del rol';
}

function operatorInitials(login: string | undefined) {
  if (!login) return 'OP';
  const local = login.split('@')[0] ?? login;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'OP';
}
