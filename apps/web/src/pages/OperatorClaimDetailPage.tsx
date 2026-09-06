import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { downloadClaimEvidence, getClaimDetail, transitionClaimStatus } from '../api/claims';
import type { ApiFailure, ClaimStatus, EvidenceMetadata } from '../api/types';
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
        await claimQuery.refetch();
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
      <main className="operator-main container-shell">
        <div className="breadcrumbs"><Link to="/operator/claims">Siniestros</Link><span aria-hidden="true">/</span><span>Detalle</span></div>
        <div className="operator-title-row">
          <div>
            <span className="eyebrow">Detalle autoritativo</span>
            <h1>{detail?.trackingCode ?? 'Siniestro'}</h1>
            <p>Estado, evidencia, historial y acciones provienen del API protegido.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => void claimQuery.refetch()} disabled={claimQuery.isFetching}>
            {claimQuery.isFetching ? 'Actualizando…' : 'Actualizar detalle'}
          </button>
        </div>

        {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
        {claimQuery.isLoading && <div className="operator-panel loading-state" role="status">Cargando detalle…</div>}

        {detail && (
          <div className="operator-detail-grid">
            <div className="operator-detail-main">
              <section className="operator-panel" aria-labelledby="claim-summary-title">
                <div className="panel-heading">
                  <div><span className="eyebrow">Resumen</span><h2 id="claim-summary-title">Información del siniestro</h2></div>
                  <span className={`status-badge status-${detail.status.toLowerCase()}`}>{statusLabel(detail.status)}</span>
                </div>
                <dl className="operator-definition-grid">
                  <div><dt>Póliza</dt><dd>{detail.policyReference}</dd></div>
                  <div><dt>Vehículo</dt><dd>{detail.vehicleReference}</dd></div>
                  <div><dt>Cliente verificado</dt><dd>{detail.verifiedCustomerLabel ?? 'Sin etiqueta disponible'}</dd></div>
                  <div><dt>Tipo de evento</dt><dd>{detail.eventType}</dd></div>
                  <div><dt>Ocurrido</dt><dd>{formatDate(detail.occurredAt)}</dd></div>
                  <div><dt>Ubicación</dt><dd>{detail.locationText}</dd></div>
                </dl>
                <div className="operator-description"><strong>Descripción</strong><p>{detail.description}</p></div>
              </section>

              <section className="operator-panel" aria-labelledby="evidence-title">
                <div className="panel-heading"><h2 id="evidence-title">Evidencia protegida</h2><span>{detail.evidence.length} archivo(s)</span></div>
                {evidenceFailure && <OperatorApiErrorNotice failure={evidenceFailure} />}
                {detail.evidence.length === 0 ? (
                  <div className="empty-state">No hay evidencia asociada a este siniestro.</div>
                ) : (
                  <ul className="evidence-list">
                    {detail.evidence.map((evidence) => (
                      <li key={evidence.evidenceId}>
                        <div><strong>{evidence.displayFilename ?? 'Evidencia sin nombre'}</strong><span>{evidence.mediaType} · {formatBytes(evidence.sizeBytes)}</span></div>
                        <button className="btn btn-secondary" type="button" disabled={downloadingEvidenceId === evidence.evidenceId} onClick={() => void downloadEvidence(evidence)}>
                          {downloadingEvidenceId === evidence.evidenceId ? 'Descargando…' : 'Descargar'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="operator-panel" aria-labelledby="history-title">
                <h2 id="history-title">Historial de estados</h2>
                {detail.history.length === 0 ? <div className="empty-state">No hay eventos de estado disponibles.</div> : (
                  <ol className="operator-timeline">
                    {detail.history.map((entry, index) => (
                      <li key={`${entry.occurredAt}-${index}`}>
                        <strong>{statusLabel(entry.toStatus)}</strong>
                        <span>{entry.fromStatus ? `${statusLabel(entry.fromStatus)} → ` : ''}{statusLabel(entry.toStatus)}</span>
                        <time dateTime={entry.occurredAt}>{formatDate(entry.occurredAt)}</time>
                        <small>{entry.actorType === 'OPERATOR' ? 'Operador' : 'Sistema'}</small>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className="operator-panel" aria-labelledby="audit-title">
                <h2 id="audit-title">Auditoría visible para operador autorizado</h2>
                {detail.auditEvents.length === 0 ? <div className="empty-state">No hay eventos de auditoría disponibles.</div> : (
                  <ul className="audit-list">
                    {detail.auditEvents.map((event, index) => (
                      <li key={`${event.eventCode}-${event.occurredAt}-${index}`}>
                        <strong>{event.eventCode}</strong>
                        <span>{event.outcome} · {event.actorType}</span>
                        <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
                        {event.requestId && <small>Request ID: {event.requestId}</small>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="operator-detail-aside" aria-labelledby="transition-title">
              <section className="operator-panel operator-sticky-panel">
                <span className="eyebrow">Acción controlada</span>
                <h2 id="transition-title">Cambiar estado</h2>
                <p>Las opciones siguientes son exactamente las `allowedTransitions` devueltas por el servidor.</p>
                {transitionFailure && <OperatorApiErrorNotice failure={transitionFailure} />}
                {detail.allowedTransitions.length === 0 ? (
                  <div className="empty-state">El API no ofrece transiciones desde el estado actual.</div>
                ) : (
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    if (!selectedTransition) return;
                    setTransitionFailure(null);
                    transitionMutation.mutate({ expectedFromStatus: detail.status, toStatus: selectedTransition });
                  }}>
                    <label htmlFor="transition-target">Nuevo estado</label>
                    <select id="transition-target" value={selectedTransition} onChange={(event) => setSelectedTransition(event.target.value as ClaimStatus | '')} required>
                      <option value="">Seleccionar…</option>
                      {detail.allowedTransitions.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                    <button className="btn btn-cyan" type="submit" disabled={!selectedTransition || transitionMutation.isPending}>
                      {transitionMutation.isPending ? 'Enviando…' : 'Confirmar transición'}
                    </button>
                  </form>
                )}
                <div className="operator-concurrency-note">Se envía `expectedFromStatus = {detail.status}`. Un 409 obliga a refrescar y decidir nuevamente, nunca a repetir automáticamente la mutación.</div>
              </section>
            </aside>
          </div>
        )}
      </main>
    </OperatorShell>
  );
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
