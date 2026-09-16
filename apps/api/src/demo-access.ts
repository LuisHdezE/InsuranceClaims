import type { ActorContext, OperatorRecord } from '@insurance/application';

export const PUBLIC_DEMO_OPERATOR = {
  id: '00000000-0000-4000-8000-000000000099',
  login: 'demo.operator@eliasworks.invalid',
  role: 'CLAIMS_OPERATOR',
} as const satisfies Pick<OperatorRecord, 'id' | 'login' | 'role'>;

export const PUBLIC_DEMO_ACCESS_HEADER = 'x-demo-read-only';

export const PUBLIC_DEMO_CLAIMS = [
  { claimId: '94000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-PORTAL-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-BULK-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000002', trackingCode: 'SYN-QA-BULK-TRACK-002' },
  { claimId: '86359138-f525-4820-931c-010b7246d3ab', trackingCode: 'IC-FUW5DaoFvfUvSmuxMwwID_Fe' },
] as const;

const PUBLIC_DEMO_CLAIM_IDS = new Set(PUBLIC_DEMO_CLAIMS.map((claim) => claim.claimId));

export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export function isPublicDemoOperator(actor: Pick<ActorContext, 'operatorId'> | undefined): boolean {
  return actor?.operatorId === PUBLIC_DEMO_OPERATOR.id;
}

export function isSafeReadOnlyMethod(method: unknown): boolean {
  return typeof method === 'string' && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function isPublicDemoClaimId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_DEMO_CLAIM_IDS.has(value.toLowerCase() as (typeof PUBLIC_DEMO_CLAIMS)[number]['claimId']);
}

export function isAllowedPublicDemoReadPath(path: unknown): boolean {
  if (typeof path !== 'string') return false;
  if (path === '/api/v1/operator/claims') return true;

  const claimRoute = path.match(/^\/api\/v1\/operator\/claims\/([0-9a-f-]{36})(?:\/(?:timeline|evidence-attention|tasks|evidence\/[0-9a-f-]{36}))?$/i);
  return Boolean(claimRoute?.[1] && isPublicDemoClaimId(claimRoute[1]));
}
