import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  getCollection,
  moveCollectionStage,
  transitionCollection,
  updateCollectionPaymentState,
} from '../api/collections';
import type { CollectionCaseStatus, CollectionTerminalStatus } from '../api/collections-types';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorCollectionDetailPage() {
  const { collectionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();
  const [paymentState, setPaymentState] = useState('');

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

  const paymentMutation = useMutation({
    mutationFn: (requestedPaymentState: string) => updateCollectionPaymentState(
      collectionId,
      { paymentState: requestedPaymentState, expectedVersion: collectionQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: async () => {
      setPaymentState('');
      await refreshCase();
    },
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
  const mutationFailure = (transitionMutation.error ?? paymentMutation.error ?? pipelineMutation.error) as ApiFailure | null;
  const mutationPending = transitionMutation.isPending || paymentMutation.isPending || pipelineMutation.isPending;

  const submitPaymentState = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = paymentState.trim();
    if (!normalized || normalized.length > 80) return;
    paymentMutation.mutate(normalized);
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main collection-main collection-detail-main">
        <div className="collection-breadcrumbs"><Link to="/operator/collections">Cobranzas</Link><span>/</span><span>{collectionId.slice(0, 8) || 'Caso'}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {collectionQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando caso de cobranza…</div>
        ) : !collection ? null : (
          <>
            <section className="collection-hero" aria-labelledby="collection-title">
              <div>
                <span className="ops-kicker">Collections Operations R3</span>
                <h1 id="collection-title">{collection.customer?.displayName ?? 'Caso de cobranza'}</h1>
                <p>{collection.policy?.policyReference ?? collection.policyId}</p>
                <div className="collection-hero-meta">
                  <CollectionStatus value={collection.status} />
                  <span>Lifecycle/Pago v{collection.version}</span>
                  <span>Actualizado {formatDateTime(collection.updatedAt)}</span>
                </div>
              </div>
              <div className="collection-hero-state">
                <small>Estado de pago autoritativo</small>
                <strong>{collection.paymentState ?? 'Sin estado'}</strong>
                <span>{collection.pipeline ? `pipeline v${collection.pipeline.version}` : 'sin pipeline'}</span>
              </div>
            </section>

            <div className="collection-detail-grid">
              <section className="ops-panel collection-context-card" aria-labelledby="collection-context-title">
                <div className="ops-panel-heading"><div><h2 id="collection-context-title">Contexto 360</h2><p>Referencias devueltas por el caso R3.</p></div></div>
                <div className="collection-context-grid">
                  <div><span>Cliente</span><strong>{collection.customer?.displayName ?? 'No resuelto'}</strong><code>{collection.customer?.customerRef ?? collection.customerId}</code><Link to={`/operator/customers/${collection.customerId}`}>Abrir Customer 360 →</Link></div>
                  <div><span>Póliza</span><strong>{collection.policy?.policyReference ?? 'No resuelta'}</strong><code>{collection.policy?.insurerReference ?? collection.policyId}</code><Link to={`/operator/policies/${collection.policyId}`}>Abrir Policy 360 →</Link></div>
                </div>
                <div className="collection-dates">
                  <div><span>Creada</span><strong>{formatDateTime(collection.createdAt)}</strong></div>
                  <div><span>Completada</span><strong>{collection.completedAt ? formatDateTime(collection.completedAt) : '—'}</strong></div>
                  <div><span>Cancelada</span><strong>{collection.cancelledAt ? formatDateTime(collection.cancelledAt) : '—'}</strong></div>
                </div>
              </section>

              <section className="ops-panel collection-lifecycle-card" aria-labelledby="collection-lifecycle-title">
                <div className="ops-panel-heading"><div><h2 id="collection-lifecycle-title">Lifecycle</h2><p>Estado del caso separado del pago y del pipeline operativo.</p></div></div>
                <div className="collection-lifecycle-state"><CollectionStatus value={collection.status} /><span>Versión esperada: <strong>{collection.version}</strong></span></div>
                {collection.status === 'OPEN' && canManage ? (
                  <div className="collection-decision-row">
                    {collection.allowedTransitions.map((status) => (
                      <button
                        key={status}
                        className={`collection-decision is-${status.toLowerCase()}`}
                        type="button"
                        disabled={mutationPending}
                        onClick={() => transitionMutation.mutate(status)}
                      >
                        {status === 'COMPLETED' ? 'Completar cobranza' : 'Cancelar cobranza'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="collection-readonly-note">{collection.status === 'OPEN' ? 'Tu rol puede leer este caso, pero no cambiar su lifecycle.' : 'El caso está en un estado terminal y no admite nuevas transiciones de lifecycle.'}</p>
                )}
              </section>
            </div>

            <section className="ops-panel collection-payment-card" aria-labelledby="collection-payment-title">
              <div className="ops-panel-heading">
                <div><h2 id="collection-payment-title">Estado de pago verificado</h2><p>El valor no es una semántica definida por la UI. El servidor solo acepta códigos presentes en su allowlist configurada.</p></div>
                <span className="collection-version-chip">case v{collection.version}</span>
              </div>
              <div className="collection-payment-layout">
                <div className="collection-payment-current">
                  <span>Valor actual</span>
                  <strong>{collection.paymentState ?? 'Sin estado'}</strong>
                  <small>La API R3 no publica el catálogo configurado de valores aprobados.</small>
                </div>
                {canManage ? (
                  <form className="collection-payment-form" onSubmit={submitPaymentState}>
                    <label htmlFor="collection-payment-state">Código de estado aprobado por el servidor</label>
                    <div>
                      <input
                        id="collection-payment-state"
                        value={paymentState}
                        maxLength={80}
                        autoComplete="off"
                        placeholder="Valor configurado en el servidor"
                        onChange={(event) => setPaymentState(event.target.value)}
                      />
                      <button type="submit" disabled={mutationPending || !paymentState.trim() || paymentState.trim() === collection.paymentState}>Verificar y aplicar</button>
                    </div>
                    <small>No se muestran opciones inventadas. Un valor no aprobado falla cerrado con VALIDATION_ERROR.</small>
                  </form>
                ) : (
                  <p className="collection-readonly-note">Tu rol puede consultar el estado de pago, pero no solicitar cambios.</p>
                )}
              </div>
            </section>

            <section className="ops-panel collection-pipeline-card" aria-labelledby="collection-pipeline-title">
              <div className="ops-panel-heading">
                <div><h2 id="collection-pipeline-title">Pipeline operativo</h2><p>Movimiento gobernado por la versión fijada del pipeline; los destinos vienen del servidor.</p></div>
                {collection.pipeline && <span className="collection-version-chip">work item v{collection.pipeline.version}</span>}
              </div>

              {!collection.pipeline ? (
                <div className="ops-compact-empty">El caso no tiene un work item operativo disponible.</div>
              ) : (
                <div className="collection-pipeline-layout">
                  <div className="collection-current-stage">
                    <span>Etapa actual</span>
                    <strong>{collection.pipeline.currentStage?.displayName ?? 'No resuelta'}</strong>
                    <code>{collection.pipeline.currentStage?.stageKey ?? '—'}</code>
                    <small>Pipeline version: {collection.pipeline.pipelineVersionId}</small>
                  </div>
                  <div className="collection-next-stages">
                    <span>Próximas etapas permitidas</span>
                    {collection.pipeline.allowedNextStageKeys.length === 0 ? (
                      <p>No hay movimientos siguientes publicados por la versión fijada.</p>
                    ) : canManage ? (
                      <div className="collection-stage-actions">
                        {collection.pipeline.allowedNextStageKeys.map((stageKey) => (
                          <button
                            key={stageKey}
                            type="button"
                            disabled={mutationPending}
                            onClick={() => pipelineMutation.mutate(stageKey)}
                          >
                            {stageKey}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="collection-stage-list">{collection.pipeline.allowedNextStageKeys.map((stageKey) => <code key={stageKey}>{stageKey}</code>)}</div>
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

function CollectionStatus({ value }: { value: CollectionCaseStatus }) {
  const labels: Record<CollectionCaseStatus, string> = { OPEN: 'Abierta', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
  return <span className={`collection-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
