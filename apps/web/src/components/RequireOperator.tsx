import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function RequireOperator({ children }: { children: ReactNode }) {
  const { session } = useOperatorSession();
  const location = useLocation();
  if (!session) {
    return <Navigate to="/operator/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
