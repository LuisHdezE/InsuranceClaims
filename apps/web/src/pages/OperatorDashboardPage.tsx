import { useEffect } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listClaims } from '../api/claims';
import type { ApiFailure, ClaimStatus, ClaimSummary } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const STATUS_ORDER: ClaimStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED'];

export function OperatorDashboardPage() {
  const { session, signOut } = useOperatorSession();

  const queries = useQueries({
    queries: STATUS_ORDER.map((status) => ({
      queryKey: ['operator', 'claims', 'dashboard-count', status],
      queryFn: () => listClaims({ page: 1, pageSize: 20, status }, session!.accessToken),
      enabled: Boolean(session),
    })),
  });

  const failure = queries.find((query) => query.error)?.error as ApiFailure | undefined;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;

  const counts = Object.fromEntries(
    STATUS_ORDER.map((status, index) => [status, queries[index]?.data?.data.totalItems ?? 0]),
  ) as Record<ClaimStatus, number>;

  const open = counts.RECEIVED + counts.UNDER_REVIEW + counts.OBSERVED + counts.APPROVED + counts.IN_REPAIR;
  const inManagement = counts.UNDER_REVIEW + counts.APPROVED + counts.IN_REPAIR;
  const stages = [
    { label: 'Reportados', value: counts.RECEIVED, tone: 'navy' },
    { label: 'En gestión', value: inManagement, tone: 'cyan' },
    { label: 'Requiere información', value: counts.OBSERVED, tone: 'yellow' },
    { label: 'Resueltos', value: counts.CLOSED, tone: 'green' },
  ] as const;
  const maxStage = Math.max(1, ...stages.map((stage) => stage.value));
  const observed = queries[2]?.data?.data.items ?? [];
  const received = queries[0]?.data?.data.items ?? [];
  const loading = queries.some((query) => query.isLoading);

  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Operaciones</span>
            <h1>Dashboard</h1>
            <p>Vista autoritativa del estado de los siniestros. Los valores se calculan desde la API, sin métricas decorativas.</p>
          </div>
          <button
            className="ops-refresh-button"
            type="button"
            disabled={queries.some((query) => query.isFetching)}
            onClick={() => void Promise.all(queries.map((query) => query.refetch()))}
          >
            {queries.some((query) => query.isFetching) ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {loading && <div className="ops-panel ops-loading" role="status">Cargando panorama operacional…</div>}

        <section className="ops-kpi-grid" aria-label="Resumen operacional">
          <KpiCard label="Abiertos" value={open} tone="blue" hint="Todos los estados no cerrados" />
          <KpiCard label="Reportados" value={counts.RECEIVED} tone="cyan" hint="Estado RECEIVED" />
          <KpiCard label="En gestión" value={inManagement} tone="violet" hint="Revisión, aprobados y reparación" />
          <KpiCard label="Requiere info" value={counts.OBSERVED} tone="yellow" hint="Estado OBSERVED" />
          <KpiCard label="Resueltos" value={counts.CLOSED} tone="green" hint="Estado CLOSED" />
        </section>

        <section className="ops-dashboard-grid">
          <div className="ops-panel ops-stage-panel">
            <div className="ops-panel-heading">
              <div>
                <h2>Siniestros por etapa</h2>
                <p>Proyección operacional sobre los seis estados autoritativos del Claim.</p>
              </div>
              <Link to="/operator/claims">Abrir Claims →</Link>
            </div>

            <div className="ops-stage-chart" role="img" aria-label="Distribución de siniestros por etapa operacional">
              {stages.map((stage) => (
                <div className="ops-stage-chart-item" key={stage.label}>
                  <strong>{stage.value}</strong>
                  <div className="ops-stage-bar-track">
                    <span
                      className={`ops-stage-bar is-${stage.tone}`}
                      style={{ height: `${Math.max(8, Math.round((stage.value / maxStage) * 100))}%` }}
                    />
                  </div>
                  <span>{stage.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ops-panel ops-action-panel">
            <div className="ops-panel-heading">
              <div>
                <h2>Requiere información</h2>
                <p>Siniestros OBSERVED que necesitan volver al flujo de revisión.</p>
              </div>
            </div>
            {observed.length === 0 ? (
              <div className="ops-compact-empty">No hay siniestros observados en esta página del API.</div>
            ) : (
              <ul className="ops-action-list">
                {observed.slice(0, 5).map((claim) => <ClaimActionItem claim={claim} key={claim.claimId} />)}
              </ul>
            )}
          </div>
        </section>

        <section className="ops-panel ops-activity-panel">
          <div className="ops-panel-heading">
            <div>
              <h2>Reportados</h2>
              <p>Vista rápida de siniestros actualmente en RECEIVED.</p>
            </div>
            <Link to="/operator/claims">Ver workspace →</Link>
          </div>
          {received.length === 0 ? (
            <div className="ops-compact-empty">No hay siniestros en RECEIVED.</div>
          ) : (
            <div className="ops-activity-list">
              {received.slice(0, 6).map((claim) => (
                <Link className="ops-activity-row" to={`/operator/claims/${claim.claimId}`} key={claim.claimId}>
                  <span className="ops-activity-dot" aria-hidden="true" />
                  <strong>{claim.trackingCode}</strong>
                  <span>{claim.policyReference}</span>
                  <span>{claim.vehicleReference}</span>
                  <time dateTime={claim.occurredAt}>{formatDate(claim.occurredAt)}</time>
                  <span aria-hidden="true">›</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </OperatorShell>
  );
}

function KpiCard({ label, value, tone, hint }: { label: string; value: number; tone: string; hint: string }) {
  return (
    <article className="ops-kpi-card">
      <span className={`ops-kpi-icon is-${tone}`} aria-hidden="true">◆</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function ClaimActionItem({ claim }: { claim: ClaimSummary }) {
  return (
    <li>
      <Link to={`/operator/claims/${claim.claimId}`}>
        <span className="ops-action-mark" aria-hidden="true">!</span>
        <span className="ops-action-copy">
          <strong>{claim.trackingCode}</strong>
          <small>{claim.policyReference} · {claim.vehicleReference}</small>
        </span>
        <span className="status-badge status-observed">Observado</span>
        <span aria-hidden="true">›</span>
      </Link>
    </li>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
