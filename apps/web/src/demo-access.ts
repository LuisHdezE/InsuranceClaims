import type { OperatorIdentity, StaffRole } from './api/types';
import { OPERATOR_NAV_ITEMS, operatorNavItemCanLink } from './operator-navigation';

export const PUBLIC_DEMO_OPERATOR_ID = '00000000-0000-4000-8000-000000000096';

export function isPublicDemoOperator(operator: Pick<OperatorIdentity, 'id'> | null | undefined): boolean {
  return operator?.id === PUBLIC_DEMO_OPERATOR_ID;
}

export function isPublicDemoPath(pathname: string, role: StaffRole): boolean {
  const item = OPERATOR_NAV_ITEMS.find((candidate) => (
    pathname === candidate.to || pathname.startsWith(`${candidate.to}/`)
  ));

  return Boolean(item && operatorNavItemCanLink(item, role));
}
