import type { ActorContext, OperatorRecord } from '@insurance/application';

export const PUBLIC_DEMO_OPERATOR = {
  id: '00000000-0000-4000-8000-000000000099',
  login: 'demo.operator@eliasworks.invalid',
  role: 'CLAIMS_OPERATOR',
} as const satisfies Pick<OperatorRecord, 'id' | 'login' | 'role'>;

export const PUBLIC_DEMO_ACCESS_HEADER = 'x-demo-read-only';

export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export function isPublicDemoOperator(actor: Pick<ActorContext, 'operatorId'> | undefined): boolean {
  return actor?.operatorId === PUBLIC_DEMO_OPERATOR.id;
}

export function isSafeReadOnlyMethod(method: unknown): boolean {
  return typeof method === 'string' && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}
