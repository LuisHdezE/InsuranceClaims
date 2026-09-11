import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClaimsOperationalMetrics } from '../api/claims-work';
import type { ClaimStatus, ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const WINDOW_OPTIONS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

const STATUS_ORDER: ClaimStatus[] = [
  'RECEIVED',
  'UNDER_REVIEW',
  'OBSERVED',
  'APPROVED',
  'IN_REPAIR',
  'CLOSED',
];

const STATUS_LABELS: Record<ClaimStatus, string> = {
  RECEIVED: 'Recibidos',
  UNDER_REVIEW: 'En revisión',
  OBSERVED: 'Observados',
  APPROVED: 'Aprobados',
  IN_REPAIR: 'En reparación',
  CLOSED: 'Cerrados',
};

export function OperatorAnalyticsPage() {
  const { session, signOut } = useOperatorSession();
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const window = useMemo(() => metricsWindow(windowDays), [windowDays]);

  const metricsQuery = useQuery({
    queryKey: ['operator', 'claims-analytics', window.from, window.to],
    queryFn: () => getClaimsOperationalMetrics(window, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = metricsQuery.error as ApiFailure | undefined;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;

  const metrics = metricsQuery.data?.data;
  const maxStatus = Math.max(1, ...(metrics ? STATUS_ORDER.map((status) => metrics.claimsByStatus[status]) : [1]));
  const maxStage = Math.max(1, ...(metrics?.claimsByOperationalStage.map((stage) => stage.count) ?? [1]));

  return (
    <OperatorShell>
      <main className="operator-main ops-main claims-analytics-main">
        <div className="ops-page-heading claims-analytics-heading">
          <div>
            <span className="ops-kicker">Claims Analytics</span>
            <h1>Métricas operacionales</h1>
            <p>
              Lectura agregada del endpoint R3 de Analytics. Esta vista no concede acceso a Claims individuales,
              Tasks ni mutaciones de negocio.
            </p>
          </div>
          <div className="claims-analytics-actions">
            <label className="r3-window-control">
              <span>Ventana</span>
              <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value) as WindowDays)}>
                {WINDOW_OPTIONS.map((days) => <option value={days} key={days}>Últimos {days} días</option>)}
              </select>
            </label>
            <button
              className="ops-refresh-button"
              type="button"
              disabled={metricsQuery.isFetching}
              onClick={() => void metricsQuery.refetch()}
            >
              {metricsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {metricsQuery.isLoading && <div className="ops-panel ops-loading" role="status">Cargando métricas autoritativas…</div>}

        {metrics && (
          <>
            <section className="r3-metrics-provenance claims-analytics-provenance" aria-label="Procedencia de métricas">
              <div>
                <span className="r3-live-dot" aria-hidden="true" />
                <strong>Respuesta R3 autoritativa</strong>
                <span>Generada {formatDate(metrics.generatedAt)}</span>
              </div>
              <div>
                <strong>Ventana</strong>
                <span>{formatDate(metrics.window.from)} → {formatDate(metrics.window.to)}</span>
                <code>{metrics.window.semantics}</code>
              </div>
            </section>

            <section className="claims-analytics-note" aria-label="Semántica de las métricas">
              <strong>Cómo leer este panel</strong>
              <p>
                <code>reportedInWindow</code> cuenta Claims creados dentro de {metrics.window.semantics}. Los demás conteos son
                snapshots calculados al <code>generatedAt</code>; la UI no los reinterpreta como totales de la ventana.
              </p>
            </section>

            <section className="ops-kpi-grid r3-canonical-kpis" aria-label="KPIs autoritativos">
              <KpiCard label="Claims abiertos" value={metrics.openClaims} tone="blue" hint="Snapshot no CLOSED" />
              <KpiCard label={`Reportados ${windowDays}d`} value={metrics.reportedInWindow} tone="navy" hint={`Creados en ${metrics.window.semantics}`} />
              <KpiCard label="Claims cerrados" value={metrics.closedClaims} tone="green" hint="Snapshot CLOSED" />
              <KpiCard label="Tareas abiertas" value={metrics.openTasks} tone="cyan" hint="ClaimTask OPEN" />
              <KpiCard label="Tareas vencidas" value={metrics.overdueTasks} tone="yellow" hint="OPEN vencidas al generatedAt" />
              <KpiCard label="Evidencia pendiente" value={metrics.evidencePendingReviewClaims} tone="violet" hint="Claims con EVIDENCE_REVIEW abierta" />
            </section>

            <section className="claims-analytics-grid">
              <article className="ops-panel claims-analytics-panel">
                <div className="ops-panel-heading">
                  <div>
                    <h2>Distribución por estado</h2>
                    <p>Conteos exactos del snapshot R3 por ClaimStatus.</p>
                  </div>
                </div>
                <div className="claims-analytics-bars">
                  {STATUS_ORDER.map((status) => {
                    const count = metrics.claimsByStatus[status];
                    return (
                      <div className="claims-analytics-bar-row" key={status}>
                        <div><strong>{STATUS_LABELS[status]}</strong><code>{status}</code></div>
                        <span className="claims-analytics-bar-track" aria-hidden="true">
                          <span style={{ width: `${Math.max(count > 0 ? 6 : 0, Math.round((count / maxStatus) * 100))}%` }} />
                        </span>
                        <strong>{count}</strong>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="ops-panel claims-analytics-panel">
                <div className="ops-panel-heading">
                  <div>
                    <h2>Etapas operacionales</h2>
                    <p>Distribución según la versión de pipeline actualmente proyectada por el servidor.</p>
                  </div>
                </div>
                {metrics.claimsByOperationalStage.length === 0 ? (
                  <div className="ops-compact-empty">No hay Claims proyectados en etapas operacionales.</div>
                ) : (
                  <div className="claims-analytics-bars">
                    {metrics.claimsByOperationalStage.map((stage) => (
                      <div className="claims-analytics-bar-row" key={stage.stageKey}>
                        <div><strong>{stage.displayName}</strong><code>{stage.stageKey}</code></div>
                        <span className="claims-analytics-bar-track" aria-hidden="true">
                          <span style={{ width: `${Math.max(6, Math.round((stage.count / maxStage) * 100))}%` }} />
                        </span>
                        <strong>{stage.count}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function KpiCard({ label, value, tone, hint }: { label: string; value: number; tone: string; hint: string }) {
  return (
    <article className="ops-kpi-card">
      <span className={`ops-kpi-icon is-${tone}`} aria-hidden="true">◆</span>
      <div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
    </article>
  );
}

function metricsWindow(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
