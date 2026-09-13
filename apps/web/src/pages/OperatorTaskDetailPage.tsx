import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { hasPermission } from '../auth/staff-access';
import { cancelClaimTask, completeClaimTask, getClaimTask, updateClaimTask } from '../api/tasks';
import type {
  ClaimTaskActorType,
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
      setSuccess('Tarea actualizada con el estado autoritativo del servidor.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  const assignToMeMutation = useMutation({
    mutationFn: (current: ClaimTaskProjection) => updateClaimTask(current.taskId, {
      expectedVersion: current.version,
      assignedOperatorId: session!.operator.id,
    }, session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess('Tarea asignada a tu usuario.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  const completeMutation = useMutation({
    mutationFn: (current: ClaimTaskProjection) => completeClaimTask(current.taskId, 'OPEN', session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess('Tarea completada. El estado del siniestro no fue modificado automáticamente.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  const cancelMutation = useMutation({
    mutationFn: (current: ClaimTaskProjection) => cancelClaimTask(current.taskId, { expectedVersion: current.version, reason: cancelReason }, session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess('Tarea cancelada y razón persistida.');
      await invalidate(result.data);
    },
    onError: handleFailure,
  });

  if (!session) return null;
  const canManage = hasPermission(session.operator.role, 'claims.tasks.manage');
  const hasChanges = Boolean(task && edit && (
    edit.priority !== task.priority
      || edit.dueAt !== toDateTimeLocal(task.dueAt)
  ));

  const mutationBusy = updateMutation.isPending || assignToMeMutation.isPending || completeMutation.isPending || cancelMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-task-detail-page">
        <div className="ops-detail-breadcrumbs">
          <Link to="/operator/tasks">← Volver a Tareas</Link>
          {task && <Link to={`/operator/claims/${task.claimId}`}>Abrir siniestro ↗</Link>}
        </div>

        {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
        {failure && <OperatorApiErrorNotice failure={failure} />}
        {success && <div className="alert alert-info" role="status">{success}</div>}
        {taskQuery.isLoading && <div className="ops-panel loading-state" role="status">Cargando tarea…</div>}

        {task && edit && (
          <>
            <header className="r3-task-detail-hero">
              <div>
                <span className="ops-kicker">Tarea operativa</span>
                <h1>{task.title}</h1>
                <p>{task.description ?? 'Sin descripción adicional.'}</p>
                <div className="r3-task-hero-meta">
                  <span>{taskTypeLabel(task.type)}</span>
                  <span className={`ops-priority is-${task.priority.toLowerCase()}`}>{task.priority === 'HIGH' ? 'Prioridad alta' : 'Prioridad normal'}</span>
                  <span className={`ops-task-status is-${task.status.toLowerCase()}`}>{taskStatusLabel(task.status)}</span>
                </div>
              </div>
            </header>

            <section className="r3-task-detail-grid">
              <article className="ops-panel r3-task-context-card">
                <div className="ops-panel-heading"><div><span className="ops-kicker">Contexto</span><h2>Siniestro asociado</h2></div></div>
                <dl className="r3-task-context-list">
                  <div><dt>Seguimiento</dt><dd>{task.trackingCode ?? '—'}</dd></div>
                  <div><dt>Póliza</dt><dd>{task.policyReference ?? '—'}</dd></div>
                  <div><dt>Vehículo</dt><dd>{task.vehicleReference ?? '—'}</dd></div>
                  <div><dt>Cola</dt><dd>Siniestros</dd></div>
                  <div><dt>Asignación</dt><dd>{assignmentLabel(task, session.operator.id)}</dd></div>
                  <div><dt>Origen</dt><dd>{actorTypeLabel(task.createdByType)}</dd></div>
                  <div><dt>Creada</dt><dd>{formatDate(task.createdAt)}</dd></div>
                  <div><dt>Actualizada</dt><dd>{formatDate(task.updatedAt)}</dd></div>
                </dl>
                <Link className="ops-primary-action r3-full-action" to={`/operator/claims/${task.claimId}`}>Abrir siniestro</Link>
              </article>

              <article className="ops-panel r3-task-edit-card">
                <div className="ops-panel-heading">
                  <div>
                    <span className="ops-kicker">Planificación</span>
                    <h2>Prioridad y vencimiento</h2>
                    <p>Los cambios se validan contra el estado actual del servidor para evitar sobrescrituras concurrentes.</p>
                  </div>
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
                      dueAt: edit.dueAt ? new Date(edit.dueAt).toISOString() : null,
                    });
                  }}>
                    <div className="r3-task-edit-grid">
                      <label><span>Prioridad</span><select value={edit.priority} onChange={(event) => setEdit((current) => current ? { ...current, priority: event.target.value as ClaimTaskPriority } : current)}><option value="NORMAL">Normal</option><option value="HIGH">Alta</option></select></label>
                      <label><span>Vencimiento</span><input type="datetime-local" value={edit.dueAt} onChange={(event) => setEdit((current) => current ? { ...current, dueAt: event.target.value } : current)} /></label>
                    </div>
                    <div className="r3-task-form-actions">
                      {task.assignedOperatorId !== session.operator.id && (
                        <button className="r3-secondary-action" type="button" disabled={mutationBusy} onClick={() => { setFailure(null); setSuccess(null); assignToMeMutation.mutate(task); }}>
                          {assignToMeMutation.isPending ? 'Asignando…' : 'Asignarme'}
                        </button>
                      )}
                      {task.assignedOperatorId === session.operator.id && <span className="r3-task-assignment-state">Asignada a ti</span>}
                      <button className="ops-primary-action" type="submit" disabled={!hasChanges || mutationBusy}>{updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}</button>
                    </div>
                    <p className="r3-task-assignment-note">La selección de otro operador no se ofrece hasta contar con un directorio canónico de operadores.</p>
                  </form>
                ) : (
                  <div className="r3-task-readonly-state">{task.status === 'OPEN' ? 'Tu rol puede consultar esta tarea, pero no modificarla.' : 'Esta tarea ya no admite edición porque no está abierta.'}</div>
                )}
              </article>
            </section>

            <section className="ops-panel r3-task-decision-card" aria-labelledby="task-decision-title">
              <div className="ops-panel-heading"><div><span className="ops-kicker">Decisión explícita</span><h2 id="task-decision-title">Cerrar trabajo</h2><p>Completar o cancelar son acciones terminales distintas, explícitas y auditables.</p></div></div>
              {task.status === 'OPEN' && canManage ? (
                <div className="r3-task-decision-grid">
                  <article><span className="r3-decision-icon is-success">✓</span><div><strong>Completar tarea</strong><p>Marca el trabajo como realizado. No cambia el estado del siniestro automáticamente.</p></div><button className="ops-primary-action" type="button" disabled={mutationBusy} onClick={() => { setFailure(null); setSuccess(null); completeMutation.mutate(task); }}>{completeMutation.isPending ? 'Completando…' : 'Completar tarea'}</button></article>
                  <article><span className="r3-decision-icon is-warning">×</span><div><strong>Cancelar tarea</strong><p>Requiere una razón canónica y conserva el control de concurrencia del servidor.</p><select aria-label="Razón de cancelación" value={cancelReason} onChange={(event) => setCancelReason(event.target.value as ClaimTaskCancellationReason)}>{CANCELLATION_REASONS.map((reason) => <option value={reason} key={reason}>{cancellationReasonLabel(reason)}</option>)}</select></div><button className="r3-danger-action" type="button" disabled={mutationBusy} onClick={() => { setFailure(null); setSuccess(null); cancelMutation.mutate(task); }}>{cancelMutation.isPending ? 'Cancelando…' : 'Cancelar tarea'}</button></article>
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

function assignmentLabel(task: ClaimTaskProjection, operatorId: string) {
  if (!task.assignedOperatorId) return 'Sin asignar';
  return task.assignedOperatorId === operatorId ? 'Asignada a ti' : 'Asignada a otro operador';
}

function actorTypeLabel(actorType: ClaimTaskActorType) {
  return ({
    SYSTEM: 'Sistema',
    OPERATOR: 'Operador',
    SUPERVISOR: 'Supervisor',
    ADMINISTRATOR: 'Administrador',
    AUTOMATION: 'Automatización',
  } satisfies Record<ClaimTaskActorType, string>)[actorType];
}
