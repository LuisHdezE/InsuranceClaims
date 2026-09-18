import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
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
  const brandDestination = demoReadOnly ? '/operator/claims' : '/operator/workspace';

  return (
    <div className="operator-shell operator-ops-shell r3-ui-shell">
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

        {children}
      </div>
    </div>
  );
}
