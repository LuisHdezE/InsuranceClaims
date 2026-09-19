import type { OperatorIdentity, StaffRole } from './api/types';
import { OPERATOR_NAV_ITEMS, operatorNavItemCanLink } from './operator-navigation';

export type DemoPersonaKey = 'operations' | 'supervision' | 'administration';

export const PUBLIC_DEMO_PERSONAS = {
  operations: {
    id: '00000000-0000-4000-8000-000000000096',
    login: 'demo.operator@eliasworks.invalid',
    role: 'CLAIMS_OPERATOR',
    label: 'Operations',
    description: 'Siniestros, tareas, clientes, pólizas, renovaciones y cobranzas.',
  },
  supervision: {
    id: '00000000-0000-4000-8000-000000000095',
    login: 'demo.supervisor@eliasworks.invalid',
    role: 'CLAIMS_SUPERVISOR',
    label: 'Supervision',
    description: 'Operaciones con capacidades reales de supervisión y analítica.',
  },
  administration: {
    id: '00000000-0000-4000-8000-000000000094',
    login: 'demo.admin@eliasworks.invalid',
    role: 'PLATFORM_ADMIN',
    label: 'Administration',
    description: 'Analítica y configuración de plataforma disponible en la demo.',
  },
} as const satisfies Record<
  DemoPersonaKey,
  { id: string; login: string; role: StaffRole; label: string; description: string }
>;

export const PUBLIC_DEMO_OPERATOR_ID = PUBLIC_DEMO_PERSONAS.operations.id;
export const DEMO_PERSONA_OPTIONS = Object.entries(PUBLIC_DEMO_PERSONAS).map(([key, persona]) => ({
  key: key as DemoPersonaKey,
  ...persona,
}));

const DEMO_PERSONA_BY_ID = new Map(
  DEMO_PERSONA_OPTIONS.map((persona) => [persona.id, persona.key]),
);

export function demoPersonaForOperator(
  operator: Pick<OperatorIdentity, 'id'> | null | undefined,
): DemoPersonaKey | null {
  return operator?.id ? DEMO_PERSONA_BY_ID.get(operator.id) ?? null : null;
}

export function isPublicDemoOperator(operator: Pick<OperatorIdentity, 'id'> | null | undefined): boolean {
  return demoPersonaForOperator(operator) !== null;
}

export function isPublicDemoPath(pathname: string, role: StaffRole): boolean {
  const item = OPERATOR_NAV_ITEMS.find((candidate) => (
    pathname === candidate.to || pathname.startsWith(`${candidate.to}/`)
  ));

  return Boolean(item && operatorNavItemCanLink(item, role));
}
