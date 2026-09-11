import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getIntegrationEventStatus, listDeadLetters } from '../api/recovery-admin';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const PAGE_SIZE = 25;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function AdminRecoveryPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const [eventId, setEventId] = useState('');
  const [lookupClientError, setLookupClientError] = useState<string | null>(null);

  const role = session?.operator.role;
  const canReadDeadLetters = Boolean(role && hasPermission(role, 'operations.dead_letters.read'));
  const canReadIntegrations = Boolean(role && hasPermission(role, 'operations.integration.read'));

  const deadLettersQuery = useQuery({
    queryKey: ['admin', 'recovery', 'dead-letters', page],
    queryFn: () => listDeadLetters({ page, pageSize: PAGE_SIZE }, session!.accessToken),
    enabled: Boolean(session && canReadDeadLetters),
  });

  const integrationLookup = useMutation({
    mutationFn: (id: string) => getIntegrationEventStatus(id, session!.accessToken),
    onError: (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
    },
  });

  const deadLettersFailure = deadLettersQuery.error as ApiFailure | null;
  useEffect(() => {
    if (deadLettersFailure?.problem?.status === 401) signOut();
  }, [deadLettersFailure, signOut]);

  if (!session) return null;

  const deadLetters = deadLettersQuery.data?.data;
  const lookupFailure = integrationLookup.error as ApiFailure | null;
  const event = integrationLookup.data?.data;
  const totalPages = Math.max(1, deadLetters?.totalPages ?? 1);

  const submitLookup = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const value = eventId.trim();
    setLookupClientError(null);
    integrationLookup.reset();
    if (!UUID_PATTERN.test(value)) {
      setLookupClientError('Ingresa un eventId UUID válido. R3 no publica búsqueda por texto ni un directorio de Integration Events.');
      return;
    }
    integrationLookup.mutate(value);
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main recovery-admin-main">
        <section className="recovery-admin-hero" aria-labelledby="recovery-title">
          <div>
            <span className="ops-kicker">Recovery Operations R3</span>
            <h1 id="recovery-title">Integraciones y recuperación</h1>
            <p>Diagnóstico explícito de eventos y recuperación de trabajos en dead-letter, separado de la operación normal de Claims.</p>
          </div>
          <div className="recovery-admin-hero-badge">
            <strong>RECOVERY</strong>
            <span>API autoritativa · datos sintéticos</span>
          </div>
        </section>

        <section className="recovery-admin-grid">
          <article className="ops-panel recovery-lookup-panel" aria-labelledby="integration-lookup-title">
            <div className="ops-panel-heading">
              <div>
                <h2 id="integration-lookup-title">Diagnóstico de Integration Event</h2>
                <p>El contrato R3 expone consulta por <code>eventId</code>; no publica un listado administrativo.</p>
              </div>
            </div>

            {canReadIntegrations ? (
              <form className="recovery-event-form" onSubmit={submitLookup}>
                <label>
                  <span>eventId</span>
                  <input
                    value={eventId}
                    disabled={integrationLookup.isPending}
                    placeholder="88888888-8888-4888-8888-888888888888"
                    onChange={(e) => setEventId(e.target.value)}
                  />
                </label>
                <button type="submit" disabled={integrationLookup.isPending}>
                  {integrationLookup.isPending ? 'Consultando…' : 'Consultar evento'}
                </button>
              </form>
            ) : (
              <div className="recovery-readonly-note">Tu rol no tiene <code>operations.integration.read</code>.</div>
            )}

            {lookupClientError && <div className="recovery-inline-error" role="alert">{lookupClientError}</div>}
            {lookupFailure && lookupFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={lookupFailure} />}

            {event && (
              <div className="recovery-event-result" aria-live="polite">
                <div className="recovery-result-heading">
                  <div><span>Evento</span><strong>{event.eventType}</strong></div>
                  <span className={`recovery-status is-${slug(event.processingStatus)}`}>{event.processingStatus}</span>
                </div>
                <dl className="recovery-facts">
                  <div><dt>eventId</dt><dd><code>{event.eventId}</code></dd></div>
                  <div><dt>externalEventId</dt><dd><code>{event.externalEventId}</code></dd></div>
                  <div><dt>Ingestion</dt><dd>{event.ingestionStatus}</dd></div>
                  <div><dt>Aceptado</dt><dd>{formatDateTime(event.acceptedAt)}</dd></div>
                  <div><dt>Procesado</dt><dd>{event.processedAt ? formatDateTime(event.processedAt) : '—'}</dd></div>
                  <div><dt>Failure category</dt><dd>{event.failureCategory ?? '—'}</dd></div>
                </dl>
              </div>
            )}
          </article>

          <article className="ops-panel recovery-boundary-panel" aria-labelledby="recovery-boundary-title">
            <div className="ops-panel-heading">
              <div>
                <h2 id="recovery-boundary-title">Frontera de recuperación</h2>
                <p>Las acciones de dead-letter requieren un permiso distinto de la lectura.</p>
              </div>
            </div>
            <ul>
              <li><code>operations.dead_letters.read</code> permite inspección.</li>
              <li><code>operations.dead_letters.manage</code> habilita requeue/resolve.</li>
              <li>Los conflictos de versión se refrescan; la UI nunca reintenta una mutación a ciegas.</li>
              <li>La consola no inventa payloads, detalles internos ni relaciones que R3 no proyecta.</li>
            </ul>
          </article>
        </section>

        <section className="ops-panel recovery-dead-letter-panel" aria-labelledby="dead-letter-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="dead-letter-title">Dead-letter queue</h2>
              <p>Solo paginación de servidor. R3 no publica filtros por job type, categoría o fecha.</p>
            </div>
            <button className="ops-refresh-button" type="button" disabled={deadLettersQuery.isFetching} onClick={() => void deadLettersQuery.refetch()}>
              {deadLettersQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {deadLettersFailure && deadLettersFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={deadLettersFailure} />}
          {!canReadDeadLetters ? (
            <div className="ops-compact-empty">Tu rol no tiene acceso de lectura a dead letters.</div>
          ) : deadLettersQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando dead letters…</div>
          ) : !deadLetters || deadLetters.items.length === 0 ? (
            <div className="ops-compact-empty">No hay trabajos en dead-letter para esta página.</div>
          ) : (
            <div className="recovery-table-wrap">
              <table className="recovery-table">
                <thead><tr><th>Job</th><th>Intentos</th><th>Failure</th><th>Disponible</th><th>Versión</th><th /></tr></thead>
                <tbody>
                  {deadLetters.items.map((item) => (
                    <tr key={item.deadLetterId}>
                      <td><strong>{item.jobType}</strong><code>{item.deadLetterId}</code></td>
                      <td>{item.attemptCount} / {item.maxAttempts}</td>
                      <td>{item.failureCategory ?? '—'}</td>
                      <td>{formatDateTime(item.availableAt)}</td>
                      <td>v{item.version}</td>
                      <td><Link to={`/operator/admin/recovery/dead-letters/${item.deadLetterId}`}>Inspeccionar →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canReadDeadLetters && deadLetters && (
            <div className="recovery-pagination" aria-label="Paginación de dead letters">
              <button type="button" disabled={page <= 1 || deadLettersQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
              <span>Página {page} de {totalPages} · {deadLetters.totalItems} registros</span>
              <button type="button" disabled={page >= totalPages || deadLettersQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente →</button>
            </div>
          )}
        </section>
      </main>
    </OperatorShell>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}
