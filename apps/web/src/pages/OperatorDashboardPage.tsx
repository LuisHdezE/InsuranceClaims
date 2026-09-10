import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { hasPermission } from '../auth/staff-access';
import { listClaims } from '../api/claims';
import { getClaimsOperationalMetrics } from '../api/claims-work';
import { listTasks } from '../api/tasks';
import type { ClaimTaskProjection } from '../api/task-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { taskTypeLabel } from '../components/task-presentation';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const WINDOW_OPTIONS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

export function OperatorDashboardPage() {
  const { session, signOut } = useOperatorSession();
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const canAnalytics = Boolean(session && hasPermission(session.operator.role, 'claims.analytics.read'));
  const window = useMemo(() => metricsWindow(windowDays), [windowDays]);

  const metricsQuery = useQuery({
    queryKey: ['operator', 'claims-operational-metrics', window.from, window.to],
    queryFn: () => getClaimsOperationalMetrics(window, session!.accessToken),
    enabled: Boolean(session) && canAnalytics,
  });
  const tasksQuery = useQuery({
    queryKey: ['operator', 'tasks', 'dashboard-open'],
    queryFn: () => listTasks({ page: 1, pageSize: 5, status: 'OPEN' }, session!.accessToken),
    enabled: Boolean(session),
  });
  const receivedQuery = useQuery({
    queryKey: ['operator', 'claims', 'dashboard-received'],
    queryFn: () => listClaims({ page: 1, pageSize: 6, status: 'RECEIVED', sort: 'createdAt:desc' }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = (metricsQuery.error ?? tasksQuery.error ?? receivedQuery.error) as ApiFailure | undefined;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;

  const metrics = metricsQuery.data?.data;
  const tasks = tasksQuery.data?.data.items ?? [];
  const received = receivedQuery.data?.data.items ?? [];
  const loading = tasksQuery.isLoading || receivedQuery.isLoading || (canAnalytics && metricsQuery.isLoading);
  const fetching = tasksQuery.isFetching || receivedQuery.isFetching || (canAnalytics && metricsQuery.isFetching);
  const maxStage = Math.max(1, ...(metrics?.claimsByOperationalStage.map((stage) => stage.count) ?? [1]));

  const refresh = async () => {
    if (canAnalytics) {
      await Promise.all([tasksQuery.refetch(), receivedQuery.refetch(), metricsQuery.refetch()]);
      return;
    }
    await Promise.all([tasksQuery.refetch(), receivedQuery.refetch()]);
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Operaciones</span>
            <h1>Dashboard</h1>
            <p>Claims y trabajo operativo derivados de las APIs autoritativas. Las métricas agregadas aparecen únicamente cuando R3 concede `claims.analytics.read`.</p>
          </div>
          <div className="r3-dashboard-heading-actions">
            {canAnalytics && (
              <label className="r3-window-control">
                <span>Ventana</span>
                <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value) as WindowDays)}>
                  {WINDOW_OPTIONS.map((days) => <option value={days} key={days}>Últimos {days} días</option>)}
                </select>
              </label>
            )}
            <button className="ops-refresh-button" type="button" disabled={fetching} onClick={() => void refresh()}>
              {fetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {loading && <div className="ops-panel ops-loading" role="status">Cargando panorama operacional…</div>}

        {canAnalytics && metrics ? (
          <>
            <section className="r3-metrics-provenance" aria-label="Procedencia de métricas">
              <div><span className="r3-live-dot" aria-hidden="true" /><strong>Métricas R3 autoritativas</strong><span>Generadas {formatDate(metrics.generatedAt)}</span></div>
              <div><strong>Ventana</strong><span>{formatDate(metrics.window.from)} → {formatDate(metrics.window.to)}</span><code>{metrics.window.semantics}</code></div>
            </section>

            <section className="ops-kpi-grid r3-canonical-kpis" aria-label="Resumen operacional canónico">
              <KpiCard label="Claims abiertos" value={metrics.openClaims} tone="blue" hint="Snapshot canónico no CLOSED" />
              <KpiCard label="Tareas abiertas" value={metrics.openTasks} tone="cyan" hint="ClaimTask OPEN" />
              <KpiCard label="Tareas vencidas" value={metrics.overdueTasks} tone="yellow" hint="OPEN con dueAt anterior a generatedAt" />
              <KpiCard label="Evidencia pendiente" value={metrics.evidencePendingReviewClaims} tone="violet" hint="Claims con EVIDENCE_REVIEW abierta" />
              <KpiCard label={`Reportados ${windowDays}d`} value={metrics.reportedInWindow} tone="navy" hint={`Ventana ${metrics.window.semantics}`} />
              <KpiCard label="Claims cerrados" value={metrics.closedClaims} tone="green" hint="Snapshot CLOSED" />
            </section>
          </>
        ) : !canAnalytics ? (
          <section className="r3-analytics-locked" aria-label="Métricas restringidas por permisos">
            <span className="r3-analytics-lock" aria-hidden="true">◇</span>
            <div><span className="ops-kicker">Permiso R3</span><h2>Métricas canónicas reservadas</h2><p>Tu rol operativo puede trabajar Claims y Tasks, pero el API reserva `claims.analytics.read` para perfiles autorizados. No sustituimos esa ausencia calculando KPIs aproximados en el navegador.</p></div>
          </section>
        ) : null}

        <section className="ops-dashboard-grid">
          <div className="ops-panel ops-stage-panel">
            <div className="ops-panel-heading">
              <div>
                <h2>Pipeline operacional</h2>
                <p>{metrics ? 'Distribución canónica por las etapas operacionales configuradas.' : 'La distribución agregada requiere permiso de analytics.'}</p>
              </div>
              <Link to="/operator/claims">Abrir Claims →</Link>
            </div>

            {metrics ? (
              metrics.claimsByOperationalStage.length === 0 ? (
                <div className="ops-compact-empty">No hay Claims proyectados en etapas operacionales.</div>
              ) : (
                <div className="ops-stage-chart r3-stage-chart" role="img" aria-label="Distribución de siniestros por etapa operacional canónica">
                  {metrics.claimsByOperationalStage.map((stage, index) => (
                    <div className="ops-stage-chart-item" key={stage.stageKey}>
                      <strong>{stage.count}</strong>
                      <div className="ops-stage-bar-track"><span className={`ops-stage-bar is-${stageTone(index)}`} style={{ height: `${Math.max(8, Math.round((stage.count / maxStage) * 100))}%` }} /></div>
                      <span title={stage.stageKey}>{stage.displayName}</span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="r3-stage-no-analytics"><strong>Sin agregación local</strong><span>Consulta Claims para ver la etapa operacional de cada registro individual.</span></div>
            )}
          </div>

          <div className="ops-panel ops-action-panel">
            <div className="ops-panel-heading">
              <div><h2>Requiere acción</h2><p>Tareas OPEN servidas por la API de trabajo operacional.</p></div>
              <Link to="/operator/tasks">Abrir Tasks →</Link>
            </div>
            {tasks.length === 0 ? <div className="ops-compact-empty">No hay tareas abiertas.</div> : <ul className="ops-action-list">{tasks.map((task) => <TaskActionItem task={task} key={task.taskId} />)}</ul>}
          </div>
        </section>

        <section className="ops-panel ops-activity-panel">
          <div className="ops-panel-heading">
            <div><h2>Reportados recientemente</h2><p>Vista rápida de Claims actualmente en RECEIVED, ordenados por creación.</p></div>
            <Link to="/operator/claims">Ver workspace →</Link>
          </div>
          {received.length === 0 ? <div className="ops-compact-empty">No hay siniestros en RECEIVED.</div> : (
            <div className="ops-activity-list">
              {received.map((claim) => (
                <Link className="ops-activity-row" to={`/operator/claims/${claim.claimId}`} key={claim.claimId}>
                  <span className="ops-activity-dot" aria-hidden="true" />
                  <strong>{claim.trackingCode}</strong>
                  <span>{claim.operationalStage?.displayName ?? 'Sin etapa operacional'}</span>
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
  return <article className="ops-kpi-card"><span className={`ops-kpi-icon is-${tone}`} aria-hidden="true">◆</span><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></article>;
}

function TaskActionItem({ task }: { task: ClaimTaskProjection }) {
  return (
    <li><Link to={`/operator/tasks/${task.taskId}`}><span className="ops-action-mark" aria-hidden="true">!</span><span className="ops-action-copy"><strong>{task.title}</strong><small>{task.trackingCode ?? task.claimId.slice(0, 8)} · {taskTypeLabel(task.type)}</small></span><span className={`ops-priority is-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Alta' : 'Normal'}</span><span aria-hidden="true">›</span></Link></li>
  );
}

function metricsWindow(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function stageTone(index: number) {
  return (['navy', 'cyan', 'yellow', 'green'] as const)[index % 4];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
