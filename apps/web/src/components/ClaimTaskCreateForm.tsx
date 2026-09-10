import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClaimTask } from '../api/tasks';
import type { ClaimTaskPriority, ClaimTaskType, CreateClaimTaskInput } from '../api/task-types';
import type { ApiFailure } from '../api/types';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { OperatorApiErrorNotice } from './OperatorApiErrorNotice';
import { taskTypeLabel } from './task-presentation';

const TASK_TYPES: ClaimTaskType[] = [
  'CLAIM_REVIEW',
  'EVIDENCE_REVIEW',
  'MISSING_DOCUMENT_FOLLOWUP',
  'CUSTOMER_FOLLOWUP',
  'CLOSURE_REVIEW',
];

type FormState = {
  type: ClaimTaskType;
  title: string;
  description: string;
  priority: ClaimTaskPriority;
  assignedOperatorId: string;
  dueAt: string;
};

const INITIAL: FormState = {
  type: 'CLAIM_REVIEW',
  title: '',
  description: '',
  priority: 'NORMAL',
  assignedOperatorId: '',
  dueAt: '',
};

export function ClaimTaskCreateForm({ claimId, onCreated }: { claimId: string; onCreated?: () => void }) {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);

  const payload = useMemo<CreateClaimTaskInput>(() => ({
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim() || null,
    priority: form.priority,
    queue: 'CLAIMS',
    assignedOperatorId: form.assignedOperatorId.trim() || null,
    dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
  }), [form]);

  const mutation = useMutation({
    mutationFn: async () => {
      const fingerprint = JSON.stringify(payload);
      if (!idempotency.current || idempotency.current.fingerprint !== fingerprint) {
        idempotency.current = { fingerprint, key: crypto.randomUUID() };
      }
      return createClaimTask(claimId, payload, idempotency.current.key, session!.accessToken);
    },
    onSuccess: async (result) => {
      setFailure(null);
      setSuccess(result.idempotencyReplayed ? 'La solicitud ya había sido procesada; mostramos la Task persistida.' : 'Task creada correctamente.');
      idempotency.current = null;
      setForm(INITIAL);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claims-operational-metrics'] }),
      ]);
      onCreated?.();
    },
    onError: (error) => {
      const next = error as ApiFailure;
      setFailure(next);
      setSuccess(null);
      if (next.problem?.status === 401) signOut();
    },
  });

  if (!session) return null;

  return (
    <form
      className="r3-create-task-form"
      onSubmit={(event) => {
        event.preventDefault();
        setFailure(null);
        setSuccess(null);
        mutation.mutate();
      }}
    >
      <div className="r3-create-task-heading">
        <div>
          <span className="ops-kicker">Nueva Task</span>
          <strong>Agregar trabajo operativo</strong>
        </div>
        <span className="r3-idempotency-badge">Idempotente</span>
      </div>

      {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
      {success && <div className="alert alert-info" role="status">{success}</div>}

      <div className="r3-task-form-grid">
        <label>
          <span>Tipo</span>
          <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as ClaimTaskType }))}>
            {TASK_TYPES.map((type) => <option value={type} key={type}>{taskTypeLabel(type)}</option>)}
          </select>
        </label>
        <label>
          <span>Prioridad</span>
          <select value={form.priority} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value as ClaimTaskPriority }))}>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Alta</option>
          </select>
        </label>
        <label className="is-wide">
          <span>Título</span>
          <input value={form.title} maxLength={160} required placeholder="Trabajo que debe realizarse" onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <label className="is-wide">
          <span>Descripción opcional</span>
          <textarea value={form.description} maxLength={1000} rows={3} placeholder="Contexto operativo, sin inventar decisiones de negocio" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
        </label>
        <label>
          <span>Asignar a operator ID</span>
          <input value={form.assignedOperatorId} placeholder="UUID o vacío" onChange={(event) => setForm((current) => ({ ...current, assignedOperatorId: event.target.value }))} />
          <button className="r3-inline-link" type="button" onClick={() => setForm((current) => ({ ...current, assignedOperatorId: session.operator.id }))}>Asignarme</button>
        </label>
        <label>
          <span>Vencimiento</span>
          <input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} />
        </label>
      </div>

      <div className="r3-task-form-actions">
        <small>La misma solicitud conserva su Idempotency-Key ante un retry incierto; si cambian los datos se genera una nueva clave.</small>
        <button className="ops-primary-action" type="submit" disabled={mutation.isPending || !form.title.trim()}>
          {mutation.isPending ? 'Creando…' : 'Crear Task'}
        </button>
      </div>
    </form>
  );
}
