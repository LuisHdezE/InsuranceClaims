import { Link } from 'react-router-dom';
import {
  hasAllPermissions,
  STAFF_ROLE_LABELS,
  type StaffPermission,
} from '../auth/staff-access';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-07.css';
import '../operator-workspace-polish.css';

type WorkspaceGroupKey = 'operations' | 'supervision' | 'platform' | 'technical';

type WorkspaceCard = {
  group: WorkspaceGroupKey;
  kicker: string;
  title: string;
  description: string;
  permissions: readonly StaffPermission[];
  href: string;
  action: string;
  tone: 'cyan' | 'blue' | 'violet' | 'yellow' | 'green';
};

const WORKSPACE_GROUPS: Array<{
  key: WorkspaceGroupKey;
  label: string;
  description: string;
}> = [
  {
    key: 'operations',
    label: 'Operación',
    description: 'El trabajo diario de clientes, pólizas, siniestros, renovaciones y cobranzas.',
  },
  {
    key: 'supervision',
    label: 'Supervisión',
    description: 'Visión agregada para seguimiento y control operacional.',
  },
  {
    key: 'platform',
    label: 'Configuración de plataforma',
    description: 'Herramientas administrativas disponibles para perfiles autorizados.',
  },
  {
    key: 'technical',
    label: 'Operación técnica',
    description: 'Importaciones, integraciones y recuperación operativa.',
  },
];

const WORKSPACE_CARDS: WorkspaceCard[] = [
  {
    group: 'operations',
    kicker: 'Operación de siniestros',
    title: 'Siniestros y trabajo operativo',
    description: 'Revisa el tablero, los siniestros y las tareas que requieren atención.',
    permissions: ['claims.backoffice.read', 'claims.tasks.read'],
    href: '/operator/dashboard',
    action: 'Abrir operaciones',
    tone: 'cyan',
  },
  {
    group: 'operations',
    kicker: 'Cliente 360',
    title: 'Clientes y pólizas',
    description: 'Consulta la información disponible de clientes y sus pólizas asociadas.',
    permissions: ['customers.read', 'policies.read'],
    href: '/operator/customers',
    action: 'Abrir Cliente 360',
    tone: 'blue',
  },
  {
    group: 'operations',
    kicker: 'Ciclo de póliza',
    title: 'Renovaciones',
    description: 'Da seguimiento al ciclo operativo de renovación de pólizas.',
    permissions: ['renewals.read'],
    href: '/operator/renewals',
    action: 'Abrir renovaciones',
    tone: 'violet',
  },
  {
    group: 'operations',
    kicker: 'Finanzas',
    title: 'Cobranzas',
    description: 'Consulta el estado de pago y el flujo operativo de cobranzas.',
    permissions: ['collections.read'],
    href: '/operator/collections',
    action: 'Abrir cobranzas',
    tone: 'yellow',
  },
  {
    group: 'supervision',
    kicker: 'Analítica',
    title: 'Métricas operacionales',
    description: 'Consulta indicadores y distribuciones agregadas del trabajo operativo.',
    permissions: ['claims.analytics.read'],
    href: '/operator/analytics',
    action: 'Abrir analítica',
    tone: 'violet',
  },
  {
    group: 'platform',
    kicker: 'Pipelines',
    title: 'Administración de pipelines',
    description: 'Gestiona definiciones, versiones y activación de pipelines.',
    permissions: ['pipelines.admin'],
    href: '/operator/admin/pipelines',
    action: 'Administrar pipelines',
    tone: 'yellow',
  },
  {
    group: 'platform',
    kicker: 'Comunicaciones',
    title: 'Plantillas de comunicación',
    description: 'Administra plantillas versionadas para los canales disponibles.',
    permissions: ['communications.admin'],
    href: '/operator/admin/communication-templates',
    action: 'Administrar plantillas',
    tone: 'green',
  },
  {
    group: 'platform',
    kicker: 'Configuración',
    title: 'Campos personalizados',
    description: 'Gestiona los campos configurables disponibles para cada dominio.',
    permissions: ['custom_fields.admin'],
    href: '/operator/admin/custom-fields',
    action: 'Administrar campos',
    tone: 'blue',
  },
  {
    group: 'platform',
    kicker: 'Orientación',
    title: 'Orientación',
    description: 'Administra el contenido de orientación configurado en la plataforma.',
    permissions: ['guidance.admin'],
    href: '/operator/admin/guidance',
    action: 'Administrar orientación',
    tone: 'green',
  },
  {
    group: 'platform',
    kicker: 'Reglas',
    title: 'Automatizaciones',
    description: 'Gestiona reglas versionadas, disparadores y acciones disponibles.',
    permissions: ['automations.admin'],
    href: '/operator/admin/automations',
    action: 'Administrar automatizaciones',
    tone: 'violet',
  },
  {
    group: 'technical',
    kicker: 'Datos',
    title: 'Importaciones gobernadas',
    description: 'Carga, valida y confirma importaciones mediante el flujo disponible.',
    permissions: ['imports.execute'],
    href: '/operator/admin/imports',
    action: 'Abrir importaciones',
    tone: 'yellow',
  },
  {
    group: 'technical',
    kicker: 'Recuperación',
    title: 'Integraciones y recuperación',
    description: 'Consulta integraciones y trabajos pendientes de recuperación operativa.',
    permissions: ['operations.integration.read', 'operations.dead_letters.read'],
    href: '/operator/admin/recovery',
    action: 'Abrir recuperación',
    tone: 'blue',
  },
];

