import { Link, useLocation } from 'react-router-dom';
import { STAFF_ROLE_LABELS } from '../auth/staff-access';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function StaffForbiddenPage() {
  const { session } = useOperatorSession();
  const location = useLocation();
  if (!session) return null;

  const requested = typeof location.state === 'object' && location.state && 'from' in location.state
    ? String((location.state as { from?: unknown }).from ?? '')
    : '';

  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <section className="r3-forbidden-card" aria-labelledby="forbidden-title">
          <span className="r3-forbidden-lock" aria-hidden="true">◇</span>
          <span className="ops-kicker">Acceso por permisos</span>
          <h1 id="forbidden-title">Este módulo no corresponde a tu rol</h1>
          <p>
            Estás autenticado como <strong>{STAFF_ROLE_LABELS[session.operator.role]}</strong>.
            La interfaz no eleva privilegios ni convierte Platform Admin en superoperador.
          </p>
          {requested && <small>Ruta solicitada: <code>{requested}</code></small>}
          <div className="r3-forbidden-actions">
            <Link className="ops-primary-action" to="/operator/workspace">Volver al workspace</Link>
            <Link className="ops-refresh-button" to="/">Ir al sitio público</Link>
          </div>
        </section>
      </main>
    </OperatorShell>
  );
}
