import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { hasPermission } from '../auth/staff-access';
import { completeClaimTask, listClaimTasks } from '../api/tasks';
import type { ApiFailure } from '../api/types';
import type { ClaimTaskProjection, ClaimTaskStatus } from '../api/task-types';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { ClaimTaskCreateForm } from './ClaimTaskCreateForm';
import { OperatorApiErrorNotice } from './OperatorApiErrorNotice';
import { taskStatusLabel, taskTypeLabel } from './task-presentation';

export function ClaimTasksPanel({ claimId }: { claimId: string }) {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [creating, setCreating] = useState(false);

  const tasksQuery = useQuery({
    queryKey: ['operator', 'claim', claimId, 'tasks'],
    queryFn: () => listClaimTasks(claimId, session!.accessToken),
    enabled: Boolean(session && claimId),
  });

  const queryFailure = tasksQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const completeMutation = useMutation({
    mutationFn: (task: ClaimTaskProjection) => completeClaimTask(task.taskId, 'OPEN', session!.accessToken),
    onSuccess: async () => {
      setFailure(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'timeline'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'evidence-attention'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claims-operational-metrics'] }),
      ]);
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

  if (!session) return null;
  const tasks = tasksQuery.data?.data ?? [];
  const openCount = tasks.filter((task) => task.status === 'OPEN').length;
  const canManage = hasPermission(session.operator.role, 'claims.tasks.manage');

  return (
    <section className="ops-panel ops-claim-tasks-card r3-claim-tasks-card" aria-labelledby="claim-tasks-title">
      <div className="ops-panel-heading">
        <div>
          <span className="ops-kicker">Trabajo operativo</span>
          <h2 id="claim-tasks-title">Tareas</h2>
          <p>Trabajo persistente asociado al siniestro. Completar una tarea no cambia el estado del Claim.</p>
        </div>
        <div className="r3-task-panel-heading-actions">
          <span className="ops-count-pill">{openCount} abierta(s)</span>
          {canManage && (
            <button className="ops-refresh-button" type="button" onClick={() => setCreating((value) => !value)}>
              {creating ? 'Cerrar formulario' : '+ Nueva tarea'}
            </button>
          )}
        </div>
      </div>

      {creating && canManage && <ClaimTaskCreateForm claimId={claimId} onCreated={() => setCreating(false)} />}
      {failure && <OperatorApiErrorNotice failure={failure} />}
      {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
      {tasksQuery.isLoading ? (
        <div className="ops-compact-empty" role="status">Cargando tareas…</div>
      ) : tasks.length === 0 ? (
        <div className="ops-compact-empty">Este siniestro no tiene tareas operativas registradas.</div>
      ) : (
        <ul className="ops-claim-task-list r3-claim-task-list">
          {tasks.map((task) => (
            <li key={task.taskId} className={task.status !== 'OPEN' ? `is-${task.status.toLowerCase()}` : ''}>
              <span className="ops-task-check" aria-hidden="true">
                {task.status === 'COMPLETED' ? '✓' : task.status === 'CANCELLED' ? '×' : '○'}
              </span>
              <div className="ops-task-main-copy">
                <Link className="r3-task-title-link" to={`/operator/tasks/${task.taskId}`}><strong>{task.title}</strong></Link>
                <span>{taskTypeLabel(task.type)} · {task.priority === 'HIGH' ? 'Prioridad alta' : 'Prioridad normal'}</span>
                <small>{task.dueAt ? `Vence ${formatDate(task.dueAt)}` : 'Sin vencimiento definido'} · {assignmentLabel(task, session.operator.id)}</small>
              </div>
              <TaskStatusBadge status={task.status} />
              <div className="r3-task-row-actions">
                <Link to={`/operator/tasks/${task.taskId}`}>Gestionar</Link>
                {canManage && task.status === 'OPEN' && (
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
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export { taskTypeLabel } from './task-presentation';

function TaskStatusBadge({ status }: { status: ClaimTaskStatus }) {
  return <span className={`ops-task-status is-${status.toLowerCase()}`}>{taskStatusLabel(status)}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function assignmentLabel(task: ClaimTaskProjection, operatorId: string) {
  if (!task.assignedOperatorId) return 'Sin asignar';
  return task.assignedOperatorId === operatorId ? 'Asignada a ti' : 'Asignada a otro operador';
}