export function StaffWorkspacePage() {
  const { session } = useOperatorSession();
  if (!session) return null;

  const role = session.operator.role;
  const visibleCards = WORKSPACE_CARDS.filter((card) => hasAllPermissions(role, card.permissions));

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-workspace-main r3-increment-07-workspace operator-workspace-polish">
        <section className="r3-workspace-hero r3-workspace-launchpad-hero" aria-labelledby="workspace-title">
          <div className="r3-workspace-hero-copy">
            <span className="ops-kicker">InsuranceClaims · Centro de operaciones</span>
            <h1 id="workspace-title">Tu espacio de trabajo</h1>
            <p>
              Accede a las áreas habilitadas para tu rol y continúa el trabajo desde un único punto.
            </p>
            <div className="r3-workspace-meta">
              <span className="r3-role-pill">{STAFF_ROLE_LABELS[role]}</span>
              <span>{visibleCards.length} {visibleCards.length === 1 ? 'módulo disponible' : 'módulos disponibles'}</span>
            </div>
          </div>
        </section>

        <div className="r3-workspace-role-note" role="note">
          {roleMessage(role)}
        </div>

        <div className="r3-workspace-groups" aria-label="Capacidades disponibles">
          {WORKSPACE_GROUPS.map((group) => {
            const cards = visibleCards.filter((card) => card.group === group.key);
            if (cards.length === 0) return null;

            return (
              <section className="r3-workspace-group" aria-labelledby={`workspace-group-${group.key}`} key={group.key}>
                <div className="r3-workspace-group-heading">
                  <div>
                    <span>{String(cards.length).padStart(2, '0')}</span>
                    <h2 id={`workspace-group-${group.key}`}>{group.label}</h2>
                  </div>
                  <p>{group.description}</p>
                </div>

                <div className="r3-capability-grid">
                  {cards.map((card) => (
                    <Link className="r3-capability-card is-link" to={card.href} key={card.title}>
                      <span className={`r3-capability-icon is-${card.tone}`} aria-hidden="true">◆</span>
                      <div className="r3-capability-copy">
                        <span>{card.kicker}</span>
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                      </div>
                      <div className="r3-capability-footer">
                        <strong>{card.action}</strong>
                        <span aria-hidden="true">→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="r3-contract-strip" aria-label="Principios de acceso">
          <div><strong>Acceso por rol</strong><span>{STAFF_ROLE_LABELS[role]}</span></div>
          <div><strong>Datos del sistema</strong><span>La información proviene de las APIs autorizadas</span></div>
          <div><strong>Módulos habilitados</strong><span>Solo se muestran áreas disponibles para tu perfil</span></div>
        </section>
      </main>
    </OperatorShell>
  );
}

function roleMessage(role: 'CLAIMS_OPERATOR' | 'CLAIMS_SUPERVISOR' | 'PLATFORM_ADMIN') {
  if (role === 'PLATFORM_ADMIN') {
    return 'Sin superusuario implícito: Administrador de plataforma no hereda acceso operativo a Siniestros, Tareas, Clientes, Pólizas, Renovaciones ni Cobranzas.';
  }
  if (role === 'CLAIMS_SUPERVISOR') {
    return 'La supervisión añade Analítica a las capacidades operativas autorizadas sin ampliar permisos de plataforma.';
  }
  return 'El rol operador recibe un acceso conciso al trabajo operativo productizado, sin Analítica ni administración de plataforma.';
}
