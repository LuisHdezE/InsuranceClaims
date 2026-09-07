import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { completeClaimTask, listClaimTasks } from '../api/tasks';
import type { ApiFailure } from '../api/types';
import type { ClaimTaskProjection, ClaimTaskType } from '../api/task-types';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { OperatorApiErrorNotice } from './OperatorApiErrorNotice';

export function ClaimTasksPanel({ claimId }: { claimId: string }) {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [failure, setFailure] = useState<ApiFailure | null>(null);

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
    mutationFn: (task: ClaimTaskProjection) => completeClaimTask(task.taskId, task.status, session!.accessToken),
    onSuccess: async () => {
      setFailure(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'tasks'] }),
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

  const tasks = tasksQuery.data?.data ?? [];
  const openCount = tasks.filter((task) => task.status === 'OPEN').length;

  return (
    <section className="ops-panel ops-claim-tasks-card" aria-labelledby="claim-tasks-title">
      <div className="ops-panel-heading">
        <div>
          <span className="ops-kicker">Trabajo operativo</span>
          <h2 id="claim-tasks-title">Tareas</h2>
          <p>Trabajo persistente asociado al siniestro. Completar una tarea no cambia el estado del Claim.</p>
        </div>
        <span className="ops-count-pill">{openCount} abierta(s)</span>
      </div>

      {failure && <OperatorApiErrorNotice failure={failure} />}
      {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
      {tasksQuery.isLoading ? (
        <div className="ops-compact-empty" role="status">Cargando tareas…</div>
      ) : tasks.length === 0 ? (
        <div className="ops-compact-empty">Este siniestro no tiene tareas operativas registradas.</div>
      ) : (
        <ul className="ops-claim-task-list">
          {tasks.map((task) => (
            <li key={task.taskId} className={task.status === 'COMPLETED' ? 'is-completed' : ''}>
              <span className="ops-task-check" aria-hidden="true">{task.status === 'COMPLETED' ? '✓' : '○'}</span>
              <div className="ops-task-main-copy">
                <strong>{task.title}</strong>
                <span>{taskTypeLabel(task.type)} · {task.priority === 'HIGH' ? 'Prioridad alta' : 'Prioridad normal'}</span>
                <small>{task.dueAt ? `Vence ${formatDate(task.dueAt)}` : 'Sin vencimiento definido'} · Cola {task.queue}</small>
              </div>
              <span className={`ops-task-status is-${task.status.toLowerCase()}`}>{task.status === 'OPEN' ? 'Abierta' : 'Completada'}</span>
              {task.status === 'OPEN' && (
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function taskTypeLabel(type: ClaimTaskType) {
  return ({
    CLAIM_REVIEW: 'Revisión de siniestro',
    EVIDENCE_REVIEW: 'Revisión de evidencia',
    MISSING_DOCUMENT_FOLLOWUP: 'Seguimiento documental',
    CUSTOMER_FOLLOWUP: 'Seguimiento al cliente',
    CLOSURE_REVIEW: 'Revisión de cierre',
  } satisfies Record<ClaimTaskType, string>)[type];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
