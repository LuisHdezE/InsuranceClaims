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
  { to: '/operator/claims', label: 'Claims', glyph: '▱', allOf: ['claims.backoffice.read'] },
  { to: '/operator/tasks', label: 'Tasks', glyph: '☑', allOf: ['claims.tasks.read'] },
];

export function OperatorShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, signOut } = useOperatorSession();
  const role = session?.operator.role;
  const visibleNavItems = role
    ? navItems.filter((item) => !item.allOf || hasAllPermissions(role, item.allOf))
    : [];
  const topbarContext = location.pathname === '/operator/claims'
    ? 'Listado autoritativo del API · Workspace protegido y consciente del rol'
    : 'Workspace protegido y consciente del rol';

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

function operatorInitials(login: string | undefined) {
  if (!login) return 'OP';
  const local = login.split('@')[0] ?? login;
  const parts = local.split(/[._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'OP';
}
