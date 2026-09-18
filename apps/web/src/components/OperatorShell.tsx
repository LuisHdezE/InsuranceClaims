import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { STAFF_ROLE_LABELS } from '../auth/staff-access';
import { isPublicDemoOperator } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { operatorContextForPath } from '../operator-navigation';
import { OperatorSidebar } from './OperatorSidebar';
import '../operator-shell-disclosure.css';

export function OperatorShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, signOut } = useOperatorSession();
  const role = session?.operator.role;
  const demoReadOnly = isPublicDemoOperator(session?.operator);
  const topbarContext = operatorContextForPath(location.pathname);
  const brandDestination = demoReadOnly ? '/operator/claims' : '/operator/workspace';

  return (
    <div className="operator-shell operator-ops-shell r3-ui-shell">
      <OperatorSidebar
        role={role}
        demoReadOnly={demoReadOnly}
        brandDestination={brandDestination}
      />

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
              {demoReadOnly && <small className="r3-topbar-role">Demo pública · solo lectura · fixtures gobernados</small>}
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
