import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { hasPermission } from '../auth/staff-access';
import { listClaims } from '../api/claims';
import { getClaimsOperationalMetrics } from '../api/claims-work';
import { listTasks } from '../api/tasks';
import type { ClaimTaskProjection } from '../api/task-types';
import type { ApiFailure, ClaimStatus } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { taskTypeLabel } from '../components/task-presentation';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const WINDOW_OPTIONS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  RECEIVED: 'Recibidos',
  UNDER_REVIEW: 'En revisión',
  OBSERVED: 'Observados',
  APPROVED: 'Aprobados',
  IN_REPAIR: 'En reparación',
  CLOSED: 'Cerrados',
};

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
  const statusEntries = metrics
    ? (Object.entries(metrics.claimsByStatus) as Array<[ClaimStatus, number]>)
    : [];
  const maxStatus = Math.max(1, ...statusEntries.map(([, count]) => count));

  const refresh = async () => {
    if (canAnalytics) {
      await Promise.all([tasksQuery.refetch(), receivedQuery.refetch(), metricsQuery.refetch()]);
      return;
    }
    await Promise.all([tasksQuery.refetch(), receivedQuery.refetch()]);
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-ui-dashboard">
        <div className="ops-page-heading r3-ui-dashboard-heading">
          <div className="r3-ui-dashboard-intro">
            <span className="ops-kicker">Operaciones</span>
            <h1>Dashboard</h1>
            <p>Panorama operativo de Claims y Tasks servido por las APIs autoritativas. Las métricas agregadas solo aparecen cuando R3 concede <code>claims.analytics.read</code>.</p>
          </div>
          <div className="r3-dashboard-heading-actions r3-ui-dashboard-actions">
            {canAnalytics && (
              <label className="r3-window-control r3-ui-window-control">
                <span>Ventana</span>
                <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value) as WindowDays)}>
                  {WINDOW_OPTIONS.map((days) => <option value={days} key={days}>Últimos {days} días</option>)}
                </select>
              </label>
            )}
            <button className="ops-refresh-button r3-ui-refresh" type="button" disabled={fetching} onClick={() => void refresh()}>
              <span aria-hidden="true">↻</span>
              {fetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && (
          <section className="r3-ui-dashboard-alert" aria-label="Incidencia al actualizar el dashboard">
            <OperatorApiErrorNotice failure={failure} />
            <button className="r3-ui-inline-retry" type="button" disabled={fetching} onClick={() => void refresh()}>
              Reintentar consultas
            </button>
          </section>
        )}
        {loading && <div className="ops-panel ops-loading r3-ui-loading" role="status">Cargando panorama operacional…</div>}

        {canAnalytics && metrics ? (
          <>
            <section className="r3-metrics-provenance r3-ui-provenance" aria-label="Procedencia de métricas">
              <div className="r3-ui-provenance-item">
                <span className="r3-live-dot" aria-hidden="true" />
                <span><strong>Métricas R3 autoritativas</strong><small>Generadas {formatDate(metrics.generatedAt)}</small></span>
              </div>
              <div className="r3-ui-provenance-item is-window">
                <span><strong>Ventana</strong><small>{formatDate(metrics.window.from)} → {formatDate(metrics.window.to)}</small></span>
                <code>{metrics.window.semantics}</code>
              </div>
            </section>

            <section className="ops-kpi-grid r3-canonical-kpis r3-ui-kpi-grid" aria-label="Resumen operacional canónico">
              <KpiCard label="Claims abiertos" value={metrics.openClaims} tone="blue" hint="Snapshot canónico no CLOSED" glyph="▱" />
              <KpiCard label={`Reportados ${windowDays}d`} value={metrics.reportedInWindow} tone="navy" hint={`Ventana ${metrics.window.semantics}`} glyph="＋" />
              <KpiCard label="Claims cerrados" value={metrics.closedClaims} tone="green" hint="Snapshot CLOSED" glyph="✓" />
              <KpiCard label="Tareas abiertas" value={metrics.openTasks} tone="cyan" hint="ClaimTask OPEN" glyph="☑" />
              <KpiCard label="Tareas vencidas" value={metrics.overdueTasks} tone="yellow" hint="OPEN con vencimiento superado" glyph="!" />
              <KpiCard label="Evidencia pendiente" value={metrics.evidencePendingReviewClaims} tone="violet" hint="Claims con EVIDENCE_REVIEW abierta" glyph="◫" />
            </section>
          </>
        ) : !canAnalytics ? (
          <section className="r3-analytics-locked r3-ui-analytics-locked" aria-label="Métricas restringidas por permisos">
            <span className="r3-analytics-lock" aria-hidden="true">◇</span>
            <div>
              <span className="ops-kicker">Permiso R3</span>
              <h2>Métricas canónicas reservadas</h2>
              <p>Tu rol operativo puede trabajar Claims y Tasks, pero el API reserva <code>claims.analytics.read</code> para perfiles autorizados. No sustituimos esa ausencia calculando KPIs aproximados en el navegador.</p>
            </div>
          </section>
        ) : null}

        <section className="r3-ui-dashboard-grid">
          <div className="ops-panel r3-ui-panel r3-ui-status-panel">
            <PanelHeading
              eyebrow="Claims"
              title="Distribución por estado"
              description={metrics ? 'Snapshot canónico de estados de negocio.' : 'La distribución agregada requiere permiso de analytics.'}
              to="/operator/claims"
              linkLabel="Abrir Claims"
            />
            {metrics ? (
              statusEntries.length === 0 ? (
                <div className="ops-compact-empty">No hay Claims en el snapshot operacional.</div>
              ) : (
                <div className="r3-ui-status-list" aria-label="Distribución de Claims por estado">
                  {statusEntries.map(([status, count]) => (
                    <div className="r3-ui-status-row" key={status}>
                      <div className="r3-ui-status-copy">
                        <span className={`r3-ui-status-dot is-${statusTone(status)}`} aria-hidden="true" />
                        <span>{CLAIM_STATUS_LABELS[status]}</span>
                        <strong>{count}</strong>
                      </div>
                      <div className="r3-ui-status-track" aria-hidden="true">
                        <span className={`is-${statusTone(status)}`} style={{ width: `${Math.max(4, Math.round((count / maxStatus) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="r3-stage-no-analytics"><strong>Sin agregación local</strong><span>Consulta Claims para ver el estado de cada registro individual.</span></div>
            )}
          </div>

          <div className="ops-panel ops-action-panel r3-ui-panel r3-ui-action-panel">
            <PanelHeading
              eyebrow="Atención"
              title="Requiere acción"
              description="Tareas OPEN servidas por la API de trabajo operacional."
              to="/operator/tasks"
              linkLabel="Abrir Tasks"
            />
            {tasks.length === 0 ? (
              <div className="ops-compact-empty r3-ui-positive-empty"><span aria-hidden="true">✓</span>No hay tareas abiertas.</div>
            ) : (
              <ul className="ops-action-list r3-ui-action-list">{tasks.map((task) => <TaskActionItem task={task} key={task.taskId} />)}</ul>
            )}
          </div>
        </section>

        <section className="ops-panel ops-stage-panel r3-ui-panel r3-ui-stage-panel">
          <PanelHeading
            eyebrow="Pipeline"
            title="Etapas operacionales"
            description={metrics ? 'Distribución canónica por las etapas configuradas.' : 'La distribución agregada requiere permiso de analytics.'}
            to="/operator/claims"
            linkLabel="Abrir Claims"
          />

          {metrics ? (
            metrics.claimsByOperationalStage.length === 0 ? (
              <div className="ops-compact-empty">No hay Claims proyectados en etapas operacionales.</div>
            ) : (
              <div className="ops-stage-chart r3-stage-chart r3-ui-stage-chart" role="img" aria-label="Distribución de siniestros por etapa operacional canónica">
                {metrics.claimsByOperationalStage.map((stage, index) => (
                  <div className="ops-stage-chart-item r3-ui-stage-chart-item" key={stage.stageKey}>
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
        </section>

        <section className="ops-panel ops-activity-panel r3-ui-panel r3-ui-recent-panel">
          <PanelHeading
            eyebrow="Actividad"
            title="Reportados recientemente"
            description="Claims actualmente en RECEIVED, ordenados por creación."
            to="/operator/claims"
            linkLabel="Ver workspace"
          />
          {received.length === 0 ? (
            <div className="ops-compact-empty">No hay siniestros en RECEIVED.</div>
          ) : (
            <div className="r3-ui-table-wrap">
              <table className="r3-ui-recent-table">
                <thead>
                  <tr>
                    <th scope="col">Tracking</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Etapa</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col">Ocurrencia</th>
                    <th scope="col"><span className="sr-only">Abrir</span></th>
                  </tr>
                </thead>
                <tbody>
                  {received.map((claim) => (
                    <tr key={claim.claimId}>
                      <td><Link className="r3-ui-tracking-link" to={`/operator/claims/${claim.claimId}`}>{claim.trackingCode}</Link></td>
                      <td><span className={`r3-ui-status-badge is-${statusTone(claim.status)}`}>{CLAIM_STATUS_LABELS[claim.status]}</span></td>
                      <td><span className={`r3-stage-badge${claim.operationalStage ? '' : ' is-unassigned'}`}><span aria-hidden="true">●</span>{claim.operationalStage?.displayName ?? 'Sin etapa operacional'}</span></td>
                      <td>{claim.vehicleReference}</td>
                      <td><time dateTime={claim.occurredAt}>{formatDate(claim.occurredAt)}</time></td>
                      <td><Link className="r3-ui-row-action" to={`/operator/claims/${claim.claimId}`} aria-label={`Abrir Claim ${claim.trackingCode}`}>›</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </OperatorShell>
  );
}

function PanelHeading({ eyebrow, title, description, to, linkLabel }: {
  eyebrow: string;
  title: string;
  description: string;
  to: string;
  linkLabel: string;
}) {
  return (
    <div className="ops-panel-heading r3-ui-panel-heading">
      <div><span className="r3-ui-panel-eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p></div>
      <Link to={to}>{linkLabel} <span aria-hidden="true">→</span></Link>
    </div>
  );
}

function KpiCard({ label, value, tone, hint, glyph }: { label: string; value: number; tone: string; hint: string; glyph: string }) {
  return (
    <article className="ops-kpi-card r3-ui-kpi-card">
      <span className={`ops-kpi-icon is-${tone}`} aria-hidden="true">{glyph}</span>
      <div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
    </article>
  );
}

function TaskActionItem({ task }: { task: ClaimTaskProjection }) {
  return (
    <li>
      <Link to={`/operator/tasks/${task.taskId}`}>
        <span className="ops-action-mark" aria-hidden="true">•</span>
        <span className="ops-action-copy">
          <strong>{task.title}</strong>
          <small>{task.trackingCode ?? task.claimId.slice(0, 8)} · {taskTypeLabel(task.type)}{task.dueAt ? ` · Vence ${formatDate(task.dueAt)}` : ''}</small>
        </span>
        <span className={`ops-priority is-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Alta' : 'Normal'}</span>
        <span aria-hidden="true">›</span>
      </Link>
    </li>
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

function statusTone(status: ClaimStatus) {
  const tones: Record<ClaimStatus, string> = {
    RECEIVED: 'blue',
    UNDER_REVIEW: 'cyan',
    OBSERVED: 'yellow',
    APPROVED: 'green',
    IN_REPAIR: 'violet',
    CLOSED: 'slate',
  };
  return tones[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
