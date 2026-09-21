import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDeadLetter, requeueDeadLetter, resolveDeadLetter } from '../api/recovery-admin';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

type RecoveryAction = 'requeue' | 'resolve';

export function AdminDeadLetterDetailPage() {
  const { deadLetterId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [confirmationAction, setConfirmationAction] = useState<RecoveryAction | null>(null);
  const lastTriggerAction = useRef<RecoveryAction | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const requeueTriggerRef = useRef<HTMLButtonElement>(null);
  const resolveTriggerRef = useRef<HTMLButtonElement>(null);

  const detailQuery = useQuery({
    queryKey: ['admin', 'recovery', 'dead-letter', deadLetterId],
    queryFn: () => getDeadLetter(deadLetterId, session!.accessToken),
    enabled: Boolean(session && deadLetterId),
  });

  const closeConfirmation = () => setConfirmationAction(null);

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await detailQuery.refetch();
    closeConfirmation();
  };

  const requeueMutation = useMutation({
    mutationFn: () => requeueDeadLetter(
      deadLetterId,
      { expectedVersion: detailQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: () => navigate('/operator/admin/recovery', { replace: true }),
    onError: handleMutationError,
  });

  const resolveMutation = useMutation({
    mutationFn: () => resolveDeadLetter(
      deadLetterId,
      { expectedVersion: detailQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: () => navigate('/operator/admin/recovery', { replace: true }),
    onError: handleMutationError,
  });

  const failure = detailQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  useEffect(() => {
    if (confirmationAction) {
      confirmButtonRef.current?.focus();
      return;
    }

    const previousAction = lastTriggerAction.current;
    if (!previousAction) return;
    const trigger = previousAction === 'requeue' ? requeueTriggerRef.current : resolveTriggerRef.current;
    trigger?.focus();
    lastTriggerAction.current = null;
  }, [confirmationAction]);

  if (!session) return null;

  const item = detailQuery.data?.data;
  const canManage = hasPermission(session.operator.role, 'operations.dead_letters.manage');
  const mutationFailure = (requeueMutation.error ?? resolveMutation.error) as ApiFailure | null;
  const mutationPending = requeueMutation.isPending || resolveMutation.isPending;

  const openConfirmation = (action: RecoveryAction) => {
    lastTriggerAction.current = action;
    setConfirmationAction(action);
  };

  const runConfirmedAction = () => {
    if (confirmationAction === 'requeue') requeueMutation.mutate();
    if (confirmationAction === 'resolve') resolveMutation.mutate();
  };

  const confirmationTitle = confirmationAction === 'requeue'
    ? 'Confirmar reencolado'
    : 'Confirmar resolución administrativa';
  const confirmationDescription = confirmationAction === 'requeue'
    ? 'El trabajo volverá a la cola para un nuevo intento. Esta acción no se ejecutará hasta que confirmes.'
    : 'El trabajo se cerrará administrativamente y no será reencolado. Esta acción no se ejecutará hasta que confirmes.';

  return (
    <OperatorShell>
      <main className="operator-main ops-main recovery-admin-main">
        <div className="recovery-breadcrumbs"><Link to="/operator/admin/recovery">Recovery</Link><span>/</span><span>{deadLetterId.slice(0, 8)}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {detailQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando dead letter…</div>
        ) : !item ? null : (
          <>
            <section className="recovery-admin-hero" aria-labelledby="dead-letter-detail-title">
              <div>
                <span className="ops-kicker">Dead Letter R3</span>
                <h1 id="dead-letter-detail-title">{item.jobType}</h1>
                <div className="recovery-detail-meta">
                  <code>{item.deadLetterId}</code>
                  <span className="recovery-status is-dead-letter">{item.status}</span>
                </div>
              </div>
              <div className="recovery-version-card">
                <small>Versión optimista</small>
                <strong>v{item.version}</strong>
                <span>{item.attemptCount} / {item.maxAttempts} intentos</span>
              </div>
            </section>

            <section className="ops-panel recovery-detail-panel" aria-labelledby="dead-letter-facts-title">
              <div className="ops-panel-heading">
                <div><h2 id="dead-letter-facts-title">Proyección autoritativa</h2><p>Solo se muestran campos publicados por R3.</p></div>
                <button className="ops-refresh-button" type="button" disabled={detailQuery.isFetching} onClick={() => void detailQuery.refetch()}>
                  {detailQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>
              <dl className="recovery-facts is-detail">
                <div><dt>Tipo de job</dt><dd>{item.jobType}</dd></div>
                <div><dt>Estado</dt><dd>{item.status}</dd></div>
                <div><dt>Intentos</dt><dd>{item.attemptCount} / {item.maxAttempts}</dd></div>
                <div><dt>Disponible desde</dt><dd>{formatDateTime(item.availableAt)}</dd></div>
                <div><dt>Categoría de fallo</dt><dd>{item.failureCategory ?? '—'}</dd></div>
                <div><dt>ID de correlación</dt><dd>{item.correlationId ? <code>{item.correlationId}</code> : '—'}</dd></div>
                <div><dt>Completado</dt><dd>{item.completedAt ? formatDateTime(item.completedAt) : '—'}</dd></div>
                <div><dt>Versión</dt><dd>v{item.version}</dd></div>
              </dl>
            </section>

            <section className="ops-panel recovery-actions-panel" aria-labelledby="dead-letter-actions-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="dead-letter-actions-title">Resolución administrativa</h2>
                  <p>Ambas mutaciones usan <code>expectedVersion {item.version}</code> y quedan auditadas por el backend.</p>
                </div>
              </div>

              {canManage ? (
                <>
                  <div className="recovery-actions">
                    <button
                      ref={requeueTriggerRef}
                      className="recovery-action-button is-requeue"
                      type="button"
                      disabled={mutationPending || confirmationAction !== null}
                      aria-haspopup="dialog"
                      aria-expanded={confirmationAction === 'requeue'}
                      onClick={() => openConfirmation('requeue')}
                    >
                      {requeueMutation.isPending ? 'Reencolando…' : 'Reencolar para nuevo intento'}
                    </button>
                    <button
                      ref={resolveTriggerRef}
                      className="recovery-action-button is-resolve"
                      type="button"
                      disabled={mutationPending || confirmationAction !== null}
                      aria-haspopup="dialog"
                      aria-expanded={confirmationAction === 'resolve'}
                      onClick={() => openConfirmation('resolve')}
                    >
                      {resolveMutation.isPending ? 'Resolviendo…' : 'Resolver administrativamente'}
                    </button>
                  </div>

                  {confirmationAction && (
                    <div
                      className={`recovery-confirmation is-${confirmationAction}`}
                      role="alertdialog"
                      aria-labelledby="recovery-confirmation-title"
                      aria-describedby="recovery-confirmation-description recovery-confirmation-version"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape' && !mutationPending) closeConfirmation();
                      }}
                    >
                      <div className="recovery-confirmation-copy">
                        <span className="recovery-confirmation-kicker">Confirmación requerida</span>
                        <h3 id="recovery-confirmation-title">{confirmationTitle}</h3>
                        <p id="recovery-confirmation-description">{confirmationDescription}</p>
                        <p id="recovery-confirmation-version" className="recovery-confirmation-version">
                          Se enviará <code>expectedVersion {item.version}</code>. Si la versión cambió, el 409 refrescará la proyección y no repetirá la mutación automáticamente.
                        </p>
                      </div>
                      <div className="recovery-confirmation-actions">
                        <button
                          className="recovery-confirmation-button is-cancel"
                          type="button"
                          disabled={mutationPending}
                          onClick={closeConfirmation}
                        >
                          Cancelar
                        </button>
                        <button
                          ref={confirmButtonRef}
                          className={`recovery-confirmation-button is-confirm is-${confirmationAction}`}
                          type="button"
                          disabled={mutationPending}
                          onClick={runConfirmedAction}
                        >
                          {confirmationAction === 'requeue'
                            ? (requeueMutation.isPending ? 'Reencolando…' : 'Sí, reencolar')
                            : (resolveMutation.isPending ? 'Resolviendo…' : 'Sí, resolver')}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="recovery-readonly-note">Modo lectura: falta <code>operations.dead_letters.manage</code>.</div>
              )}

              <div className="recovery-admin-contract-note">
                <strong>Concurrencia R3</strong>
                <p>Si el registro cambia antes de la mutación, un 409 fuerza refetch de la proyección vigente. No se reintenta automáticamente con una versión vieja.</p>
              </div>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
