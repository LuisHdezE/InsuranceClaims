import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getRenewal, moveRenewalStage, transitionRenewal } from '../api/renewals';
import type { RenewalCaseStatus, RenewalTerminalStatus } from '../api/renewals-types';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorRenewalDetailPage() {
  const { renewalId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();

  const renewalQuery = useQuery({
    queryKey: ['operator', 'renewal', renewalId],
    queryFn: () => getRenewal(renewalId, session!.accessToken),
    enabled: Boolean(session && renewalId),
  });

  const transitionMutation = useMutation({
    mutationFn: (toStatus: RenewalTerminalStatus) => transitionRenewal(
      renewalId,
      { toStatus, expectedVersion: renewalQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operator', 'renewal', renewalId] });
      await queryClient.invalidateQueries({ queryKey: ['operator', 'renewals'] });
    },
    onError: async (error: ApiFailure) => {
      if (error.problem?.status === 401) signOut();
      if (error.problem?.status === 409) await renewalQuery.refetch();
    },
  });

  const pipelineMutation = useMutation({
    mutationFn: (toStageKey: string) => moveRenewalStage(
      renewalId,
      { toStageKey, expectedVersion: renewalQuery.data!.data.pipeline!.version },
      session!.accessToken,
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['operator', 'renewal', renewalId] });
      await queryClient.invalidateQueries({ queryKey: ['operator', 'renewals'] });
    },
    onError: async (error: ApiFailure) => {
      if (error.problem?.status === 401) signOut();
      if (error.problem?.status === 409) await renewalQuery.refetch();
    },
  });

  const failure = renewalQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const renewal = renewalQuery.data?.data;
  const canManage = hasPermission(session.operator.role, 'renewals.manage');
  const mutationFailure = (transitionMutation.error ?? pipelineMutation.error) as ApiFailure | null;

  return (
    <OperatorShell>
      <main className="operator-main ops-main renewal-main renewal-detail-main">
        <div className="renewal-breadcrumbs"><Link to="/operator/renewals">Renovaciones</Link><span>/</span><span>{renewalId.slice(0, 8) || 'Caso'}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {renewalQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando caso de renovación…</div>
        ) : !renewal ? null : (
          <>
            <section className="renewal-hero" aria-labelledby="renewal-title">
              <div>
                <span className="ops-kicker">Renewal Operations R3</span>
                <h1 id="renewal-title">{renewal.customer?.displayName ?? 'Caso de renovación'}</h1>
                <p>{renewal.policy?.policyReference ?? renewal.policyId}</p>
                <div className="renewal-hero-meta">
                  <RenewalStatus value={renewal.status} />
                  <span>Lifecycle v{renewal.version}</span>
                  <span>Actualizado {formatDateTime(renewal.updatedAt)}</span>
                </div>
              </div>
              <div className="renewal-hero-orbit" aria-hidden="true">
                <span>{renewal.pipeline?.currentStage?.sortOrder ?? 'R3'}</span>
                <small>{renewal.pipeline ? `pipeline v${renewal.pipeline.version}` : 'sin pipeline'}</small>
              </div>
            </section>

            <div className="renewal-detail-grid">
              <section className="ops-panel renewal-context-card" aria-labelledby="renewal-context-title">
                <div className="ops-panel-heading"><div><h2 id="renewal-context-title">Contexto 360</h2><p>Referencias devueltas por el caso R3.</p></div></div>
                <div className="renewal-context-grid">
                  <div><span>Cliente</span><strong>{renewal.customer?.displayName ?? 'No resuelto'}</strong><code>{renewal.customer?.customerRef ?? renewal.customerId}</code><Link to={`/operator/customers/${renewal.customerId}`}>Abrir Customer 360 →</Link></div>
                  <div><span>Póliza</span><strong>{renewal.policy?.policyReference ?? 'No resuelta'}</strong><code>{renewal.policy?.insurerReference ?? renewal.policyId}</code><Link to={`/operator/policies/${renewal.policyId}`}>Abrir Policy 360 →</Link></div>
                </div>
                <div className="renewal-dates">
                  <div><span>Creada</span><strong>{formatDateTime(renewal.createdAt)}</strong></div>
                  <div><span>Completada</span><strong>{renewal.completedAt ? formatDateTime(renewal.completedAt) : '—'}</strong></div>
                  <div><span>Cancelada</span><strong>{renewal.cancelledAt ? formatDateTime(renewal.cancelledAt) : '—'}</strong></div>
                </div>
              </section>

              <section className="ops-panel renewal-lifecycle-card" aria-labelledby="renewal-lifecycle-title">
                <div className="ops-panel-heading"><div><h2 id="renewal-lifecycle-title">Lifecycle</h2><p>Estado de negocio separado del pipeline operativo.</p></div></div>
                <div className="renewal-lifecycle-state"><RenewalStatus value={renewal.status} /><span>Versión esperada: <strong>{renewal.version}</strong></span></div>
                {renewal.status === 'OPEN' && canManage ? (
                  <div className="renewal-decision-row">
                    {renewal.allowedTransitions.map((status) => (
                      <button
                        key={status}
                        className={`renewal-decision is-${status.toLowerCase()}`}
                        type="button"
                        disabled={transitionMutation.isPending || pipelineMutation.isPending}
                        onClick={() => transitionMutation.mutate(status)}
                      >
                        {status === 'COMPLETED' ? 'Completar renovación' : 'Cancelar renovación'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="renewal-readonly-note">{renewal.status === 'OPEN' ? 'Tu rol puede leer este caso, pero no cambiar su lifecycle.' : 'El caso está en un estado terminal y no admite nuevas transiciones.'}</p>
                )}
              </section>
            </div>

            <section className="ops-panel renewal-pipeline-card" aria-labelledby="renewal-pipeline-title">
              <div className="ops-panel-heading">
                <div><h2 id="renewal-pipeline-title">Pipeline operativo</h2><p>Movimiento gobernado por la versión fijada del pipeline; los destinos vienen del servidor.</p></div>
                {renewal.pipeline && <span className="renewal-version-chip">work item v{renewal.pipeline.version}</span>}
              </div>

              {!renewal.pipeline ? (
                <div className="ops-compact-empty">El caso no tiene un work item operativo disponible.</div>
              ) : (
                <div className="renewal-pipeline-layout">
                  <div className="renewal-current-stage">
                    <span>Etapa actual</span>
                    <strong>{renewal.pipeline.currentStage?.displayName ?? 'No resuelta'}</strong>
                    <code>{renewal.pipeline.currentStage?.stageKey ?? '—'}</code>
                    <small>Pipeline version: {renewal.pipeline.pipelineVersionId}</small>
                  </div>
                  <div className="renewal-next-stages">
                    <span>Próximas etapas permitidas</span>
                    {renewal.pipeline.allowedNextStageKeys.length === 0 ? (
                      <p>No hay movimientos siguientes publicados por la versión fijada.</p>
                    ) : canManage ? (
                      <div className="renewal-stage-actions">
                        {renewal.pipeline.allowedNextStageKeys.map((stageKey) => (
                          <button
                            key={stageKey}
                            type="button"
                            disabled={pipelineMutation.isPending || transitionMutation.isPending}
                            onClick={() => pipelineMutation.mutate(stageKey)}
                          >
                            {stageKey}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="renewal-stage-list">{renewal.pipeline.allowedNextStageKeys.map((stageKey) => <code key={stageKey}>{stageKey}</code>)}</div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function RenewalStatus({ value }: { value: RenewalCaseStatus }) {
  const labels: Record<RenewalCaseStatus, string> = { OPEN: 'Abierta', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
  return <span className={`renewal-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
