import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listClaims } from '../api/claims';
import type { ApiFailure, ClaimStatus, ClaimSummary } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const STATUSES: ClaimStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED'];
type ViewMode = 'kanban' | 'list';

type Stage = {
  id: string;
  label: string;
  description: string;
  statuses: ClaimStatus[];
  tone: 'blue' | 'cyan' | 'yellow' | 'green';
};

const STAGES: Stage[] = [
  { id: 'reported', label: 'Reportados', description: 'Siniestros recién recibidos.', statuses: ['RECEIVED'], tone: 'blue' },
  { id: 'management', label: 'En gestión', description: 'Revisión, aprobación o reparación.', statuses: ['UNDER_REVIEW', 'APPROVED', 'IN_REPAIR'], tone: 'cyan' },
  { id: 'information', label: 'Requiere información', description: 'Necesita volver al flujo de revisión.', statuses: ['OBSERVED'], tone: 'yellow' },
  { id: 'resolved', label: 'Resueltos', description: 'Siniestros cerrados.', statuses: ['CLOSED'], tone: 'green' },
];

export function OperatorClaimsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ClaimStatus | ''>('');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const claimsQuery = useQuery({
    queryKey: ['operator', 'claims', 'list', page, status],
    queryFn: () => listClaims({ page, pageSize: 20, status: status || undefined }, session!.accessToken),
    enabled: Boolean(session) && viewMode === 'list',
  });

  const stageQueries = useQueries({
    queries: STATUSES.map((claimStatus) => ({
      queryKey: ['operator', 'claims', 'kanban', claimStatus],
      queryFn: () => listClaims({ page: 1, pageSize: 20, status: claimStatus }, session!.accessToken),
      enabled: Boolean(session) && viewMode === 'kanban',
    })),
  });

  const failure = (claimsQuery.error ?? stageQueries.find((query) => query.error)?.error) as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  const stageData = useMemo(() => {
    const byStatus = new Map<ClaimStatus, { items: ClaimSummary[]; totalItems: number }>();
    STATUSES.forEach((claimStatus, index) => {
      const data = stageQueries[index]?.data?.data;
      byStatus.set(claimStatus, { items: data?.items ?? [], totalItems: data?.totalItems ?? 0 });
    });

    return STAGES.map((stage) => ({
      ...stage,
      items: stage.statuses.flatMap((claimStatus) => byStatus.get(claimStatus)?.items ?? []),
      totalItems: stage.statuses.reduce((sum, claimStatus) => sum + (byStatus.get(claimStatus)?.totalItems ?? 0), 0),
    }));
  }, [stageQueries]);

  if (!session) return null;
  const result = claimsQuery.data?.data;
  const isRefreshing = viewMode === 'kanban'
    ? stageQueries.some((query) => query.isFetching)
    : claimsQuery.isFetching;

  const refresh = () => {
    if (viewMode === 'kanban') return Promise.all(stageQueries.map((query) => query.refetch()));
    return claimsQuery.refetch();
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Operación</span>
            <h1>Gestión de siniestros</h1>
            <p>Listado autoritativo del API. El Kanban es una proyección visual y nunca reemplaza los estados del dominio.</p>
          </div>
          <button className="ops-refresh-button" type="button" onClick={() => void refresh()} disabled={isRefreshing}>
            {isRefreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        <section className="ops-claims-toolbar" aria-label="Controles del workspace de siniestros">
          <div className="ops-filter-control">
            <label htmlFor="claim-status-filter">Estado / filtro</label>
            <select
              id="claim-status-filter"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ClaimStatus | '');
                setPage(1);
                setViewMode('list');
              }}
            >
              <option value="">Todos los estados</option>
              {STATUSES.map((item) => <option value={item} key={item}>{statusLabel(item)}</option>)}
            </select>
          </div>

          <div className="ops-view-toggle" role="group" aria-label="Vista del listado">
            <button type="button" className={viewMode === 'kanban' ? 'is-active' : ''} onClick={() => setViewMode('kanban')} aria-pressed={viewMode === 'kanban'}>▥ Kanban</button>
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>☷ Lista</button>
          </div>
        </section>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        {viewMode === 'kanban' && (
          <section className="ops-kanban" aria-label="Kanban operacional de siniestros">
            {stageData.map((stage) => (
              <article className={`ops-kanban-column is-${stage.tone}`} key={stage.id}>
                <header className="ops-kanban-heading">
                  <span className="ops-kanban-stage-icon" aria-hidden="true">{stageIcon(stage.id)}</span>
                  <div>
                    <h2>{stage.label}</h2>
                    <p>{stage.description}</p>
                  </div>
                  <strong>{stage.totalItems}</strong>
                </header>

                <div className="ops-kanban-cards">
                  {stageQueries.some((query) => query.isLoading) && stage.items.length === 0 && (
                    <div className="ops-kanban-empty" role="status">Cargando…</div>
                  )}
                  {!stageQueries.some((query) => query.isLoading) && stage.items.length === 0 && (
                    <div className="ops-kanban-empty">Sin siniestros en esta etapa.</div>
                  )}
                  {stage.items.map((claim) => <ClaimCard claim={claim} key={claim.claimId} />)}
                </div>
              </article>
            ))}
          </section>
        )}

        {viewMode === 'list' && (
          <>
            {claimsQuery.isLoading && <div className="ops-panel loading-state" role="status">Cargando siniestros…</div>}

            {result && result.items.length === 0 && (
              <div className="ops-panel empty-state" role="status">
                <strong>{status ? 'No hay resultados para este filtro.' : 'No hay siniestros disponibles.'}</strong>
                {status && <button className="ops-refresh-button" type="button" onClick={() => { setStatus(''); setPage(1); }}>Quitar filtro</button>}
              </div>
            )}

            {result && result.items.length > 0 && (
              <section className="operator-panel claims-table-wrap ops-list-panel" aria-label="Listado de siniestros">
                <div className="ops-list-count">{result.totalItems} siniestro(s)</div>
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
                        <td data-label="Acción"><Link className="ops-card-link" to={`/operator/claims/${claim.claimId}`}>Ver detalle</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {result && result.totalPages > 0 && (
              <nav className="operator-pagination" aria-label="Paginación de siniestros">
                <button className="ops-refresh-button" type="button" disabled={page <= 1 || claimsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
                <span>Página {result.page} de {result.totalPages}</span>
                <button className="ops-refresh-button" type="button" disabled={page >= result.totalPages || claimsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente</button>
              </nav>
            )}
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function ClaimCard({ claim }: { claim: ClaimSummary }) {
  return (
    <Link className="ops-claim-card" to={`/operator/claims/${claim.claimId}`}>
      <div className="ops-claim-card-top">
        <strong>{claim.trackingCode}</strong>
        <span className={`status-badge status-${claim.status.toLowerCase()}`}>{claim.status}</span>
      </div>
      <span className="ops-claim-policy">{claim.policyReference}</span>
      <dl>
        <div><dt>Vehículo</dt><dd>{claim.vehicleReference}</dd></div>
        <div><dt>Ocurrido</dt><dd>{formatDate(claim.occurredAt)}</dd></div>
      </dl>
      <span className="ops-claim-card-action">Abrir detalle <span aria-hidden="true">›</span></span>
    </Link>
  );
}

function stageIcon(id: string) {
  if (id === 'reported') return '▱';
  if (id === 'management') return '▥';
  if (id === 'information') return '!';
  return '✓';
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
