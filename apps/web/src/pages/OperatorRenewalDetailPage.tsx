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
import '../r3-ui-increment-06.css';

export function OperatorRenewalDetailPage() {
  const { renewalId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();

  const renewalQuery = useQuery({
    queryKey: ['operator', 'renewal', renewalId],
    queryFn: () => getRenewal(renewalId, session!.accessToken),
    enabled: Boolean(session && renewalId),
  });

  const refreshCase = async () => {
    await queryClient.invalidateQueries({ queryKey: ['operator', 'renewal', renewalId] });
    await queryClient.invalidateQueries({ queryKey: ['operator', 'renewals'] });
  };

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await renewalQuery.refetch();
  };

  const transitionMutation = useMutation({
    mutationFn: (toStatus: RenewalTerminalStatus) => transitionRenewal(
      renewalId,
      { toStatus, expectedVersion: renewalQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: refreshCase,
    onError: handleMutationError,
  });

  const pipelineMutation = useMutation({
    mutationFn: (toStageKey: string) => moveRenewalStage(
      renewalId,
      { toStageKey, expectedVersion: renewalQuery.data!.data.pipeline!.version },
      session!.accessToken,
    ),
    onSuccess: refreshCase,
    onError: handleMutationError,
  });

  const failure = renewalQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const renewal = renewalQuery.data?.data;
  const canManage = hasPermission(session.operator.role, 'renewals.manage');
  const canReadCustomers = hasPermission(session.operator.role, 'customers.read');
  const canReadPolicies = hasPermission(session.operator.role, 'policies.read');
  const mutationFailure = (transitionMutation.error ?? pipelineMutation.error) as ApiFailure | null;
  const mutationPending = transitionMutation.isPending || pipelineMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main renewal-main r3-renewal-detail">
        <div className="r3-case-breadcrumbs"><Link to="/operator/renewals">Renovaciones</Link><span>/</span><span>Caso</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {renewalQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando caso de renovación…</div>
        ) : !renewal ? null : (
          <>
            <section className="r3-case-hero" aria-labelledby="renewal-title">
              <div>
                <span className="ops-kicker">Renewal Operations R3</span>
                <h1 id="renewal-title">{renewal.customer?.displayName ?? 'Caso de renovación'}</h1>
                <p>{renewal.policy?.policyReference ?? renewal.policyId}</p>
                <div className="r3-case-hero-meta">
                  <RenewalStatus value={renewal.status} />
                  <span>Actualizado {formatDateTime(renewal.updatedAt)}</span>
                </div>
              </div>
              <div className="r3-case-hero-side">
                <small>Etapa operativa</small>
                <strong>{renewal.pipeline?.currentStage?.displayName ?? 'Sin work item'}</strong>
                <span>Lifecycle y pipeline permanecen independientes</span>
              </div>
            </section>

            <div className="r3-case-detail-grid">
              <section className="ops-panel r3-case-context-card" aria-labelledby="renewal-context-title">
                <div className="ops-panel-heading"><div><h2 id="renewal-context-title">Contexto relacionado</h2><p>Acceso al cliente y a la póliza sin duplicar sus vistas 360.</p></div></div>
                <div className="r3-case-context-grid">
                  <div>
                    <span>Cliente</span>
                    <strong>{renewal.customer?.displayName ?? 'No resuelto'}</strong>
                    <small>{renewal.customer?.customerRef ?? renewal.customerId}</small>
                    {canReadCustomers ? <Link to={`/operator/customers/${renewal.customerId}`}>Abrir Cliente 360 →</Link> : <em>Sin permiso para Cliente 360</em>}
                  </div>
                  <div>
                    <span>Póliza</span>
                    <strong>{renewal.policy?.policyReference ?? 'No resuelta'}</strong>
                    <small>{renewal.policy?.insurerReference ?? renewal.policyId}</small>
                    {canReadPolicies ? <Link to={`/operator/policies/${renewal.policyId}`}>Abrir Póliza 360 →</Link> : <em>Sin permiso para Póliza 360</em>}
                  </div>
                </div>
                <div className="r3-case-dates">
                  <div><span>Creada</span><strong>{formatDateTime(renewal.createdAt)}</strong></div>
                  <div><span>Completada</span><strong>{renewal.completedAt ? formatDateTime(renewal.completedAt) : '—'}</strong></div>
                  <div><span>Cancelada</span><strong>{renewal.cancelledAt ? formatDateTime(renewal.cancelledAt) : '—'}</strong></div>
                </div>
              </section>

              <section className="ops-panel r3-case-lifecycle-card" aria-labelledby="renewal-lifecycle-title">
                <div className="ops-panel-heading"><div><h2 id="renewal-lifecycle-title">Lifecycle</h2><p>Estado de negocio gobernado por las transiciones publicadas por el servidor.</p></div></div>
                <div className="r3-case-lifecycle-state"><RenewalStatus value={renewal.status} /></div>
                {renewal.status === 'OPEN' && canManage ? (
                  <div className="r3-case-decision-row">
                    {renewal.allowedTransitions.map((status) => (
                      <button
                        key={status}
                        className={`r3-case-decision is-${status.toLowerCase()}`}
                        type="button"
                        disabled={mutationPending}
                        onClick={() => transitionMutation.mutate(status)}
                      >
                        {status === 'COMPLETED' ? 'Completar renovación' : 'Cancelar renovación'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="r3-case-readonly-note">{renewal.status === 'OPEN' ? 'Tu rol puede leer este caso, pero no cambiar su lifecycle.' : 'El caso está en un estado terminal y no admite nuevas transiciones.'}</p>
                )}
              </section>
            </div>

            <section className="ops-panel r3-case-pipeline-card" aria-labelledby="renewal-pipeline-title">
              <div className="ops-panel-heading">
                <div><h2 id="renewal-pipeline-title">Pipeline operativo</h2><p>La etapa actual conserva su nombre visible. Los destinos siguientes se muestran como claves únicamente porque el contrato no publica sus nombres.</p></div>
              </div>

              {!renewal.pipeline ? (
                <div className="ops-compact-empty">El caso no tiene un work item operativo disponible.</div>
              ) : (
                <div className="r3-case-pipeline-layout">
                  <div className="r3-case-current-stage">
                    <span>Etapa actual</span>
                    <strong>{renewal.pipeline.currentStage?.displayName ?? 'No resuelta'}</strong>
                    {renewal.pipeline.currentStage?.stageKey && <small className="r3-case-tech-line">Clave: {renewal.pipeline.currentStage.stageKey}</small>}
                  </div>
                  <div className="r3-case-next-stages">
                    <span>Próximas etapas permitidas</span>
                    {renewal.pipeline.allowedNextStageKeys.length === 0 ? (
                      <p>No hay movimientos siguientes publicados por la versión fijada.</p>
                    ) : canManage ? (
                      <div className="r3-case-stage-actions">
                        {renewal.pipeline.allowedNextStageKeys.map((stageKey) => (
                          <button key={stageKey} type="button" disabled={mutationPending} onClick={() => pipelineMutation.mutate(stageKey)}>
                            Mover a <code>{stageKey}</code>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="r3-case-stage-list">{renewal.pipeline.allowedNextStageKeys.map((stageKey) => <code key={stageKey}>{stageKey}</code>)}</div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <p className="r3-case-contract-note">Control de concurrencia activo · versión de caso v{renewal.version}{renewal.pipeline ? ` · work item v${renewal.pipeline.version}` : ''}. En conflicto 409 la vista vuelve a consultar el servidor.</p>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function RenewalStatus({ value }: { value: RenewalCaseStatus }) {
  const labels: Record<RenewalCaseStatus, string> = { OPEN: 'Abierta', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
  return <span className={`r3-case-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
