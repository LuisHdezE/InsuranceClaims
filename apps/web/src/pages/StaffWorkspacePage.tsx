import { Link } from 'react-router-dom';
import {
  hasAllPermissions,
  hasAnyPermission,
  permissionsForRole,
  STAFF_ROLE_LABELS,
  type StaffPermission,
} from '../auth/staff-access';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

type WorkspaceCard = {
  kicker: string;
  title: string;
  description: string;
  permissions: readonly StaffPermission[];
  href?: string;
  action?: string;
  tone: 'cyan' | 'blue' | 'violet' | 'yellow' | 'green';
};

const CARDS: WorkspaceCard[] = [
  {
    kicker: 'Claims Operations',
    title: 'Siniestros y trabajo operativo',
    description: 'Dashboard, Kanban/listado, detalle, evidencia, timeline y tareas con datos autoritativos.',
    permissions: ['claims.backoffice.read', 'claims.tasks.read'],
    href: '/operator/dashboard',
    action: 'Abrir operaciones',
    tone: 'cyan',
  },
  {
    kicker: 'Customer 360',
    title: 'Clientes y pólizas',
    description: 'Directorio y detalle R3 de clientes, pólizas, assets y Claims relacionados, sin enriquecer datos fuera del contrato.',
    permissions: ['customers.read', 'policies.read'],
    href: '/operator/customers',
    action: 'Abrir Customer 360',
    tone: 'blue',
  },
  {
    kicker: 'Policy Lifecycle',
    title: 'Renovaciones',
    description: 'Bandeja y detalle de renovaciones con lifecycle, cliente/póliza relacionada y pipeline operativo gobernado por versión.',
    permissions: ['renewals.read'],
    href: '/operator/renewals',
    action: 'Abrir renovaciones',
    tone: 'violet',
  },
  {
    kicker: 'Collections',
    title: 'Cobranzas',
    description: 'Casos de cobranza con lifecycle, estado de pago verificado por servidor y pipeline operativo tratados como estados independientes.',
    permissions: ['collections.read'],
    href: '/operator/collections',
    action: 'Abrir cobranzas',
    tone: 'yellow',
  },
  {
    kicker: 'Communications',
    title: 'Comunicaciones operativas',
    description: 'Historial y envío existen en R3, pero el catálogo de plantillas activas no está expuesto al rol operador. El flujo de envío completo sigue diferido.',
    permissions: ['communications.read', 'communications.send'],
    tone: 'green',
  },
  {
    kicker: 'Analytics',
    title: 'Métricas operacionales',
    description: 'R3 incluye métricas autoritativas. Este acceso se convertirá en dashboard analítico sin KPIs inventados.',
    permissions: ['claims.analytics.read'],
    tone: 'violet',
  },
  {
    kicker: 'Platform',
    title: 'Administración de pipelines',
    description: 'Definiciones, versiones DRAFT/ACTIVE/RETIRED, activación y enable/disable gobernados por optimistic concurrency.',
    permissions: ['pipelines.admin'],
    href: '/operator/admin/pipelines',
    action: 'Administrar pipelines',
    tone: 'yellow',
  },
  {
    kicker: 'Communications Admin',
    title: 'Plantillas de comunicación',
    description: 'Definiciones EMAIL/WHATSAPP con contenido versionado, variables tipadas, activación explícita y estado administrado.',
    permissions: ['communications.admin'],
    href: '/operator/admin/communication-templates',
    action: 'Administrar plantillas',
    tone: 'green',
  },
  {
    kicker: 'Platform Next',
    title: 'Configuración pendiente',
    description: 'Automatizaciones, guidance, custom fields e imports conservan API R3 y permanecen como próximos cortes de productización.',
    permissions: ['automations.admin', 'guidance.admin', 'custom_fields.admin', 'imports.execute'],
    tone: 'yellow',
  },
  {
    kicker: 'Recovery',
    title: 'Integraciones y recuperación',
    description: 'Consulta explícita de Integration Events y bandeja de dead letters con requeue/resolve gobernados por versión.',
    permissions: ['operations.integration.read', 'operations.dead_letters.read'],
    href: '/operator/admin/recovery',
    action: 'Abrir Recovery',
    tone: 'blue',
  },
];

export function StaffWorkspacePage() {
  const { session } = useOperatorSession();
  if (!session) return null;

  const role = session.operator.role;
  const grants = permissionsForRole(role);
  const visibleCards = CARDS.filter((card) => hasAnyPermission(role, card.permissions));

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-workspace-main">
        <section className="r3-workspace-hero" aria-labelledby="workspace-title">
          <div className="r3-workspace-hero-copy">
            <span className="ops-kicker">Insurance Operations R3</span>
            <h1 id="workspace-title">Tu espacio de trabajo</h1>
            <p>
              Una entrada única, consciente del rol, para las capacidades que el contrato R3 permite presentar.
              La autorización real continúa siendo responsabilidad del API.
            </p>
            <div className="r3-workspace-meta">
              <span className="r3-role-pill">{STAFF_ROLE_LABELS[role]}</span>
              <span>{grants.length} permisos de presentación sincronizados</span>
            </div>
          </div>
          <div className="r3-workspace-orbit" aria-hidden="true">
            <span className="r3-orbit-core">R3</span>
            <span className="r3-orbit-dot is-one" />
            <span className="r3-orbit-dot is-two" />
            <span className="r3-orbit-dot is-three" />
          </div>
        </section>

        <section className="r3-workspace-section" aria-labelledby="capabilities-title">
          <div className="r3-section-heading">
            <div>
              <span className="ops-kicker">Capacidades</span>
              <h2 id="capabilities-title">Lo que tu rol puede utilizar</h2>
            </div>
            <p>Las tarjetas sin enlace representan API disponible cuya UI aún no se ha productizado de forma íntegra.</p>
          </div>

          <div className="r3-capability-grid">
            {visibleCards.map((card) => {
              const fullyGranted = hasAllPermissions(role, card.permissions);
              const content = (
                <>
                  <span className={`r3-capability-icon is-${card.tone}`} aria-hidden="true">◆</span>
                  <div className="r3-capability-copy">
                    <span>{card.kicker}</span>
                    <h3>{card.title}</h3>
                    <p>{card.description}</p>
                  </div>
                  <div className="r3-capability-footer">
                    <span className={`r3-availability ${card.href && fullyGranted ? 'is-live' : 'is-planned'}`}>
                      {card.href && fullyGranted ? 'Disponible' : 'UI planificada'}
                    </span>
                    {card.href && fullyGranted && <strong>{card.action} →</strong>}
                  </div>
                </>
              );

              return card.href && fullyGranted ? (
                <Link className="r3-capability-card is-link" to={card.href} key={card.title}>{content}</Link>
              ) : (
                <article className="r3-capability-card" key={card.title}>{content}</article>
              );
            })}
          </div>
        </section>

        <section className="r3-contract-strip" aria-label="Principios de acceso">
          <div><strong>Rol explícito</strong><span>{role}</span></div>
          <div><strong>Sin superusuario implícito</strong><span>Platform Admin no hereda operación de negocio</span></div>
          <div><strong>API autoritativa</strong><span>La UI solo anticipa y explica acceso</span></div>
        </section>
      </main>
    </OperatorShell>
  );
}
