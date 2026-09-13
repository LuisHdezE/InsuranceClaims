import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { hasPermission } from '../auth/staff-access';
import { completeClaimTask, listTasks, updateClaimTask } from '../api/tasks';
import type { ClaimTaskPriority, ClaimTaskProjection, ClaimTaskStatus, ClaimTaskType } from '../api/task-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { taskStatusLabel, taskTypeLabel } from '../components/task-presentation';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const TASK_TYPES: ClaimTaskType[] = ['CLAIM_REVIEW', 'EVIDENCE_REVIEW', 'MISSING_DOCUMENT_FOLLOWUP', 'CUSTOMER_FOLLOWUP', 'CLOSURE_REVIEW'];
type TaskScope = 'mine' | 'all' | 'overdue' | 'completed';

export function OperatorTasksPage() {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [scope, setScope] = useState<TaskScope>('mine');
  const [status, setStatus] = useState<ClaimTaskStatus | ''>('OPEN');
  const [type, setType] = useState<ClaimTaskType | ''>('');
  const [priority, setPriority] = useState<ClaimTaskPriority | ''>('');
  const [search, setSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const scopeStatus: ClaimTaskStatus | undefined = scope === 'overdue' ? 'OPEN' : scope === 'completed' ? 'COMPLETED' : status || undefined;
  const assignedOperatorId = scope === 'mine' ? session?.operator.id : undefined;
  const overdue = scope === 'overdue' ? true : undefined;

  const tasksQuery = useQuery({
    queryKey: ['operator', 'tasks', 'workspace', scope, scopeStatus ?? 'ALL', type || 'ALL_TYPES', priority || 'ALL_PRIORITIES', assignedOperatorId ?? 'ALL_OPERATORS'],
    queryFn: () => listTasks({
      page: 1,
      pageSize: 100,
      status: scopeStatus,
      type: type || undefined,
      priority: priority || undefined,
      assignedOperatorId,
      overdue,
    }, session!.accessToken),
    enabled: Boolean(session),
  });

  const mineCountQuery = useTaskCount(['mine'], {
    status: 'OPEN',
    assignedOperatorId: session?.operator.id,
  }, session?.accessToken);
  const allCountQuery = useTaskCount(['all'], {}, session?.accessToken);
  const overdueCountQuery = useTaskCount(['overdue'], { status: 'OPEN', overdue: true }, session?.accessToken);
  const completedCountQuery = useTaskCount(['completed'], { status: 'COMPLETED' }, session?.accessToken);

  const queryFailure = tasksQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const invalidateTasks = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['operator', 'tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['operator', 'claims-operational-metrics'] }),
    ]);
  };

  const completeMutation = useMutation({
    mutationFn: (task: ClaimTaskProjection) => completeClaimTask(task.taskId, 'OPEN', session!.accessToken),
    onSuccess: async () => {
      setFailure(null);
      await invalidateTasks();
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

  const assignToMeMutation = useMutation({
    mutationFn: (task: ClaimTaskProjection) => updateClaimTask(task.taskId, {
      expectedVersion: task.version,
      assignedOperatorId: session!.operator.id,
    }, session!.accessToken),
    onSuccess: async () => {
      setFailure(null);
      await invalidateTasks();
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
    return [task.title, task.description, task.trackingCode, task.policyReference, task.vehicleReference, taskTypeLabel(task.type)]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('es').includes(normalizedSearch));
  }), [serverFilteredTasks, normalizedSearch]);

  useEffect(() => {
    if (tasks.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !tasks.some((task) => task.taskId === selectedTaskId)) {
      setSelectedTaskId(tasks[0].taskId);
    }
  }, [tasks, selectedTaskId]);

  if (!session) return null;

  const selectedTask = tasks.find((task) => task.taskId === selectedTaskId) ?? null;
  const canManage = hasPermission(session.operator.role, 'claims.tasks.manage');
  const mutationBusy = completeMutation.isPending || assignToMeMutation.isPending;
  const totalItems = tasksQuery.data?.data.totalItems ?? 0;
  const hasFilters = Boolean(status !== 'OPEN' || type || priority || search);

  const selectScope = (nextScope: TaskScope) => {
    setScope(nextScope);
    if (nextScope === 'overdue') setStatus('OPEN');
    if (nextScope === 'completed') setStatus('COMPLETED');
    if (nextScope === 'mine' || nextScope === 'all') setStatus('OPEN');
  };

  const resetFilters = () => {
    setScope('mine');
    setStatus('OPEN');
    setType('');
    setPriority('');
    setSearch('');
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-task-workspace-page">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Operaciones</span>
            <h1>Tareas operativas</h1>
            <p>Prioriza y resuelve trabajo operativo sin confundir la Task con el estado del siniestro.</p>
          </div>
          <button className="ops-refresh-button" type="button" disabled={tasksQuery.isFetching} onClick={() => void tasksQuery.refetch()}>
            {tasksQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        {failure && <OperatorApiErrorNotice failure={failure} />}
        {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}

        <nav className="r3-task-scope-tabs" aria-label="Resumen de cola de tareas">
          <ScopeTab active={scope === 'mine'} label="Mis tareas" count={mineCountQuery.data?.data.totalItems} onClick={() => selectScope('mine')} />
          <ScopeTab active={scope === 'all'} label="Todas" count={allCountQuery.data?.data.totalItems} onClick={() => selectScope('all')} />
          <ScopeTab active={scope === 'overdue'} label="Vencidas" count={overdueCountQuery.data?.data.totalItems} onClick={() => selectScope('overdue')} />
          <ScopeTab active={scope === 'completed'} label="Completadas" count={completedCountQuery.data?.data.totalItems} onClick={() => selectScope('completed')} />
        </nav>

        <section className="r3-task-filter-strip" aria-label="Filtros de tareas">
          <label className="r3-task-search">
            <span>Buscar en resultados cargados</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Claim, póliza, vehículo o tarea" />
          </label>
          <label>
            <span>Estado</span>
            <select
              value={scope === 'overdue' ? 'OPEN' : scope === 'completed' ? 'COMPLETED' : status}
              disabled={scope === 'overdue' || scope === 'completed'}
              onChange={(event) => {
                setScope('all');
                setStatus(event.target.value as ClaimTaskStatus | '');
              }}
            >
              <option value="">Todos</option>
              <option value="OPEN">Abiertas</option>
              <option value="COMPLETED">Completadas</option>
              <option value="CANCELLED">Canceladas</option>
            </select>
          </label>
          <label>
            <span>Prioridad</span>
            <select value={priority} onChange={(event) => setPriority(event.target.value as ClaimTaskPriority | '')}>
              <option value="">Todas</option>
              <option value="HIGH">Alta</option>
              <option value="NORMAL">Normal</option>
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={type} onChange={(event) => setType(event.target.value as ClaimTaskType | '')}>
              <option value="">Todos los tipos</option>
              {TASK_TYPES.map((taskType) => <option key={taskType} value={taskType}>{taskTypeLabel(taskType)}</option>)}
            </select>
          </label>
          <div className="r3-task-filter-summary">
            <strong>Mostrando {tasks.length} de {totalItems}</strong>
            {(hasFilters || scope !== 'mine') && <button type="button" onClick={resetFilters}>Restablecer</button>}
          </div>
        </section>

        {tasksQuery.isLoading ? (
          <div className="ops-panel ops-compact-empty" role="status">Cargando tareas…</div>
        ) : tasks.length === 0 ? (
          <div className="ops-panel ops-compact-empty">No hay tareas que coincidan con la cola y los filtros actuales.</div>
        ) : (
          <section className="r3-task-master-detail" aria-label="Cola y detalle de tareas">
            <div className="ops-panel r3-task-queue-panel">
              <div className="ops-panel-heading">
                <div><h2>Cola de trabajo</h2><p>Selecciona una Task para gestionarla sin perder el contexto de la cola.</p></div>
              </div>
              <div className="r3-task-queue-list" role="list">
                {tasks.map((task) => (
                  <button
                    type="button"
                    role="listitem"
                    key={task.taskId}
                    className={`r3-task-queue-item ${selectedTaskId === task.taskId ? 'is-selected' : ''}`}
                    aria-pressed={selectedTaskId === task.taskId}
                    onClick={() => setSelectedTaskId(task.taskId)}
                  >
                    <span className="r3-task-queue-copy">
                      <strong>{task.title}</strong>
                      <small>{task.trackingCode ?? 'Claim sin código de seguimiento'} · {taskTypeLabel(task.type)}</small>
                    </span>
                    <span className={`ops-priority is-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Alta' : 'Normal'}</span>
                    <span className={`r3-task-due ${isOverdue(task) ? 'is-overdue' : ''}`}>{task.dueAt ? formatDate(task.dueAt) : 'Sin vencimiento'}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedTask && (
              <article className="ops-panel r3-task-inline-detail" aria-live="polite">
                <header className="r3-task-inline-header">
                  <div>
                    <span className="ops-kicker">Task seleccionada</span>
                    <h2>{selectedTask.title}</h2>
                    <p>{selectedTask.description ?? 'Sin descripción adicional.'}</p>
                  </div>
                  <span className={`ops-task-status is-${selectedTask.status.toLowerCase()}`}>{taskStatusLabel(selectedTask.status)}</span>
                </header>

                <dl className="r3-task-inline-facts">
                  <div><dt>Siniestro</dt><dd><Link to={`/operator/claims/${selectedTask.claimId}`}>{selectedTask.trackingCode ?? 'Abrir Claim'}</Link></dd></div>
                  <div><dt>Póliza</dt><dd>{selectedTask.policyReference ?? '—'}</dd></div>
                  <div><dt>Vehículo</dt><dd>{selectedTask.vehicleReference ?? '—'}</dd></div>
                  <div><dt>Tipo</dt><dd>{taskTypeLabel(selectedTask.type)}</dd></div>
                  <div><dt>Prioridad</dt><dd>{selectedTask.priority === 'HIGH' ? 'Alta' : 'Normal'}</dd></div>
                  <div><dt>Vencimiento</dt><dd className={isOverdue(selectedTask) ? 'is-overdue' : ''}>{selectedTask.dueAt ? formatDate(selectedTask.dueAt) : 'Sin vencimiento'}</dd></div>
                  <div><dt>Asignación</dt><dd>{assignmentLabel(selectedTask, session.operator.id)}</dd></div>
                  <div><dt>Cola</dt><dd>Siniestros</dd></div>
                </dl>

                <div className="r3-task-inline-actions">
                  <Link className="r3-secondary-action" to={`/operator/tasks/${selectedTask.taskId}`}>Abrir detalle</Link>
                  {canManage && selectedTask.status === 'OPEN' && selectedTask.assignedOperatorId !== session.operator.id && (
                    <button
                      type="button"
                      className="r3-secondary-action"
                      disabled={mutationBusy}
                      onClick={() => { setFailure(null); assignToMeMutation.mutate(selectedTask); }}
                    >
                      {assignToMeMutation.isPending ? 'Asignando…' : 'Asignarme'}
                    </button>
                  )}
                  {canManage && selectedTask.status === 'OPEN' && (
                    <button
                      type="button"
                      className="ops-primary-action"
                      disabled={mutationBusy}
                      onClick={() => { setFailure(null); completeMutation.mutate(selectedTask); }}
                    >
                      {completeMutation.isPending ? 'Completando…' : 'Completar tarea'}
                    </button>
                  )}
                </div>
                <p className="r3-task-domain-note">Completar o cancelar una Task no modifica automáticamente el estado del siniestro.</p>
              </article>
            )}
          </section>
        )}
      </main>
    </OperatorShell>
  );
}

function useTaskCount(
  key: string[],
  filters: { status?: ClaimTaskStatus; assignedOperatorId?: string; overdue?: boolean },
  accessToken?: string,
) {
  return useQuery({
    queryKey: ['operator', 'tasks', 'count', ...key, filters.status ?? 'ALL', filters.assignedOperatorId ?? 'ALL_OPERATORS', filters.overdue ?? false],
    queryFn: () => listTasks({ page: 1, pageSize: 1, ...filters }, accessToken!),
    enabled: Boolean(accessToken && (key[0] !== 'mine' || filters.assignedOperatorId)),
  });
}

function ScopeTab({ active, label, count, onClick }: { active: boolean; label: string; count?: number; onClick: () => void }) {
  return (
    <button type="button" className={active ? 'is-active' : ''} aria-pressed={active} onClick={onClick}>
      <span>{label}</span>
      <strong>{typeof count === 'number' ? count : '…'}</strong>
    </button>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function isOverdue(task: ClaimTaskProjection) {
  return task.status === 'OPEN' && Boolean(task.dueAt && new Date(task.dueAt).getTime() < Date.now());
}

function assignmentLabel(task: ClaimTaskProjection, operatorId: string) {
  if (!task.assignedOperatorId) return 'Sin asignar';
  return task.assignedOperatorId === operatorId ? 'Asignada a ti' : 'Asignada a otro operador';
}
