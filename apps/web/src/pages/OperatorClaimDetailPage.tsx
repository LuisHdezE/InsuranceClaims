import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getClaimDetail, transitionClaimStatus } from '../api/claims';
import type { ApiFailure, ClaimStatus, OperatorClaimDetailResponse } from '../api/types';
import { ClaimEvidenceAttentionPanel } from '../components/ClaimEvidenceAttentionPanel';
import { ClaimOperationalStagePanel } from '../components/ClaimOperationalStagePanel';
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
        queryClient.invalidateQueries({ queryKey: ['operator', 'claims-operational-metrics'] }),
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

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-claim-detail-page">
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
                  queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'operational-projection'] }),
                  queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'timeline'] }),
                  queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'evidence-attention'] }),
                  queryClient.invalidateQueries({ queryKey: ['operator', 'claim', claimId, 'tasks'] }),
                ]);
              }}
              onPrimaryTransition={(toStatus) => {
                setTransitionFailure(null);
                transitionMutation.mutate({ expectedFromStatus: detail.status, toStatus });
              }}
            />

            <nav className="r3-detail-anchor-nav" aria-label="Secciones del siniestro">
              <a href="#resumen">Resumen</a>
              <a href="#flujo">Flujo</a>
              <a href="#etapa">Etapa operacional</a>
              <a href="#tareas">Tareas</a>
              <a href="#evidencia">Evidencia</a>
              <a href="#historial">Historial</a>
              <a href="#auditoria">Auditoría</a>
            </nav>

            {transitionFailure && <OperatorApiErrorNotice failure={transitionFailure} />}

            <div className="ops-detail-grid r3-claim-detail-grid">
              <section id="resumen" className="ops-panel ops-summary-card r3-detail-section" aria-labelledby="claim-summary-title">
                <div className="ops-panel-heading"><div><span className="ops-kicker">Resumen</span><h2 id="claim-summary-title">Información del siniestro</h2></div></div>
                <dl className="ops-summary-list">
                  <SummaryRow icon="◇" label="Tipo de evento" value={detail.eventType} />
                  <SummaryRow icon="◷" label="Fecha y hora" value={formatDate(detail.occurredAt)} />
                  <SummaryRow icon="⌖" label="Ubicación" value={detail.locationText} />
                  <SummaryRow icon="▱" label="Póliza" value={detail.policyReference} secondary={detail.verifiedCustomerLabel ?? 'Sin etiqueta de cliente disponible'} />
                  <SummaryRow icon="▰" label="Vehículo" value={detail.vehicleReference} />
                </dl>
                <div className="ops-detail-description"><span className="ops-summary-icon" aria-hidden="true">≡</span><div><strong>Descripción</strong><p>{detail.description}</p></div></div>
              </section>

              <section id="flujo" className="ops-panel ops-work-card r3-detail-section" aria-labelledby="transition-title">
                <div className="ops-panel-heading">
                  <div><span className="ops-kicker">Claim lifecycle</span><h2 id="transition-title">Estado y siguiente decisión</h2></div>
                  <span className={`status-badge status-${detail.status.toLowerCase()}`}>{statusLabel(detail.status)}</span>
                </div>

                <div className="ops-state-overview r3-state-overview">
                  <div><span>Estado autoritativo</span><strong>{statusLabel(detail.status)}</strong></div>
                  <div><span>Transiciones disponibles</span><strong>{detail.allowedTransitions.length}</strong></div>
                  <div><span>Actualizado</span><strong>{formatDate(detail.updatedAt)}</strong></div>
                </div>

                <div className="ops-task-contract-note is-live">
                  <strong>Claim lifecycle y Pipeline son dos autoridades diferentes.</strong>
                  <span>Esta decisión cambia `ClaimStatus`. La etapa operacional se gestiona en su panel propio y nunca se deriva visualmente de este estado.</span>
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
                    <button className="ops-primary-action" type="submit" disabled={!selectedTransition || transitionMutation.isPending}>{transitionMutation.isPending ? 'Enviando…' : 'Confirmar'}</button>
                  </div>
                </form>
                <div className="operator-concurrency-note">`allowedTransitions` proviene del servidor. Se envía `expectedFromStatus = {detail.status}`; un 409 refresca el detalle antes de una nueva decisión.</div>
              </section>

              <div id="etapa" className="r3-detail-section"><ClaimOperationalStagePanel claimId={claimId} trackingCode={detail.trackingCode} /></div>
              <div id="tareas" className="r3-detail-section"><ClaimTasksPanel claimId={claimId} /></div>
              <div id="evidencia" className="r3-detail-section"><ClaimEvidenceAttentionPanel claimId={claimId} /></div>
              <div id="historial" className="r3-detail-section"><ClaimTimelinePanel claimId={claimId} /></div>
            </div>

            <details id="auditoria" className="ops-audit-details r3-detail-section">
              <summary>Actividad técnica / auditoría <span>{detail.auditEvents.length} evento(s)</span></summary>
              <div className="ops-audit-table-wrap">
                {detail.auditEvents.length === 0 ? <div className="ops-compact-empty">No hay eventos de auditoría disponibles.</div> : (
                  <table className="ops-audit-table"><thead><tr><th>Fecha y hora</th><th>Evento</th><th>Actor</th><th>Resultado</th><th>Request ID</th></tr></thead><tbody>{detail.auditEvents.map((event, index) => <tr key={`${event.eventCode}-${event.occurredAt}-${index}`}><td>{formatDate(event.occurredAt)}</td><td><strong>{event.eventCode}</strong></td><td>{event.actorType}{event.actorId ? ` · ${event.actorId}` : ''}</td><td>{event.outcome}</td><td>{event.requestId ?? '—'}</td></tr>)}</tbody></table>
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
    <header className="ops-detail-header r3-detail-hero">
      <div className="ops-detail-identity"><h1>{detail.trackingCode}</h1><span>{detail.policyReference} · {detail.vehicleReference}</span></div>
      <div className="ops-detail-stage"><span>Claim lifecycle</span><strong>{statusLabel(detail.status)}</strong><small>Separado del Pipeline operacional</small></div>
      <div className="ops-detail-status"><span>Estado</span><strong className={`status-badge status-${detail.status.toLowerCase()}`}>{statusLabel(detail.status)}</strong></div>
      <div className="ops-detail-actions">
        {primary && <button className="ops-primary-action" type="button" disabled={busy} onClick={() => onPrimaryTransition(primary.status)}>▷ {busy ? 'Procesando…' : primary.label}</button>}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(status: ClaimStatus) {
  return ({ RECEIVED: 'Recibido', UNDER_REVIEW: 'En revisión', OBSERVED: 'Observado', APPROVED: 'Aprobado', IN_REPAIR: 'En reparación', CLOSED: 'Cerrado' } satisfies Record<ClaimStatus, string>)[status];
}
