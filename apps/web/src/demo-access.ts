import type { OperatorIdentity, StaffRole } from './api/types';
import { OPERATOR_NAV_ITEMS, operatorNavItemCanLink } from './operator-navigation';

export const PUBLIC_DEMO_PERSONAS = {
  operations: {
    id: '00000000-0000-4000-8000-000000000096',
    login: 'demo.operator@eliasworks.invalid',
    role: 'CLAIMS_OPERATOR',
    label: 'Operación',
    description: 'Siniestros, tareas, clientes, pólizas, renovaciones y cobranzas.',
  },
  supervision: {
    id: '00000000-0000-4000-8000-000000000097',
    login: 'demo.supervisor@eliasworks.invalid',
    role: 'CLAIMS_SUPERVISOR',
    label: 'Supervisión',
    description: 'Operación completa más analítica agregada.',
  },
  administration: {
    id: '00000000-0000-4000-8000-000000000098',
    login: 'demo.admin@eliasworks.invalid',
    role: 'PLATFORM_ADMIN',
    label: 'Administración',
    description: 'Pipelines, plantillas y campos personalizados productizados.',
  },
} as const satisfies Record<string, {
  id: string;
  login: string;
  role: StaffRole;
  label: string;
  description: string;
}>;

export type PublicDemoPersona = keyof typeof PUBLIC_DEMO_PERSONAS;

const PUBLIC_DEMO_IDS = new Set(Object.values(PUBLIC_DEMO_PERSONAS).map((persona) => persona.id));

export function isPublicDemoOperator(operator: Pick<OperatorIdentity, 'id'> | null | undefined): boolean {
  return Boolean(operator?.id && PUBLIC_DEMO_IDS.has(operator.id));
}

export function publicDemoPersonaForOperator(
  operator: Pick<OperatorIdentity, 'id'> | null | undefined,
): PublicDemoPersona | null {
  if (!operator) return null;
  const match = Object.entries(PUBLIC_DEMO_PERSONAS).find(([, persona]) => persona.id === operator.id);
  return (match?.[0] as PublicDemoPersona | undefined) ?? null;
}

export function isPublicDemoPath(pathname: string, role: StaffRole): boolean {
  const item = OPERATOR_NAV_ITEMS.find((candidate) => (
    pathname === candidate.to || pathname.startsWith(`${candidate.to}/`)
  ));

  return Boolean(item && operatorNavItemCanLink(item, role));
}
