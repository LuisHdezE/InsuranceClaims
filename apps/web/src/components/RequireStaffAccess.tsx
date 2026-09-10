import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { StaffPermission } from '../auth/staff-access';
import { hasAllPermissions } from '../auth/staff-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function RequireStaffAccess({
  children,
  allOf = [],
}: {
  children: ReactNode;
  allOf?: readonly StaffPermission[];
}) {
  const { session } = useOperatorSession();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/operator/login" replace state={{ from: location.pathname }} />;
  }

  if (allOf.length > 0 && !hasAllPermissions(session.operator.role, allOf)) {
    return <Navigate to="/operator/forbidden" replace state={{ from: location.pathname }} />;
  }

  return children;
}
