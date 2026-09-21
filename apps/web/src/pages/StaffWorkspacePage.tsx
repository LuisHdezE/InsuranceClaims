import { Link } from 'react-router-dom';
import { STAFF_ROLE_LABELS } from '../auth/staff-access';
import { OperatorShell } from '../components/OperatorShell';
import { isPublicDemoOperator, isPublicDemoPath } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import {
  OPERATOR_WORKSPACE_GROUPS,
  operatorWorkspaceCardsForRole,
} from '../operator-navigation';
import '../r3-ui-increment-07.css';
import '../operator-workspace-polish.css';

export function StaffWorkspacePage() {
  const { session } = useOperatorSession();
  if (!session) return null;

  const role = session.operator.role;
  const publicDemo = isPublicDemoOperator(session.operator);
  const visibleCards = operatorWorkspaceCardsForRole(role).filter((card) => (
    !publicDemo || isPublicDemoPath(card.href, role)
  ));

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-workspace-main r3-increment-07-workspace operator-workspace-polish">
        <section className="r3-workspace-hero r3-workspace-launchpad-hero" aria-labelledby="workspace-title">
          <div className="r3-workspace-hero-copy">
            <span className="ops-kicker">InsuranceClaims · Centro de operaciones</span>
            <h1 id="workspace-title">Tu espacio de trabajo</h1>
            <p>
              Accede a las áreas autorizadas para tu rol que ya alcanzaron madurez de producto.
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
          {OPERATOR_WORKSPACE_GROUPS.map((group) => {
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
          <div><strong>Módulos habilitados</strong><span>Solo se enlazan áreas autorizadas y productizadas</span></div>
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
