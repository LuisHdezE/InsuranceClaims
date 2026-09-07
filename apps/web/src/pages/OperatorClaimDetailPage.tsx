import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { downloadClaimEvidence, getClaimDetail, transitionClaimStatus } from '../api/claims';
import type { ApiFailure, ClaimStatus, EvidenceMetadata, OperatorClaimDetailResponse } from '../api/types';
import { ClaimTasksPanel } from '../components/ClaimTasksPanel';
import { ClaimTimelinePanel } from '../components/ClaimTimelinePanel';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorClaimDetailPage() {
  const { claimId = '' } = useParams();
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [selectedTransition, setSelectedTransition] = useState<ClaimStatus | ''>('');
  const [transitionFailure, setTransitionFailure] = useState<ApiFailure | null>(null);
  const [evidenceFailure, setEvidenceFailure] = useState<ApiFailure | null>(null);
  const [downloadingEvidenceId, setDownloadingEvidenceId] = useState<string | null>(null);

  const claimQuery = useQuery({
    queryKey: ['operator', 'claim', claimId],
    queryFn: () => getClaimDetail(claimId, session!.accessToken),
    enabled: Boolean(session && claimId),
  });

  const queryFailure = claimQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const transitionMutation = useMutation({
    mutationFn: (input: { expectedFromStatus: ClaimStatus; toStatus: ClaimStatus }) =>
      transitionClaimStatus(claimId, input, session!.accessToken),
    onSuccess: async () => {
      setSelectedTransition('');
      setTransitionFailure(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'timeline'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claims'] }),
      ]);
    },
    onError: async (error) => {
      const failure = error as ApiFailure;
      setTransitionFailure(failure);
      if (failure.problem?.status === 401) {
        signOut();
        return;
      }
      if (failure.problem?.status === 409) {
        setSelectedTransition('');
        await Promise.all([
          claimQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'timeline'] }),
        ]);
      }
    },
  });

  if (!session) return null;
  const detail = claimQuery.data?.data;

  const downloadEvidence = async (evidence: EvidenceMetadata) => {
    setDownloadingEvidenceId(evidence.evidenceId);
    setEvidenceFailure(null);
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
      const failure = error as ApiFailure;
      setEvidenceFailure(failure);
      if (failure.problem?.status === 401) signOut();
    } finally {
      setDownloadingEvidenceId(null);
    }
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <div className="ops-detail-breadcrumbs"><Link to="/operator/claims">← Volver a Claims</Link></div>

        {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
        {claimQuery.isLoading && <div className="ops-panel loading-state" role="status">Cargando detalle…</div>}

        {detail && (
          <>
            <ClaimHeader
              detail={detail}
              busy={transitionMutation.isPending}
              refreshBusy={claimQuery.isFetching}
              onRefresh={() => {
                void Promise.all([
                  claimQuery.refetch(),
                  queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'timeline'] }),
                ]);
              }}
              onPrimaryTransition={(toStatus) => {
                setTransitionFailure(null);
                transitionMutation.mutate({ expectedFromStatus: detail.status, toStatus });
              }}
            />

            {transitionFailure && <OperatorApiErrorNotice failure={transitionFailure} />}

            <div className="ops-detail-grid">
              <section className="ops-panel ops-summary-card" aria-labelledby="claim-summary-title">
                <div className="ops-panel-heading">
                  <div>
                    <span className="ops-kicker">Resumen</span>
                    <h2 id="claim-summary-title">Información del siniestro</h2>
                  </div>
                </div>
                <dl className="ops-summary-list">
                  <SummaryRow icon="◇" label="Tipo de evento" value={detail.eventType} />
                  <SummaryRow icon="◷" label="Fecha y hora" value={formatDate(detail.occurredAt)} />
                  <SummaryRow icon="⌖" label="Ubicación" value={detail.locationText} />
                  <SummaryRow icon="▱" label="Póliza" value={detail.policyReference} secondary={detail.verifiedCustomerLabel ?? 'Sin etiqueta de cliente disponible'} />
                  <SummaryRow icon="▰" label="Vehículo" value={detail.vehicleReference} />
                </dl>
                <div className="ops-detail-description">
                  <span className="ops-summary-icon" aria-hidden="true">≡</span>
                  <div><strong>Descripción</strong><p>{detail.description}</p></div>
                </div>
              </section>

              <section className="ops-panel ops-work-card" aria-labelledby="transition-title">
                <div className="ops-panel-heading">
                  <div>
                    <span className="ops-kicker">Decisión de negocio</span>
                    <h2 id="transition-title">Estado y siguiente decisión</h2>
                  </div>
                  <span className={`status-badge status-${detail.status.toLowerCase()}`}>{detail.status}</span>
                </div>

                <div className="ops-state-overview">
                  <div><span>Etapa operacional</span><strong>{stageLabel(detail.status)}</strong></div>
                  <div><span>Estado autoritativo</span><strong>{statusLabel(detail.status)}</strong></div>
                  <div><span>Actualizado</span><strong>{formatDate(detail.updatedAt)}</strong></div>
                </div>

                <div className="ops-task-contract-note is-live">
                  <strong>Trabajo y ciclo de vida están separados.</strong>
                  <span>Las tareas operativas se gestionan debajo. Una tarea completada no cambia automáticamente el estado autoritativo del Claim.</span>
                </div>

                <form className="ops-transition-form" onSubmit={(event) => {
                  event.preventDefault();
                  if (!selectedTransition) return;
                  setTransitionFailure(null);
                  transitionMutation.mutate({ expectedFromStatus: detail.status, toStatus: selectedTransition });
                }}>
                  <label htmlFor="transition-target">Transición autorizada</label>
                  <div className="ops-transition-row">
                    <select id="transition-target" value={selectedTransition} onChange={(event) => setSelectedTransition(event.target.value as ClaimStatus | '')} required>
                      <option value="">Seleccionar…</option>
                      {detail.allowedTransitions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                    <button className="ops-primary-action" type="submit" disabled={!selectedTransition || transitionMutation.isPending}>
                      {transitionMutation.isPending ? 'Enviando…' : 'Confirmar'}
                    </button>
                  </div>
                </form>
                <div className="operator-concurrency-note">`allowedTransitions` proviene del servidor. Se envía `expectedFromStatus = {detail.status}`; un 409 refresca el detalle antes de una nueva decisión.</div>
              </section>

              <ClaimTasksPanel claimId={claimId} />

              <section className="ops-panel ops-evidence-card" aria-labelledby="evidence-title">
                <div className="ops-panel-heading">
                  <div><span className="ops-kicker">Protegido</span><h2 id="evidence-title">Evidencia protegida</h2></div>
                  <span className="ops-count-pill">{detail.evidence.length} archivo(s)</span>
                </div>
                {evidenceFailure && <OperatorApiErrorNotice failure={evidenceFailure} />}
                {detail.evidence.length === 0 ? (
                  <div className="ops-compact-empty">No hay evidencia asociada a este siniestro.</div>
                ) : (
                  <ul className="ops-evidence-list">
                    {detail.evidence.map((evidence) => (
                      <li key={evidence.evidenceId}>
                        <span className={`ops-file-icon ${evidence.mediaType === 'application/pdf' ? 'is-pdf' : 'is-image'}`} aria-hidden="true">{evidence.mediaType === 'application/pdf' ? 'PDF' : 'IMG'}</span>
                        <div>
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
                <div className="ops-protected-note">🔒 Acceso restringido. La evidencia solo se recupera mediante el endpoint autenticado.</div>
              </section>

              <ClaimTimelinePanel claimId={claimId} />
            </div>

            <details className="ops-audit-details">
              <summary>Actividad técnica / auditoría <span>{detail.auditEvents.length} evento(s)</span></summary>
              <div className="ops-audit-table-wrap">
                {detail.auditEvents.length === 0 ? <div className="ops-compact-empty">No hay eventos de auditoría disponibles.</div> : (
                  <table className="ops-audit-table">
                    <thead><tr><th>Fecha y hora</th><th>Evento</th><th>Actor</th><th>Resultado</th><th>Request ID</th></tr></thead>
                    <tbody>
                      {detail.auditEvents.map((event, index) => (
                        <tr key={`${event.eventCode}-${event.occurredAt}-${index}`}>
                          <td>{formatDate(event.occurredAt)}</td>
                          <td><strong>{event.eventCode}</strong></td>
                          <td>{event.actorType}{event.actorId ? ` · ${event.actorId}` : ''}</td>
                          <td>{event.outcome}</td>
                          <td>{event.requestId ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </details>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function ClaimHeader({ detail, busy, refreshBusy, onRefresh, onPrimaryTransition }: {
  detail: OperatorClaimDetailResponse;
  busy: boolean;
  refreshBusy: boolean;
  onRefresh: () => void;
  onPrimaryTransition: (status: ClaimStatus) => void;
}) {
  const primary = preferredTransition(detail.status, detail.allowedTransitions);
  return (
    <header className="ops-detail-header">
      <div className="ops-detail-identity">
        <h1>{detail.trackingCode}</h1>
        <span>{detail.policyReference} · {detail.vehicleReference}</span>
      </div>
      <div className="ops-detail-stage">
        <span>Etapa actual</span>
        <strong>{stageLabel(detail.status)}</strong>
        <small>{statusLabel(detail.status)}</small>
      </div>
      <div className="ops-detail-status">
        <span>Estado</span>
        <strong className={`status-badge status-${detail.status.toLowerCase()}`}>{detail.status}</strong>
      </div>
      <div className="ops-detail-actions">
        {primary && (
          <button className="ops-primary-action" type="button" disabled={busy} onClick={() => onPrimaryTransition(primary.status)}>
            ▷ {busy ? 'Procesando…' : primary.label}
          </button>
        )}
        <button className="ops-icon-button" type="button" onClick={onRefresh} disabled={refreshBusy} aria-label="Actualizar detalle">↻</button>
      </div>
    </header>
  );
}

function SummaryRow({ icon, label, value, secondary }: { icon: string; label: string; value: string; secondary?: string }) {
  return <div className="ops-summary-row"><span className="ops-summary-icon" aria-hidden="true">{icon}</span><dt>{label}</dt><dd><strong>{value}</strong>{secondary && <small>{secondary}</small>}</dd></div>;
}

function preferredTransition(current: ClaimStatus, allowed: ClaimStatus[]) {
  const preferences: Partial<Record<ClaimStatus, { status: ClaimStatus; label: string }>> = {
    RECEIVED: { status: 'UNDER_REVIEW', label: 'Iniciar revisión' },
    OBSERVED: { status: 'UNDER_REVIEW', label: 'Retomar revisión' },
    APPROVED: { status: 'IN_REPAIR', label: 'Iniciar reparación' },
    IN_REPAIR: { status: 'CLOSED', label: 'Cerrar siniestro' },
  };
  const preferred = preferences[current];
  return preferred && allowed.includes(preferred.status) ? preferred : null;
}

function stageLabel(status: ClaimStatus) {
  if (status === 'RECEIVED') return 'Reportado';
  if (status === 'OBSERVED') return 'Requiere información';
  if (status === 'CLOSED') return 'Resuelto';
  return 'En gestión';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function statusLabel(status: ClaimStatus) {
  return ({
    RECEIVED: 'Recibido',
    UNDER_REVIEW: 'En revisión',
    OBSERVED: 'Observado',
    APPROVED: 'Aprobado',
    IN_REPAIR: 'En reparación',
    CLOSED: 'Cerrado',
  } satisfies Record<ClaimStatus, string>)[status];
}
