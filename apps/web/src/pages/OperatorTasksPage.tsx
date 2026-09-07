import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { completeClaimTask, listTasks } from '../api/tasks';
import type { ClaimTaskProjection, ClaimTaskStatus, ClaimTaskType } from '../api/task-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { taskTypeLabel } from '../components/ClaimTasksPanel';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const TASK_TYPES: ClaimTaskType[] = [
  'CLAIM_REVIEW',
  'EVIDENCE_REVIEW',
  'MISSING_DOCUMENT_FOLLOWUP',
  'CUSTOMER_FOLLOWUP',
  'CLOSURE_REVIEW',
];

export function OperatorTasksPage() {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [status, setStatus] = useState<ClaimTaskStatus | ''>('OPEN');
  const [type, setType] = useState<ClaimTaskType | ''>('');
  const [search, setSearch] = useState('');
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const tasksQuery = useQuery({
    queryKey: ['operator', 'tasks', status || 'ALL', type || 'ALL_TYPES'],
    queryFn: () => listTasks({
      page: 1,
      pageSize: 100,
      status: status || undefined,
      type: type || undefined,
    }, session!.accessToken),
    enabled: Boolean(session),
  });

  const queryFailure = tasksQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const completeMutation = useMutation({
    mutationFn: (task: ClaimTaskProjection) => completeClaimTask(task.taskId, task.status, session!.accessToken),
    onSuccess: async () => {
      setFailure(null);
      await queryClient.invalidateQueries({ queryKey: ['operator', 'tasks'] });
    },
    onError: async (error) => {
      const next = error as ApiFailure;
      setFailure(next);
      if (next.problem?.status === 401) {
        signOut();
        return;
      }
      if (next.problem?.status === 409) await tasksQuery.refetch();
    },
  });

  const serverFilteredTasks = tasksQuery.data?.data.items ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase('es');
  const tasks = useMemo(() => serverFilteredTasks.filter((task) => {
    if (!normalizedSearch) return true;
    return [task.title, task.trackingCode, task.policyReference, task.vehicleReference, task.type]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('es').includes(normalizedSearch));
  }), [serverFilteredTasks, normalizedSearch]);

  if (!session) return null;

  const now = new Date();
  const todayKey = dateKey(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  const openCount = serverFilteredTasks.filter((task) => task.status === 'OPEN').length;
  const highCount = serverFilteredTasks.filter((task) => task.status === 'OPEN' && task.priority === 'HIGH').length;
  const dueToday = serverFilteredTasks.filter((task) => task.status === 'OPEN' && task.dueAt && dateKey(new Date(task.dueAt)) === todayKey).length;
  const completedThisWeek = serverFilteredTasks.filter((task) => task.status === 'COMPLETED' && task.completedAt && new Date(task.completedAt) >= weekStart).length;

  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Operaciones</span>
            <h1>Tareas operativas</h1>
            <p>Trabajo humano persistente ligado a Claims. Los estados, prioridades, vencimientos y cierres provienen del API protegido.</p>
          </div>
          <button className="ops-refresh-button" type="button" disabled={tasksQuery.isFetching} onClick={() => void tasksQuery.refetch()}>
            {tasksQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {failure && <OperatorApiErrorNotice failure={failure} />}
        {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}

        <section className="ops-task-kpis" aria-label="Resumen de tareas">
          <TaskKpi label="Abiertas" value={openCount} hint="Estado OPEN en el filtro actual" tone="blue" />
          <TaskKpi label="Prioridad alta" value={highCount} hint="Solo tareas HIGH abiertas" tone="red" />
          <TaskKpi label="Vencen hoy" value={dueToday} hint="Solo dueAt real" tone="yellow" />
          <TaskKpi label="Completadas 7d" value={completedThisWeek} hint="Cierre persistido" tone="green" />
        </section>

        <section className="ops-task-toolbar" aria-label="Filtros de tareas">
          <label>
            <span>Buscar</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Claim, póliza, vehículo o tarea" />
          </label>
          <label>
            <span>Estado</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as ClaimTaskStatus | '')}>
              <option value="">Todos</option>
              <option value="OPEN">Abiertas</option>
              <option value="COMPLETED">Completadas</option>
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={type} onChange={(event) => setType(event.target.value as ClaimTaskType | '')}>
              <option value="">Todos los tipos</option>
              {TASK_TYPES.map((taskType) => <option key={taskType} value={taskType}>{taskTypeLabel(taskType)}</option>)}
            </select>
          </label>
          <strong>{tasks.length} resultado(s)</strong>
        </section>

        <section className="ops-panel ops-task-workspace" aria-labelledby="task-list-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="task-list-title">Cola de trabajo</h2>
              <p>Completar una tarea registra trabajo operativo, pero nunca mueve el Claim de estado automáticamente.</p>
            </div>
          </div>

          {tasksQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando tareas…</div>
          ) : tasks.length === 0 ? (
            <div className="ops-compact-empty">No hay tareas que coincidan con los filtros actuales.</div>
          ) : (
            <div className="ops-task-table-wrap">
              <table className="ops-task-table">
                <thead>
                  <tr><th>Tarea</th><th>Claim</th><th>Póliza</th><th>Prioridad</th><th>Vencimiento</th><th>Estado</th><th>Acción</th></tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.taskId}>
                      <td data-label="Tarea"><strong>{task.title}</strong><small>{taskTypeLabel(task.type)}</small></td>
                      <td data-label="Claim"><Link to={`/operator/claims/${task.claimId}`}>{task.trackingCode ?? task.claimId.slice(0, 8)}</Link><small>{task.vehicleReference ?? '—'}</small></td>
                      <td data-label="Póliza">{task.policyReference ?? '—'}</td>
                      <td data-label="Prioridad"><span className={`ops-priority is-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Alta' : 'Normal'}</span></td>
                      <td data-label="Vencimiento">{task.dueAt ? formatDate(task.dueAt) : 'Sin vencimiento'}</td>
                      <td data-label="Estado"><span className={`ops-task-status is-${task.status.toLowerCase()}`}>{task.status === 'OPEN' ? 'Abierta' : 'Completada'}</span></td>
                      <td data-label="Acción">
                        {task.status === 'OPEN' ? (
                          <button
                            type="button"
                            disabled={completeMutation.isPending}
                            onClick={() => {
                              setFailure(null);
                              completeMutation.mutate(task);
                            }}
                          >
                            {completeMutation.isPending && completeMutation.variables?.taskId === task.taskId ? 'Completando…' : 'Completar'}
                          </button>
                        ) : <span className="ops-done-mark">✓ Hecho</span>}
                      </td>
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

function TaskKpi({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return <article className="ops-task-kpi"><span className={`is-${tone}`} aria-hidden="true">◆</span><div><small>{label}</small><strong>{value}</strong><p>{hint}</p></div></article>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function dateKey(value: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
