import type { ActorContext, OperatorRecord } from '@insurance/application';

export type PublicDemoPersona = 'operations' | 'supervision' | 'administration';

export const PUBLIC_DEMO_ACCESS_HEADER = 'x-demo-read-only';
export const PUBLIC_DEMO_PERSONA_HEADER = 'x-demo-persona';

export const PUBLIC_DEMO_PERSONAS = {
  operations: {
    id: '00000000-0000-4000-8000-000000000096',
    login: 'demo.operator@eliasworks.invalid',
    role: 'CLAIMS_OPERATOR',
  },
  supervision: {
    id: '00000000-0000-4000-8000-000000000095',
    login: 'demo.supervisor@eliasworks.invalid',
    role: 'CLAIMS_SUPERVISOR',
  },
  administration: {
    id: '00000000-0000-4000-8000-000000000094',
    login: 'demo.admin@eliasworks.invalid',
    role: 'PLATFORM_ADMIN',
  },
} as const satisfies Record<PublicDemoPersona, Pick<OperatorRecord, 'id' | 'login' | 'role'>>;

// Backward-compatible alias for the original public demo identity.
export const PUBLIC_DEMO_OPERATOR = PUBLIC_DEMO_PERSONAS.operations;

const PUBLIC_DEMO_OPERATORS = Object.values(PUBLIC_DEMO_PERSONAS);
const PUBLIC_DEMO_PERSONA_BY_ID = new Map(
  Object.entries(PUBLIC_DEMO_PERSONAS).map(([persona, operator]) => [operator.id, persona as PublicDemoPersona]),
);

export const PUBLIC_DEMO_CLAIMS = [
  { claimId: '94000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-PORTAL-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-BULK-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000002', trackingCode: 'SYN-QA-BULK-TRACK-002' },
  { claimId: '86359138-f525-4820-931c-010b7246d3ab', trackingCode: 'IC-FUW5DaoFvfUvSmuxMwwID_Fe' },
] as const;

const PUBLIC_DEMO_CLAIM_IDS = new Set(PUBLIC_DEMO_CLAIMS.map((claim) => claim.claimId));

const OPERATIONS_READ_PREFIXES = [
  '/api/v1/operator/tasks',
  '/api/v1/operator/customers',
  '/api/v1/operator/policies',
  '/api/v1/operator/renewals',
  '/api/v1/operator/collections',
] as const;

const SUPERVISION_READ_PREFIXES = [
  ...OPERATIONS_READ_PREFIXES,
  '/api/v1/operator/analytics',
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

export function parsePublicDemoPersona(value: unknown): PublicDemoPersona | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'operations' || normalized === 'supervision' || normalized === 'administration'
    ? normalized
    : null;
}

export function publicDemoOperatorForPersona(persona: PublicDemoPersona): (typeof PUBLIC_DEMO_PERSONAS)[PublicDemoPersona] {
  return PUBLIC_DEMO_PERSONAS[persona];
}

export function publicDemoPersonaForActor(
  actor: Pick<ActorContext, 'operatorId'> | undefined,
): PublicDemoPersona | null {
  return actor?.operatorId ? PUBLIC_DEMO_PERSONA_BY_ID.get(actor.operatorId) ?? null : null;
}

export function isPublicDemoOperator(actor: Pick<ActorContext, 'operatorId'> | undefined): boolean {
  return publicDemoPersonaForActor(actor) !== null;
}

export function isPublicDemoLogin(login: string): boolean {
  return PUBLIC_DEMO_OPERATORS.some((operator) => operator.login === login.toLowerCase());
}

export function isSafeReadOnlyMethod(method: unknown): boolean {
  return typeof method === 'string' && ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

export function isPublicDemoClaimId(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_DEMO_CLAIM_IDS.has(value.toLowerCase() as (typeof PUBLIC_DEMO_CLAIMS)[number]['claimId']);
}

export function isAllowedPublicDemoReadPath(
  path: unknown,
  actor: Pick<ActorContext, 'operatorId'> | undefined,
): boolean {
  if (typeof path !== 'string') return false;
  const persona = publicDemoPersonaForActor(actor);
  if (!persona) return false;

  if (path === '/api/v1/operator/claims') return persona !== 'administration';

  const claimRoute = path.match(/^\/api\/v1\/operator\/claims\/([0-9a-f-]{36})(?:\/(?:timeline|evidence-attention|tasks|evidence\/[0-9a-f-]{36}))?$/i);
  if (claimRoute?.[1]) {
    return persona !== 'administration' && isPublicDemoClaimId(claimRoute[1]);
  }

  const prefixes = persona === 'operations'
    ? OPERATIONS_READ_PREFIXES
    : persona === 'supervision'
      ? SUPERVISION_READ_PREFIXES
      : ADMINISTRATION_READ_PREFIXES;

  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
