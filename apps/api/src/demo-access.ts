import type { ActorContext, OperatorRecord } from '@insurance/application';

export const PUBLIC_DEMO_OPERATORS = {
  operations: {
    id: '00000000-0000-4000-8000-000000000096',
    login: 'demo.operator@eliasworks.invalid',
    role: 'CLAIMS_OPERATOR',
  },
  supervision: {
    id: '00000000-0000-4000-8000-000000000097',
    login: 'demo.supervisor@eliasworks.invalid',
    role: 'CLAIMS_SUPERVISOR',
  },
  administration: {
    id: '00000000-0000-4000-8000-000000000098',
    login: 'demo.admin@eliasworks.invalid',
    role: 'PLATFORM_ADMIN',
  },
} as const satisfies Record<string, Pick<OperatorRecord, 'id' | 'login' | 'role'>>;

export type PublicDemoPersona = keyof typeof PUBLIC_DEMO_OPERATORS;
export type PublicDemoOperator = (typeof PUBLIC_DEMO_OPERATORS)[PublicDemoPersona];

// Backwards-compatible alias for the original public demo operator fixture.
export const PUBLIC_DEMO_OPERATOR = PUBLIC_DEMO_OPERATORS.operations;
export const PUBLIC_DEMO_ACCESS_HEADER = 'x-demo-read-only';

export const PUBLIC_DEMO_CLAIMS = [
  { claimId: '94000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-PORTAL-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-BULK-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000002', trackingCode: 'SYN-QA-BULK-TRACK-002' },
  { claimId: '86359138-f525-4820-931c-010b7246d3ab', trackingCode: 'IC-FUW5DaoFvfUvSmuxMwwID_Fe' },
] as const;

const PUBLIC_DEMO_CLAIM_IDS = new Set(PUBLIC_DEMO_CLAIMS.map((claim) => claim.claimId));
const PUBLIC_DEMO_OPERATOR_LIST = Object.values(PUBLIC_DEMO_OPERATORS);

const OPERATIONS_READ_PREFIXES = [
  '/api/v1/operator/tasks',
  '/api/v1/operator/customers',
  '/api/v1/operator/policies',
  '/api/v1/operator/renewals',
  '/api/v1/operator/collections',
] as const;

const ADMINISTRATION_READ_PREFIXES = [
  '/api/v1/operator/analytics',
  '/api/v1/admin/pipelines',
  '/api/v1/admin/communication-templates',
  '/api/v1/admin/custom-fields',
] as const;

export function isDemoModeEnabled(): boolean {
  return process.env.DEMO_MODE === 'true';
}

export function publicDemoOperatorForLogin(login: string): PublicDemoOperator | undefined {
  const normalizedLogin = login.trim().toLowerCase();
  return PUBLIC_DEMO_OPERATOR_LIST.find((operator) => operator.login === normalizedLogin);
}

export function publicDemoOperatorForActor(
  actor: Pick<ActorContext, 'operatorId'> | undefined,
): PublicDemoOperator | undefined {
  return PUBLIC_DEMO_OPERATOR_LIST.find((operator) => operator.id === actor?.operatorId);
}

export function isPublicDemoOperator(actor: Pick<ActorContext, 'operatorId'> | undefined): boolean {
  return Boolean(publicDemoOperatorForActor(actor));
}

export function isSafeReadOnlyMethod(method: unknown): boolean {
  return typeof method === 'string' && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function isPublicDemoClaimId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_DEMO_CLAIM_IDS.has(value.toLowerCase() as (typeof PUBLIC_DEMO_CLAIMS)[number]['claimId']);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function isAllowedPublicDemoClaimPath(path: string): boolean {
  if (path === '/api/v1/operator/claims') return true;

  const claimRoute = path.match(/^\/api\/v1\/operator\/claims\/([0-9a-f-]{36})(?:\/(?:timeline|evidence-attention|tasks|evidence\/[0-9a-f-]{36}))?$/i);
  return Boolean(claimRoute?.[1] && isPublicDemoClaimId(claimRoute[1]));
}

export function isAllowedPublicDemoReadPath(
  path: unknown,
  actor: Pick<ActorContext, 'operatorId'> | undefined,
): boolean {
  if (typeof path !== 'string') return false;
  const operator = publicDemoOperatorForActor(actor);
  if (!operator) return false;

  if (operator.role === 'CLAIMS_OPERATOR' || operator.role === 'CLAIMS_SUPERVISOR') {
    if (isAllowedPublicDemoClaimPath(path)) return true;
    if (OPERATIONS_READ_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix))) return true;
    if (operator.role === 'CLAIMS_SUPERVISOR' && pathMatchesPrefix(path, '/api/v1/operator/analytics')) return true;
    return false;
  }

  if (operator.role === 'PLATFORM_ADMIN') {
    return ADMINISTRATION_READ_PREFIXES.some((prefix) => pathMatchesPrefix(path, prefix));
  }

  return false;
}
