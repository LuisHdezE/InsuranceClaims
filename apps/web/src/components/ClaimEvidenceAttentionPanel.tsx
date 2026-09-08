import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadClaimEvidence } from '../api/claims';
import { getClaimEvidenceAttention } from '../api/evidence-attention';
import type { EvidenceAttentionItem, EvidenceAttentionState, EvidenceReviewTask } from '../api/evidence-attention-types';
import { completeClaimTask } from '../api/tasks';
import type { ApiFailure } from '../api/types';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { OperatorApiErrorNotice } from './OperatorApiErrorNotice';

export function ClaimEvidenceAttentionPanel({ claimId }: { claimId: string }) {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState<string | null>(null);

  const attentionQuery = useQuery({
    queryKey: ['operator', 'claim', claimId, 'evidence-attention'],
    queryFn: () => getClaimEvidenceAttention(claimId, session!.accessToken),
    enabled: Boolean(session && claimId),
  });

  const queryFailure = attentionQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const completeReviewMutation = useMutation({
    mutationFn: (task: EvidenceReviewTask) => completeClaimTask(task.taskId, task.status, session!.accessToken),
    onSuccess: async () => {
      setFailure(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'evidence-attention'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'timeline'] }),
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
      if (next.problem?.status === 409) await attentionQuery.refetch();
    },
  });

  if (!session) return null;
  const attention = attentionQuery.data?.data;
  const openReviewTask = attention?.reviewTasks.find((task) => task.status === 'OPEN') ?? null;
  const completedReviewTask = attention?.reviewTasks.find((task) => task.status === 'COMPLETED') ?? null;

  const downloadEvidence = async (evidence: EvidenceAttentionItem) => {
    setDownloadingEvidenceId(evidence.evidenceId);
    setFailure(null);
    try {
      const result = await downloadClaimEvidence(claimId, evidence.evidenceId, session.accessToken);
      const blob = new Blob([result.data.bytes], { type: result.data.mediaType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.data.filename ?? evidence.displayFilename ?? `evidence-${evidence.evidenceId}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      const next = error as ApiFailure;
      setFailure(next);
      if (next.problem?.status === 401) signOut();
    } finally {
      setDownloadingEvidenceId(null);
    }
  };

  return (
    <section className="ops-panel ops-evidence-attention" aria-labelledby="evidence-attention-title">
      <div className="ops-panel-heading ops-evidence-heading">
        <div>
          <span className="ops-kicker">Evidencia protegida</span>
          <h2 id="evidence-attention-title">Revisión de evidencia</h2>
          <p>La atención se deriva de evidencia persistida y de la tarea operativa EVIDENCE_REVIEW.</p>
        </div>
        {attention && <AttentionBadge state={attention.attentionState} />}
      </div>

      {failure && <OperatorApiErrorNotice failure={failure} />}
      {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}

      {attentionQuery.isLoading ? (
        <div className="ops-compact-empty" role="status">Cargando evidencia…</div>
      ) : !attention ? null : (
        <>
          <div className="ops-evidence-review-summary">
            <div><span>Archivos</span><strong>{attention.evidenceCount}</strong></div>
            <div><span>Revisión abierta</span><strong>{attention.openReviewTaskCount}</strong></div>
            <div><span>Revisión completada</span><strong>{attention.completedReviewTaskCount}</strong></div>
          </div>

          {openReviewTask && (
            <div className="ops-evidence-work is-pending">
              <div>
                <span>Trabajo asociado</span>
                <strong>{openReviewTask.title}</strong>
                <small>{openReviewTask.priority === 'HIGH' ? 'Prioridad alta' : 'Prioridad normal'} · Creada {formatDate(openReviewTask.createdAt)}</small>
              </div>
              <button
                type="button"
                className="ops-primary-action"
                disabled={completeReviewMutation.isPending}
                onClick={() => {
                  setFailure(null);
                  completeReviewMutation.mutate(openReviewTask);
                }}
              >
                {completeReviewMutation.isPending ? 'Completando…' : 'Completar revisión'}
              </button>
            </div>
          )}

          {!openReviewTask && completedReviewTask && (
            <div className="ops-evidence-work is-reviewed">
              <div>
                <span>Trabajo asociado</span>
                <strong>Revisión operativa completada</strong>
                <small>{completedReviewTask.completedAt ? `Completada ${formatDate(completedReviewTask.completedAt)}` : 'Completada'}{completedReviewTask.completedById ? ` · Operador ${shortId(completedReviewTask.completedById)}` : ''}</small>
              </div>
              <span className="ops-evidence-check" aria-hidden="true">✓</span>
            </div>
          )}

          {attention.attentionState === 'AVAILABLE' && (
            <div className="ops-evidence-work is-available">
              <div>
                <span>Atención operacional</span>
                <strong>Evidencia disponible sin tarea de revisión correlacionada</strong>
                <small>La interfaz no infiere un estado de revisión que no exista de forma durable.</small>
              </div>
            </div>
          )}

          {attention.evidence.length === 0 ? (
            <div className="ops-compact-empty">No hay evidencia asociada a este siniestro.</div>
          ) : (
            <ul className="ops-evidence-list ops-evidence-attention-list">
              {attention.evidence.map((evidence) => (
                <li key={evidence.evidenceId}>
                  <span className={`ops-file-icon ${evidence.mediaType === 'application/pdf' ? 'is-pdf' : 'is-image'}`} aria-hidden="true">{evidence.mediaType === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                  <div className="ops-evidence-file-copy">
                    <strong>{evidence.displayFilename ?? 'Evidencia sin nombre'}</strong>
                    <span>{evidence.mediaType} · {formatBytes(evidence.sizeBytes)} · {formatDate(evidence.createdAt)}</span>
                  </div>
                  <button type="button" disabled={downloadingEvidenceId === evidence.evidenceId} onClick={() => void downloadEvidence(evidence)}>
                    {downloadingEvidenceId === evidence.evidenceId ? 'Descargando…' : 'Descargar'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="ops-protected-note">🔒 Acceso restringido. Completar la revisión cierra trabajo operativo; no cambia el estado autoritativo del Claim.</div>
        </>
      )}
    </section>
  );
}

function AttentionBadge({ state }: { state: EvidenceAttentionState }) {
  const labels: Record<EvidenceAttentionState, string> = {
    NO_EVIDENCE: 'Sin evidencia',
    AVAILABLE: 'Disponible',
    PENDING_REVIEW: 'Pendiente de revisión',
    REVIEWED: 'Revisión completada',
  };
  return <span className={`ops-evidence-attention-badge is-${state.toLowerCase().replaceAll('_', '-')}`}>{labels[state]}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}
