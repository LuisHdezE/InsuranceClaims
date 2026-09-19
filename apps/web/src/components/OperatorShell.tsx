import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveStaffLandingRoute } from '../auth/staff-access';
import { isPublicDemoOperator } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { operatorContextForPath } from '../operator-navigation';
import { OperatorSidebar } from './OperatorSidebar';
import { OperatorTopbar } from './OperatorTopbar';
import '../operator-shell-disclosure.css';

export function OperatorShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { session, signOut } = useOperatorSession();
  const role = session?.operator.role;
  const demoReadOnly = isPublicDemoOperator(session?.operator);
  const topbarContext = operatorContextForPath(location.pathname);
  const brandDestination = role ? resolveStaffLandingRoute(role) : '/operator/workspace';

  return (
    <div className={`operator-shell operator-ops-shell r3-ui-shell${demoReadOnly ? ' is-public-demo-readonly' : ''}`}>
      <OperatorSidebar
        role={role}
        demoReadOnly={demoReadOnly}
        brandDestination={brandDestination}
      />

      <div className="ops-workspace r3-ui-workspace">
        <OperatorTopbar
          context={topbarContext}
          login={session?.operator.login}
          role={role}
          demoReadOnly={demoReadOnly}
          onSignOut={signOut}
        />

        {demoReadOnly && (
          <div className="ops-demo-readonly-banner" role="status">
            <strong>Demo pública · solo lectura</strong>
            <span>Puedes recorrer datos sintéticos gobernados. Las acciones que cambian estado o configuración están ocultas y el API rechaza cualquier escritura.</span>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}
