import { Link } from 'react-router-dom';
import {
  hasAllPermissions,
  STAFF_ROLE_LABELS,
  type StaffPermission,
} from '../auth/staff-access';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-07.css';

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
    description: 'Entradas concisas al trabajo operativo R3 realmente productizado para tu rol.',
  },
  {
    key: 'supervision',
    label: 'Supervisión',
    description: 'Lectura agregada y autoritativa, sin conceder acceso implícito a registros individuales.',
  },
  {
    key: 'platform',
    label: 'Configuración de plataforma',
    description: 'Definiciones y reglas administrables únicamente cuando el rol dispone de la capacidad correspondiente.',
  },
  {
    key: 'technical',
    label: 'Operación técnica',
    description: 'Herramientas gobernadas para importación, integraciones y recuperación operativa.',
  },
];

const WORKSPACE_CARDS: WorkspaceCard[] = [
  {
    group: 'operations',
    kicker: 'Operación de siniestros',
    title: 'Siniestros y trabajo operativo',
    description: 'Tablero operativo con Siniestros y Tareas respaldados por datos autoritativos.',
    permissions: ['claims.backoffice.read', 'claims.tasks.read'],
    href: '/operator/dashboard',
    action: 'Abrir operaciones',
    tone: 'cyan',
  },
  {
    group: 'operations',
    kicker: 'Cliente 360',
    title: 'Clientes y pólizas',
    description: 'Acceso R3 a clientes y pólizas cuando ambas capacidades de lectura están habilitadas.',
    permissions: ['customers.read', 'policies.read'],
    href: '/operator/customers',
    action: 'Abrir Cliente 360',
    tone: 'blue',
  },
  {
    group: 'operations',
    kicker: 'Ciclo de póliza',
    title: 'Renovaciones',
    description: 'Ciclo de vida y pipeline operativo de renovaciones gobernados por el contrato R3.',
    permissions: ['renewals.read'],
    href: '/operator/renewals',
    action: 'Abrir renovaciones',
    tone: 'violet',
  },
  {
    group: 'operations',
    kicker: 'Cobranzas',
    title: 'Cobranzas',
    description: 'Ciclo de vida, estado de pago y pipeline operativo presentados como estados independientes.',
    permissions: ['collections.read'],
    href: '/operator/collections',
    action: 'Abrir cobranzas',
    tone: 'yellow',
  },
  {
    group: 'supervision',
    kicker: 'Analítica',
    title: 'Métricas operacionales',
    description: 'KPIs, estados y etapas operacionales agregados desde el endpoint autoritativo de analítica.',
    permissions: ['claims.analytics.read'],
    href: '/operator/analytics',
    action: 'Abrir analítica',
    tone: 'violet',
  },
  {
    group: 'platform',
    kicker: 'Pipelines',
    title: 'Administración de pipelines',
    description: 'Definiciones, versiones y activación gobernada de pipelines.',
    permissions: ['pipelines.admin'],
    href: '/operator/admin/pipelines',
    action: 'Administrar pipelines',
    tone: 'yellow',
  },
  {
    group: 'platform',
    kicker: 'Comunicaciones',
    title: 'Plantillas de comunicación',
    description: 'Plantillas EMAIL/WHATSAPP versionadas y administradas por la capacidad de plataforma.',
    permissions: ['communications.admin'],
    href: '/operator/admin/communication-templates',
    action: 'Administrar plantillas',
    tone: 'green',
  },
  {
    group: 'platform',
    kicker: 'Campos personalizados',
    title: 'Campos personalizados',
    description: 'Campos versionados para CLAIM, RENEWAL y COLLECTION con límites de dominio explícitos.',
    permissions: ['custom_fields.admin'],
    href: '/operator/admin/custom-fields',
    action: 'Administrar campos',
    tone: 'blue',
  },
  {
    group: 'platform',
    kicker: 'Orientación',
    title: 'Orientación',
    description: 'Orientación configurada y versionada sin semántica adicional inventada por la UI.',
    permissions: ['guidance.admin'],
    href: '/operator/admin/guidance',
    action: 'Administrar orientación',
    tone: 'green',
  },
  {
    group: 'platform',
    kicker: 'Automatizaciones',
    title: 'Automatizaciones',
    description: 'Reglas versionadas con disparadores y acciones limitadas por el contrato R3.',
    permissions: ['automations.admin'],
    href: '/operator/admin/automations',
    action: 'Administrar automatizaciones',
    tone: 'violet',
  },
  {
    group: 'technical',
    kicker: 'Importaciones gobernadas',
    title: 'Importaciones gobernadas',
    description: 'Carga, vista previa, mapeo, validación, dry-run y commit mediante el flujo ya productizado.',
    permissions: ['imports.execute'],
    href: '/operator/admin/imports',
    action: 'Abrir importaciones',
    tone: 'yellow',
  },
  {
    group: 'technical',
    kicker: 'Recuperación',
    title: 'Integraciones y recuperación',
    description: 'Eventos de integración y trabajos en dead-letter con lectura y recuperación gobernadas por permisos explícitos.',
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
      <main className="operator-main ops-main r3-workspace-main r3-increment-07-workspace">
        <section className="r3-workspace-hero r3-workspace-launchpad-hero" aria-labelledby="workspace-title">
          <div className="r3-workspace-hero-copy">
            <span className="ops-kicker">Operaciones R3</span>
            <h1 id="workspace-title">Tu espacio de trabajo</h1>
            <p>
              Entrada compacta y consciente del rol a capacidades R3 realmente productizadas.
              La interfaz anticipa el acceso; la autorización efectiva continúa siendo responsabilidad del API.
            </p>
            <div className="r3-workspace-meta">
              <span className="r3-role-pill">{STAFF_ROLE_LABELS[role]}</span>
              <span>Capacidades visibles según autorización de presentación</span>
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
                  <h2 id={`workspace-group-${group.key}`}>{group.label}</h2>
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
                        <strong>{card.action} →</strong>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="r3-contract-strip" aria-label="Principios de acceso">
          <div><strong>Rol explícito</strong><span>{STAFF_ROLE_LABELS[role]}</span></div>
          <div><strong>API autoritativa</strong><span>La UI anticipa acceso, no lo concede</span></div>
          <div><strong>Solo producto disponible</strong><span>No se presentan capacidades sin una ruta utilizable</span></div>
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
