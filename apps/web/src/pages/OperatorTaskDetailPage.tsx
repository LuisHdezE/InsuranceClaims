import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { hasPermission } from '../auth/staff-access';
import { cancelClaimTask, completeClaimTask, getClaimTask, updateClaimTask } from '../api/tasks';
import type {
  ClaimTaskCancellationReason,
  ClaimTaskPriority,
  ClaimTaskProjection,
  UpdateClaimTaskInput,
} from '../api/task-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { cancellationReasonLabel, taskStatusLabel, taskTypeLabel } from '../components/task-presentation';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const CANCELLATION_REASONS: ClaimTaskCancellationReason[] = ['NO_LONGER_REQUIRED', 'DUPLICATE', 'CREATED_IN_ERROR'];

type EditState = {
  priority: ClaimTaskPriority;
  assignedOperatorId: string;
  dueAt: string;
};

export function OperatorTaskDetailPage() {
  const { taskId = '' } = useParams();
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [cancelReason, setCancelReason] = useState<ClaimTaskCancellationReason>('NO_LONGER_REQUIRED');

  const taskQuery = useQuery({
    queryKey: ['operator', 'task', taskId],
    queryFn: () => getClaimTask(taskId, session!.accessToken),
    enabled: Boolean(session && taskId),
  });

  const queryFailure = taskQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const task = taskQuery.data?.data;
  useEffect(() => {
    if (!task) return;
    setEdit({
      priority: task.priority,
      assignedOperatorId: task.assignedOperatorId ?? '',
      dueAt: toDateTimeLocal(task.dueAt),
    });
  }, [task?.taskId, task?.version]);

  const invalidate = async (current: ClaimTaskProjection) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['operator', 'task', current.taskId] }),
      queryClient.invalidateQueries({ queryKey: ['operator', 'claim', current.claimId, 'tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['operator', 'tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['operator', 'claims-operational-metrics'] }),
    ]);
  };

  const handleFailure = async (error: unknown) => {
    const next = error as ApiFailure;
    setFailure(next);
    setSuccess(null);
    if (next.problem?.status === 401) {
      signOut();
      return;
    }
    if (next.problem?.status === 409) await taskQuery.refetch();
  };

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateClaimTaskInput) => updateClaimTask(taskId, payload, session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess('Task actualizada con la versión autoritativa del servidor.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  const completeMutation = useMutation({
    mutationFn: (current: ClaimTaskProjection) => completeClaimTask(current.taskId, 'OPEN', session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess('Task completada. El estado del Claim no fue modificado automáticamente.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  const cancelMutation = useMutation({
    mutationFn: (current: ClaimTaskProjection) => cancelClaimTask(current.taskId, { expectedVersion: current.version, reason: cancelReason }, session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess('Task cancelada y razón persistida.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  if (!session) return null;
  const canManage = hasPermission(session.operator.role, 'claims.tasks.manage');
  const hasChanges = Boolean(task && edit && (
    edit.priority !== task.priority
      || edit.assignedOperatorId.trim() !== (task.assignedOperatorId ?? '')
      || edit.dueAt !== toDateTimeLocal(task.dueAt)
  ));

  const mutationBusy = updateMutation.isPending || completeMutation.isPending || cancelMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-task-detail-main">
        <div className="ops-detail-breadcrumbs">
          <Link to="/operator/tasks">← Volver a Tasks</Link>
          {task && <Link to={`/operator/claims/${task.claimId}`}>Abrir Claim ↗</Link>}
        </div>

        {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
        {failure && <OperatorApiErrorNotice failure={failure} />}
        {success && <div className="alert alert-info" role="status">{success}</div>}
        {taskQuery.isLoading && <div className="ops-panel loading-state" role="status">Cargando Task…</div>}

        {task && edit && (
          <>
            <header className="r3-task-detail-hero">
              <div>
                <span className="ops-kicker">Task R3 · v{task.version}</span>
                <h1>{task.title}</h1>
                <p>{task.description ?? 'Sin descripción adicional.'}</p>
                <div className="r3-task-hero-meta">
                  <span>{taskTypeLabel(task.type)}</span>
                  <span className={`ops-priority is-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Prioridad alta' : 'Prioridad normal'}</span>
                  <span className={`ops-task-status is-${task.status.toLowerCase()}`}>{taskStatusLabel(task.status)}</span>
                </div>
              </div>
              <div className="r3-task-version-orbit" aria-hidden="true"><strong>{task.version}</strong><span>version</span></div>
            </header>

            <section className="r3-task-detail-grid">
              <article className="ops-panel r3-task-context-card">
                <div className="ops-panel-heading"><div><span className="ops-kicker">Contexto</span><h2>Claim asociado</h2></div></div>
                <dl className="r3-task-context-list">
                  <div><dt>Seguimiento</dt><dd>{task.trackingCode ?? '—'}</dd></div>
                  <div><dt>Póliza</dt><dd>{task.policyReference ?? '—'}</dd></div>
                  <div><dt>Vehículo</dt><dd>{task.vehicleReference ?? '—'}</dd></div>
                  <div><dt>Cola</dt><dd>{task.queue}</dd></div>
                  <div><dt>Creada por</dt><dd>{task.createdByType}{task.createdById ? ` · ${shortId(task.createdById)}` : ''}</dd></div>
                  <div><dt>Actualizada</dt><dd>{formatDate(task.updatedAt)}</dd></div>
                </dl>
                <Link className="ops-primary-action r3-full-action" to={`/operator/claims/${task.claimId}`}>Abrir siniestro</Link>
              </article>

              <article className="ops-panel r3-task-edit-card">
                <div className="ops-panel-heading">
                  <div><span className="ops-kicker">Control optimista</span><h2>Asignación y planificación</h2><p>Las ediciones usan `expectedVersion = {task.version}`.</p></div>
                  <span className="r3-version-chip">v{task.version}</span>
                </div>

                {canManage && task.status === 'OPEN' ? (
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    if (!hasChanges) return;
                    setFailure(null);
                    setSuccess(null);
                    updateMutation.mutate({
                      expectedVersion: task.version,
                      priority: edit.priority,
                      assignedOperatorId: edit.assignedOperatorId.trim() || null,
                      queue: 'CLAIMS',
                      dueAt: edit.dueAt ? new Date(edit.dueAt).toISOString() : null,
                    });
                  }}>
                    <div className="r3-task-edit-grid">
                      <label><span>Prioridad</span><select value={edit.priority} onChange={(event) => setEdit((current) => current ? { ...current, priority: event.target.value as ClaimTaskPriority } : current)}><option value="NORMAL">Normal</option><option value="HIGH">Alta</option></select></label>
                      <label><span>Vencimiento</span><input type="datetime-local" value={edit.dueAt} onChange={(event) => setEdit((current) => current ? { ...current, dueAt: event.target.value } : current)} /></label>
                      <label className="is-wide"><span>Operator ID</span><input value={edit.assignedOperatorId} placeholder="UUID o vacío para liberar" onChange={(event) => setEdit((current) => current ? { ...current, assignedOperatorId: event.target.value } : current)} /></label>
                    </div>
                    <div className="r3-task-form-actions"><button className="r3-inline-link" type="button" onClick={() => setEdit((current) => current ? { ...current, assignedOperatorId: session.operator.id } : current)}>Asignarme</button><button className="ops-primary-action" type="submit" disabled={!hasChanges || mutationBusy}>{updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}</button></div>
                  </form>
                ) : (
                  <div className="r3-task-readonly-state">{task.status === 'OPEN' ? 'Tu rol puede consultar esta Task, pero no modificarla.' : 'Esta Task ya no admite edición porque no está OPEN.'}</div>
                )}
              </article>
            </section>

            <section className="ops-panel r3-task-decision-card" aria-labelledby="task-decision-title">
              <div className="ops-panel-heading"><div><span className="ops-kicker">Decisión explícita</span><h2 id="task-decision-title">Cerrar trabajo</h2><p>Completar o cancelar son acciones terminales diferentes y auditables.</p></div></div>
              {task.status === 'OPEN' && canManage ? (
                <div className="r3-task-decision-grid">
                  <article><span className="r3-decision-icon is-success">✓</span><div><strong>Completar Task</strong><p>Marca el trabajo como realizado. No cambia el Claim automáticamente.</p></div><button className="ops-primary-action" type="button" disabled={mutationBusy} onClick={() => { setFailure(null); setSuccess(null); completeMutation.mutate(task); }}>{completeMutation.isPending ? 'Completando…' : 'Completar'}</button></article>
                  <article><span className="r3-decision-icon is-warning">×</span><div><strong>Cancelar Task</strong><p>Requiere una razón canónica y `expectedVersion`.</p><select value={cancelReason} onChange={(event) => setCancelReason(event.target.value as ClaimTaskCancellationReason)}>{CANCELLATION_REASONS.map((reason) => <option value={reason} key={reason}>{cancellationReasonLabel(reason)}</option>)}</select></div><button className="r3-danger-action" type="button" disabled={mutationBusy} onClick={() => { setFailure(null); setSuccess(null); cancelMutation.mutate(task); }}>{cancelMutation.isPending ? 'Cancelando…' : 'Cancelar Task'}</button></article>
                </div>
              ) : (
                <div className="r3-task-terminal-state">
                  <strong>{taskStatusLabel(task.status)}</strong>
                  {task.completedAt && <span>Completada {formatDate(task.completedAt)}</span>}
                  {task.cancelledAt && <span>Cancelada {formatDate(task.cancelledAt)} · {task.cancellationReason ? cancellationReasonLabel(task.cancellationReason) : 'sin razón disponible'}</span>}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}
