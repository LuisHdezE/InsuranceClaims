import type { OperatorIdentity } from './api/types';

export const PUBLIC_DEMO_OPERATOR_ID = '00000000-0000-4000-8000-000000000096';

export function isPublicDemoOperator(operator: Pick<OperatorIdentity, 'id'> | null | undefined): boolean {
  return operator?.id === PUBLIC_DEMO_OPERATOR_ID;
}

export function isPublicDemoPath(pathname: string): boolean {
  return pathname === '/operator/claims' || pathname.startsWith('/operator/claims/');
}
