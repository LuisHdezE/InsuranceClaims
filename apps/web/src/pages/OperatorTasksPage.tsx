import { Link } from 'react-router-dom';
import { OperatorShell } from '../components/OperatorShell';

export function OperatorTasksPage() {
  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Próximo corte funcional</span>
            <h1>Tareas operativas</h1>
            <p>El workspace visual está reservado, pero las tareas todavía no se simulan en cliente: primero se implementará el contrato persistente ClaimTask en Domain/Application/API/PostgreSQL.</p>
          </div>
          <Link className="ops-refresh-button" to="/operator/claims">Volver a Claims</Link>
        </div>

        <section className="ops-task-coming-soon" aria-labelledby="tasks-next-title">
          <div className="ops-task-coming-icon" aria-hidden="true">✓</div>
          <div>
            <span className="ops-kicker">Sin datos inventados</span>
            <h2 id="tasks-next-title">ClaimTask será una capacidad real, no una maqueta funcional</h2>
            <p>
              Este incremento añadirá tareas persistentes ligadas al siniestro, con tipo, estado, prioridad,
              responsable y vencimiento cuando el contrato de dominio esté aprobado. Completar una tarea no
              cambiará automáticamente el estado del Claim.
            </p>
            <div className="ops-task-type-list" aria-label="Familias de tareas previstas">
              <span>Revisión de siniestro</span>
              <span>Revisión de evidencia</span>
              <span>Seguimiento documental</span>
              <span>Seguimiento al cliente</span>
              <span>Revisión de cierre</span>
            </div>
          </div>
        </section>
      </main>
    </OperatorShell>
  );
}
