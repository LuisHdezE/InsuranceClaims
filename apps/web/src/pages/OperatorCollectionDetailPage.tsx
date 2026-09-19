import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getCollection, moveCollectionStage, transitionCollection } from '../api/collections';
import type { CollectionCaseStatus, CollectionTerminalStatus } from '../api/collections-types';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-06.css';

export function OperatorCollectionDetailPage() {
  const { collectionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();

  const collectionQuery = useQuery({
    queryKey: ['operator', 'collection', collectionId],
    queryFn: () => getCollection(collectionId, session!.accessToken),
    enabled: Boolean(session && collectionId),
  });

  const refreshCase = async () => {
    await queryClient.invalidateQueries({ queryKey: ['operator', 'collection', collectionId] });
    await queryClient.invalidateQueries({ queryKey: ['operator', 'collections'] });
  };

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await collectionQuery.refetch();
  };

  const transitionMutation = useMutation({
    mutationFn: (toStatus: CollectionTerminalStatus) => transitionCollection(
      collectionId,
      { toStatus, expectedVersion: collectionQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: refreshCase,
    onError: handleMutationError,
  });

  const pipelineMutation = useMutation({
    mutationFn: (toStageKey: string) => moveCollectionStage(
      collectionId,
      { toStageKey, expectedVersion: collectionQuery.data!.data.pipeline!.version },
      session!.accessToken,
    ),
    onSuccess: refreshCase,
    onError: handleMutationError,
  });

  const failure = collectionQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const collection = collectionQuery.data?.data;
  const canManage = hasPermission(session.operator.role, 'collections.manage');
  const canReadCustomers = hasPermission(session.operator.role, 'customers.read');
  const canReadPolicies = hasPermission(session.operator.role, 'policies.read');
  const mutationFailure = (transitionMutation.error ?? pipelineMutation.error) as ApiFailure | null;
  const mutationPending = transitionMutation.isPending || pipelineMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main collection-main r3-collection-detail">
        <div className="r3-case-breadcrumbs"><Link to="/operator/collections">Cobranzas</Link><span>/</span><span>Caso</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {collectionQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando caso de cobranza…</div>
        ) : !collection ? null : (
          <>
            <section className="r3-case-hero" aria-labelledby="collection-title">
              <div>
                <span className="ops-kicker">Operaciones de cobranzas R3</span>
                <h1 id="collection-title">{collection.customer?.displayName ?? 'Caso de cobranza'}</h1>
                <p>{collection.policy?.policyReference ?? collection.policyId}</p>
                <div className="r3-case-hero-meta">
                  <CollectionStatus value={collection.status} />
                  <span>Actualizado {formatDateTime(collection.updatedAt)}</span>
                </div>
              </div>
              <div className="r3-case-hero-side">
                <small>Estado de pago autoritativo</small>
                <strong>{collection.paymentState ?? 'Sin estado'}</strong>
                <span>Etapa: {collection.pipeline?.currentStage?.displayName ?? 'Sin work item'}</span>
              </div>
            </section>

            <div className="r3-case-detail-grid">
              <section className="ops-panel r3-case-context-card" aria-labelledby="collection-context-title">
                <div className="ops-panel-heading"><div><h2 id="collection-context-title">Contexto relacionado</h2><p>Acceso al cliente y a la póliza sin duplicar sus vistas 360.</p></div></div>
                <div className="r3-case-context-grid">
                  <div>
                    <span>Cliente</span>
                    <strong>{collection.customer?.displayName ?? 'No resuelto'}</strong>
                    <small>{collection.customer?.customerRef ?? collection.customerId}</small>
                    {canReadCustomers ? <Link to={`/operator/customers/${collection.customerId}`}>Abrir Cliente 360 →</Link> : <em>Sin permiso para Cliente 360</em>}
                  </div>
                  <div>
                    <span>Póliza</span>
                    <strong>{collection.policy?.policyReference ?? 'No resuelta'}</strong>
                    <small>{collection.policy?.insurerReference ?? collection.policyId}</small>
                    {canReadPolicies ? <Link to={`/operator/policies/${collection.policyId}`}>Abrir Póliza 360 →</Link> : <em>Sin permiso para Póliza 360</em>}
                  </div>
                </div>
                <div className="r3-case-dates">
                  <div><span>Creada</span><strong>{formatDateTime(collection.createdAt)}</strong></div>
                  <div><span>Completada</span><strong>{collection.completedAt ? formatDateTime(collection.completedAt) : '—'}</strong></div>
                  <div><span>Cancelada</span><strong>{collection.cancelledAt ? formatDateTime(collection.cancelledAt) : '—'}</strong></div>
                </div>
              </section>

              <section className="ops-panel r3-case-lifecycle-card" aria-labelledby="collection-lifecycle-title">
                <div className="ops-panel-heading"><div><h2 id="collection-lifecycle-title">Ciclo de vida</h2><p>Estado del caso separado del pago y del pipeline operativo.</p></div></div>
                <div className="r3-case-lifecycle-state"><CollectionStatus value={collection.status} /></div>
                {collection.status === 'OPEN' && canManage ? (
                  <div className="r3-case-decision-row">
                    {collection.allowedTransitions.map((status) => (
                      <button
                        key={status}
                        className={`r3-case-decision is-${status.toLowerCase()}`}
                        type="button"
                        disabled={mutationPending}
                        onClick={() => transitionMutation.mutate(status)}
                      >
                        {status === 'COMPLETED' ? 'Completar cobranza' : 'Cancelar cobranza'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="r3-case-readonly-note">{collection.status === 'OPEN' ? 'Tu rol puede leer este caso, pero no cambiar su ciclo de vida.' : 'El caso está en un estado terminal y no admite nuevas transiciones.'}</p>
                )}
              </section>
            </div>

            <section className="ops-panel r3-payment-card" aria-labelledby="collection-payment-title">
              <div className="ops-panel-heading">
                <div><h2 id="collection-payment-title">Estado de pago</h2><p>Valor autoritativo publicado por el servidor, independiente del ciclo de vida del caso.</p></div>
              </div>
              <div className="r3-payment-current">
                <span>Valor actual</span>
                <strong>{collection.paymentState ?? 'Sin estado'}</strong>
                <p>La API R3 valida este valor contra una allowlist configurada, pero todavía no publica el catálogo permitido. Por eso esta interfaz no expone un selector ni una entrada manual de códigos.</p>
              </div>
            </section>

            <section className="ops-panel r3-case-pipeline-card" aria-labelledby="collection-pipeline-title">
              <div className="ops-panel-heading">
                <div><h2 id="collection-pipeline-title">Pipeline operativo</h2><p>La etapa actual conserva su nombre visible. Los destinos siguientes permanecen como claves porque el contrato solo publica sus keys.</p></div>
              </div>

              {!collection.pipeline ? (
                <div className="ops-compact-empty">El caso no tiene un work item operativo disponible.</div>
              ) : (
                <div className="r3-case-pipeline-layout">
                  <div className="r3-case-current-stage">
                    <span>Etapa actual</span>
                    <strong>{collection.pipeline.currentStage?.displayName ?? 'No resuelta'}</strong>
                    {collection.pipeline.currentStage?.stageKey && <small className="r3-case-tech-line">Clave: {collection.pipeline.currentStage.stageKey}</small>}
                  </div>
                  <div className="r3-case-next-stages">
                    <span>Próximas etapas permitidas</span>
                    {collection.pipeline.allowedNextStageKeys.length === 0 ? (
                      <p>No hay movimientos siguientes publicados por la versión fijada.</p>
                    ) : canManage ? (
                      <div className="r3-case-stage-actions">
                        {collection.pipeline.allowedNextStageKeys.map((stageKey) => (
                          <button key={stageKey} type="button" disabled={mutationPending} onClick={() => pipelineMutation.mutate(stageKey)}>
                            Mover a <code>{stageKey}</code>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="r3-case-stage-list">{collection.pipeline.allowedNextStageKeys.map((stageKey) => <code key={stageKey}>{stageKey}</code>)}</div>
                    )}
                  </div>
                </div>
              )}
            </section>

            <p className="r3-case-contract-note">Control de concurrencia activo · versión de caso v{collection.version}{collection.pipeline ? ` · work item v${collection.pipeline.version}` : ''}. En conflicto 409 la vista vuelve a consultar el servidor.</p>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function CollectionStatus({ value }: { value: CollectionCaseStatus }) {
  const labels: Record<CollectionCaseStatus, string> = { OPEN: 'Abierta', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
  return <span className={`r3-case-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
