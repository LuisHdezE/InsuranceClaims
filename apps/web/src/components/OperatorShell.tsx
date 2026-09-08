import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../operator-shell-disclosure.css';

const navItems = [
  { to: '/operator/dashboard', label: 'Dashboard', glyph: '⌂' },
  { to: '/operator/claims', label: 'Claims', glyph: '▱' },
  { to: '/operator/tasks', label: 'Tasks', glyph: '☑' },
];

export function OperatorShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useOperatorSession();

  return (
    <div className="operator-shell operator-ops-shell">
      <aside className="ops-sidebar" aria-label="Navegación principal de Claims Operations">
        <Link className="ops-brand" to="/operator/dashboard" aria-label="Ir al dashboard de Claims Operations">
          <span className="ops-brand-name">FAR <strong>demo</strong></span>
          <span className="ops-brand-tagline">Personas. Procesos. Confianza.</span>
        </Link>

        <nav className="ops-nav">
          {navItems.map((item) => (
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
          <strong>Operaciones de Siniestros</strong>
          <span>Caso técnico no oficial · No oficial · Sin afiliación</span>
          <span>Datos exclusivamente sintéticos.</span>
        </div>
      </aside>

      <div className="ops-workspace">
        <header className="operator-header ops-topbar">
          <div className="ops-topbar-title">
            <strong>Claims Operations</strong>
            <span>Gestión operativa del caso técnico</span>
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
            <span className="operator-identity">{session?.operator.login}</span>
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
