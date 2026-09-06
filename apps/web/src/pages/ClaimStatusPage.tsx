import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { trackClaim } from '../api/claims';
import type { ApiFailure, ClaimStatus } from '../api/types';
import { ApiErrorNotice } from '../components/ApiErrorNotice';
import { PublicShell } from '../components/PublicShell';
import { useTrackingFlow } from '../flow/TrackingFlowContext';

const statusLabels: Record<ClaimStatus, string> = {
  RECEIVED: 'Recibido',
  UNDER_REVIEW: 'En revisión',
  OBSERVED: 'Observado',
  APPROVED: 'Aprobado',
  IN_REPAIR: 'En reparación',
  CLOSED: 'Cerrado',
};

export function ClaimStatusPage() {
  const navigate = useNavigate();
  const tracking = useTrackingFlow();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tracking.state) throw new Error('No hay una prueba de seguimiento activa.');
      return trackClaim(tracking.state.proof);
    },
    onSuccess(result) {
      if (!tracking.state) return;
      tracking.setResult(tracking.state.proof, result.data, result.requestId);
    },
  });

  if (!tracking.state) return <Navigate to="/claims/track" replace />;

  const { result, requestId } = tracking.state;
  const failure = mutation.error as ApiFailure | null;
  const emptyTimeline = result.timeline.length === 0;
  const emptyNextSteps = result.nextSteps.length === 0;

  return (
    <PublicShell>
      <main className="flow-main">
        <div className="container-shell tracking-status-grid">
          <section className="flow-panel" aria-labelledby="claim-status-title">
            <span className="eyebrow">Estado del siniestro</span>
            <h1 id="claim-status-title">{statusLabels[result.status]}</h1>
            <p className="lead">Esta vista muestra únicamente la proyección pública autorizada por <code>trackClaim</code>. No expone auditoría ni información interna del backoffice.</p>

            {failure && <ApiErrorNotice failure={failure} />}

            <div className="status-hero-card" role="status" aria-live="polite">
              <div>
                <span className="status-kicker">Estado actual</span>
                <strong>{statusLabels[result.status]}</strong>
              </div>
              <span className="status-code">{result.status}</span>
            </div>

            <div className="review-card" style={{ marginTop: 20 }}>
              <dl>
                <dt>Código de seguimiento</dt><dd>{result.trackingCode}</dd>
                <dt>Vehículo</dt><dd>{result.summary.vehicleReference}</dd>
                <dt>Tipo de evento</dt><dd>{result.summary.eventType}</dd>
                <dt>Fecha del evento</dt><dd>{new Date(result.summary.occurredAt).toLocaleString('es-UY')}</dd>
              </dl>
            </div>

            <div className="form-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
                {mutation.isPending ? 'Actualizando…' : 'Actualizar estado'}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => { tracking.clear(); navigate('/claims/track'); }}>Nueva consulta</button>
            </div>
            {(mutation.data?.requestId ?? requestId) && <div className="request-id">Referencia técnica: {mutation.data?.requestId ?? requestId}</div>}
          </section>

          <aside className="tracking-timeline-panel" aria-labelledby="timeline-title">
            <div className="quick-card">
              <h2 id="timeline-title">Historial visible</h2>
              {emptyTimeline ? (
                <p className="empty-state" role="status">Aún no hay eventos públicos adicionales para mostrar.</p>
              ) : (
                <ol className="tracking-timeline">
                  {result.timeline.map((entry, index) => (
                    <li key={`${entry.status}-${entry.occurredAt}-${index}`}>
                      <span className="timeline-marker" aria-hidden="true" />
                      <div>
                        <strong>{statusLabels[entry.status]}</strong>
                        <span>{new Date(entry.occurredAt).toLocaleString('es-UY')}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="quick-card" style={{ marginTop: 16 }}>
              <h2>Próximos pasos</h2>
              {emptyNextSteps ? (
                <p className="empty-state">No hay próximos pasos públicos informados en este momento.</p>
              ) : (
                <ul className="next-steps">
                  {result.nextSteps.map((step) => <li key={step}>{step}</li>)}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
