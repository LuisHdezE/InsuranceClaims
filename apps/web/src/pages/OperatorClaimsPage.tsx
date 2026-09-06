import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listClaims } from '../api/claims';
import type { ApiFailure, ClaimStatus } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const STATUSES: ClaimStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED'];

export function OperatorClaimsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ClaimStatus | ''>('');

  const claimsQuery = useQuery({
    queryKey: ['operator', 'claims', page, status],
    queryFn: () => listClaims({ page, pageSize: 20, status: status || undefined }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = claimsQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = claimsQuery.data?.data;

  return (
    <OperatorShell>
      <main className="operator-main container-shell">
        <div className="operator-title-row">
          <div>
            <span className="eyebrow">Operación</span>
            <h1>Siniestros</h1>
            <p>Listado autoritativo del API. Los filtros no crean ni mantienen una copia local del negocio.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => void claimsQuery.refetch()} disabled={claimsQuery.isFetching}>
            {claimsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        <section className="operator-panel" aria-labelledby="claims-filter-title">
          <div className="operator-filter-row">
            <div>
              <label id="claims-filter-title" htmlFor="claim-status-filter">Estado</label>
              <select
                id="claim-status-filter"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as ClaimStatus | '');
                  setPage(1);
                }}
              >
                <option value="">Todos los estados</option>
                {STATUSES.map((item) => <option value={item} key={item}>{statusLabel(item)}</option>)}
              </select>
            </div>
            {result && <div className="operator-count" aria-live="polite">{result.totalItems} siniestro(s)</div>}
          </div>
        </section>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {claimsQuery.isLoading && <div className="operator-panel loading-state" role="status">Cargando siniestros…</div>}

        {result && result.items.length === 0 && (
          <div className="operator-panel empty-state" role="status">
            <strong>{status ? 'No hay resultados para este filtro.' : 'No hay siniestros disponibles.'}</strong>
            {status && <button className="btn btn-secondary" type="button" onClick={() => { setStatus(''); setPage(1); }}>Quitar filtro</button>}
          </div>
        )}

        {result && result.items.length > 0 && (
          <section className="operator-panel claims-table-wrap" aria-label="Listado de siniestros">
            <table className="claims-table">
              <thead>
                <tr>
                  <th scope="col">Seguimiento</th>
                  <th scope="col">Póliza</th>
                  <th scope="col">Vehículo</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Ocurrido</th>
                  <th scope="col"><span className="sr-only">Acción</span></th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((claim) => (
                  <tr key={claim.claimId}>
                    <td data-label="Seguimiento"><strong>{claim.trackingCode}</strong></td>
                    <td data-label="Póliza">{claim.policyReference}</td>
                    <td data-label="Vehículo">{claim.vehicleReference}</td>
                    <td data-label="Estado"><span className={`status-badge status-${claim.status.toLowerCase()}`}>{statusLabel(claim.status)}</span></td>
                    <td data-label="Ocurrido">{formatDate(claim.occurredAt)}</td>
                    <td data-label="Acción"><Link className="btn btn-secondary" to={`/operator/claims/${claim.claimId}`}>Ver detalle</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {result && result.totalPages > 0 && (
          <nav className="operator-pagination" aria-label="Paginación de siniestros">
            <button className="btn btn-secondary" type="button" disabled={page <= 1 || claimsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <span>Página {result.page} de {result.totalPages}</span>
            <button className="btn btn-secondary" type="button" disabled={page >= result.totalPages || claimsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
          </nav>
        )}
      </main>
    </OperatorShell>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
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
