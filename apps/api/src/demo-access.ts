import type { ActorContext, OperatorRecord } from '@insurance/application';

export type PublicDemoPersona = 'operations' | 'supervision' | 'administration';
export type PublicDemoFixtureKind =
  | 'task'
  | 'customer'
  | 'policy'
  | 'renewal'
  | 'collection'
  | 'pipeline'
  | 'communicationTemplate'
  | 'customField'
  | 'automation'
  | 'importJob';

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
const PUBLIC_DEMO_PERSONA_BY_ID = new Map<string, PublicDemoPersona>(
  Object.entries(PUBLIC_DEMO_PERSONAS).map(([persona, operator]) => [operator.id, persona as PublicDemoPersona]),
);

export const PUBLIC_DEMO_CLAIMS = [
  { claimId: '94000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-PORTAL-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000001', trackingCode: 'SYN-QA-BULK-TRACK-001' },
  { claimId: 'd7000000-0000-4000-8000-000000000002', trackingCode: 'SYN-QA-BULK-TRACK-002' },
  { claimId: '86359138-f525-4820-931c-010b7246d3ab', trackingCode: 'IC-FUW5DaoFvfUvSmuxMwwID_Fe' },
] as const;

export const PUBLIC_DEMO_FIXTURES = {
  task: [
    'de100000-0000-4000-8000-000000000001',
    'de100000-0000-4000-8000-000000000002',
    'de100000-0000-4000-8000-000000000003',
  ],
  customer: [
    '91000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000001',
  ],
  policy: [
    '92000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001',
  ],
  renewal: ['a3000000-0000-4000-8000-000000000001'],
  collection: ['b3000000-0000-4000-8000-000000000001'],
  pipeline: [
    'a4000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001',
  ],
  communicationTemplate: [],
  customField: [],
  automation: [
    'a5000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000003',
    'a5000000-0000-4000-8000-000000000004',
    'a5000000-0000-4000-8000-000000000005',
    'a5000000-0000-4000-8000-000000000006',
  ],
  importJob: [
    'a6000000-0000-4000-8000-000000000001',
    'a6000000-0000-4000-8000-000000000002',
    'a6000000-0000-4000-8000-000000000003',
    'a6000000-0000-4000-8000-000000000004',
  ],
} as const satisfies Record<PublicDemoFixtureKind, readonly string[]>;

const PUBLIC_DEMO_CLAIM_IDS = new Set<string>(PUBLIC_DEMO_CLAIMS.map((claim) => claim.claimId));
const PUBLIC_DEMO_FIXTURE_IDS = Object.fromEntries(
  Object.entries(PUBLIC_DEMO_FIXTURES).map(([kind, ids]) => [kind, new Set<string>(ids)]),
) as Record<PublicDemoFixtureKind, Set<string>>;

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
  return typeof value === 'string' && PUBLIC_DEMO_CLAIM_IDS.has(value.toLowerCase());
}

export function isPublicDemoFixtureId(kind: PublicDemoFixtureKind, value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_DEMO_FIXTURE_IDS[kind].has(value.toLowerCase());
}

export function publicDemoFixtureIds(kind: PublicDemoFixtureKind): readonly string[] {
  return PUBLIC_DEMO_FIXTURES[kind];
}

export function scopePublicDemoPage<T>(
  items: readonly T[],
  kind: PublicDemoFixtureKind,
  idOf: (item: T) => string,
  page = 1,
  pageSize = 25,
) {
  const allowed = PUBLIC_DEMO_FIXTURE_IDS[kind];
  const scoped = items.filter((item) => allowed.has(idOf(item).toLowerCase()));
  const start = (page - 1) * pageSize;
  return {
    items: scoped.slice(start, start + pageSize),
    page,
    pageSize,
    totalItems: scoped.length,
    totalPages: scoped.length === 0 ? 0 : Math.ceil(scoped.length / pageSize),
  };
}

function allowsOperationalPersona(persona: PublicDemoPersona): boolean {
  return persona === 'operations' || persona === 'supervision';
}

function matchesGovernedDetail(path: string, prefix: string, kind: PublicDemoFixtureKind): boolean {
  const match = path.match(new RegExp(`^${prefix}/([0-9a-f-]{36})$`, 'i'));
  return Boolean(match?.[1] && isPublicDemoFixtureId(kind, match[1]));
}

function matchesGovernedChild(path: string, prefix: string, child: string, kind: PublicDemoFixtureKind): boolean {
  const match = path.match(new RegExp(`^${prefix}/([0-9a-f-]{36})/${child}$`, 'i'));
  return Boolean(match?.[1] && isPublicDemoFixtureId(kind, match[1]));
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

  if (allowsOperationalPersona(persona)) {
    if (path === '/api/v1/operator/tasks') return true;
    if (matchesGovernedDetail(path, '/api/v1/operator/tasks', 'task')) return true;
    if (path === '/api/v1/operator/customers') return true;
    if (matchesGovernedDetail(path, '/api/v1/operator/customers', 'customer')) return true;
    if (path === '/api/v1/operator/policies') return true;
    if (matchesGovernedDetail(path, '/api/v1/operator/policies', 'policy')) return true;
    if (path === '/api/v1/operator/renewals') return true;
    if (matchesGovernedDetail(path, '/api/v1/operator/renewals', 'renewal')) return true;
    if (path === '/api/v1/operator/collections') return true;
    if (matchesGovernedDetail(path, '/api/v1/operator/collections', 'collection')) return true;
  }

  if ((persona === 'supervision' || persona === 'administration') && path === '/api/v1/operator/analytics/claims') {
    return true;
  }

  if (persona === 'administration') {
    if (path === '/api/v1/admin/pipelines') return true;
    if (matchesGovernedDetail(path, '/api/v1/admin/pipelines', 'pipeline')) return true;
    if (path === '/api/v1/admin/communication-templates') return true;
    if (matchesGovernedDetail(path, '/api/v1/admin/communication-templates', 'communicationTemplate')) return true;
    if (path === '/api/v1/admin/custom-fields') return true;
    if (matchesGovernedDetail(path, '/api/v1/admin/custom-fields', 'customField')) return true;
    if (path === '/api/v1/admin/automations') return true;
    if (matchesGovernedDetail(path, '/api/v1/admin/automations', 'automation')) return true;
    if (path === '/api/v1/admin/import-jobs') return true;
    if (matchesGovernedDetail(path, '/api/v1/admin/import-jobs', 'importJob')) return true;
    if (matchesGovernedChild(path, '/api/v1/admin/import-jobs', 'rows', 'importJob')) return true;
  }

  return false;
}