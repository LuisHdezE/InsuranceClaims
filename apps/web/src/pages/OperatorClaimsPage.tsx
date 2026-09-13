import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listClaims } from '../api/claims';
import type {
  ApiFailure,
  ClaimStatus,
  ClaimSummary,
  ClaimsListSort,
} from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const STATUSES: ClaimStatus[] = ['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED'];
const SORT_OPTIONS: Array<{ value: ClaimsListSort; label: string }> = [
  { value: 'createdAt:desc', label: 'Más recientes' },
  { value: 'createdAt:asc', label: 'Más antiguos' },
  { value: 'occurredAt:desc', label: 'Ocurrencia reciente' },
  { value: 'occurredAt:asc', label: 'Ocurrencia antigua' },
  { value: 'trackingCode:asc', label: 'Seguimiento A-Z' },
  { value: 'trackingCode:desc', label: 'Seguimiento Z-A' },
];
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
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ClaimsListSort>('createdAt:desc');
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');

  const sharedQuery = {
    search: search || undefined,
    sort,
  };

  const claimsQuery = useQuery({
    queryKey: ['operator', 'claims', 'list', page, status, search, sort],
    queryFn: () => listClaims({
      page,
      pageSize: 20,
      status: status || undefined,
      ...sharedQuery,
    }, session!.accessToken),
    enabled: Boolean(session) && viewMode === 'list',
  });

  const stageQueries = useQueries({
    queries: STATUSES.map((claimStatus) => ({
      queryKey: ['operator', 'claims', 'kanban', claimStatus, search, sort],
      queryFn: () => listClaims({
        page: 1,
        pageSize: 20,
        status: claimStatus,
        ...sharedQuery,
      }, session!.accessToken),
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

  const applySearch = () => {
    setSearch(searchDraft.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setStatus('');
    setSearchDraft('');
    setSearch('');
    setSort('createdAt:desc');
    setPage(1);
  };

  const hasFilters = Boolean(status || search || sort !== 'createdAt:desc');

  return (
    <OperatorShell>
      <main className="operator-main ops-main r3-workspace-page">
        <div className="ops-page-heading">
          <div>
            <span className="ops-kicker">Operación</span>
            <h1>Gestión de siniestros</h1>
            <p>
              Estados autoritativos, búsqueda y orden R3. El Kanban conserva la agrupación visual aprobada,
              mientras la etapa operacional real se muestra desde la proyección del servidor.
            </p>
          </div>
          <button className="ops-refresh-button" type="button" onClick={() => void refresh()} disabled={isRefreshing}>
            {isRefreshing ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        <section className="ops-claims-toolbar r3-claims-toolbar" aria-label="Controles del workspace de siniestros">
          <form
            className="r3-claims-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              applySearch();
            }}
          >
            <label htmlFor="claims-search">Buscar</label>
            <div>
              <input
                id="claims-search"
                type="search"
                value={searchDraft}
                maxLength={120}
                placeholder="Seguimiento, póliza, vehículo…"
                onChange={(event) => setSearchDraft(event.target.value)}
              />
              <button type="submit">Buscar</button>
            </div>
          </form>

          <div className="ops-filter-control">
            <label htmlFor="claim-status-filter">Estado</label>
            <select
              id="claim-status-filter"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ClaimStatus | '');
                setPage(1);
                if (event.target.value) setViewMode('list');
              }}
            >
              <option value="">Todos</option>
              {STATUSES.map((item) => <option value={item} key={item}>{statusLabel(item)}</option>)}
            </select>
          </div>

          <div className="ops-filter-control">
            <label htmlFor="claim-sort">Orden</label>
            <select
              id="claim-sort"
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as ClaimsListSort);
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="r3-toolbar-actions">
            {hasFilters && <button className="r3-clear-filter" type="button" onClick={clearFilters}>Limpiar</button>}
            <div className="ops-view-toggle" role="group" aria-label="Vista del listado">
              <button type="button" className={viewMode === 'kanban' ? 'is-active' : ''} onClick={() => setViewMode('kanban')} aria-pressed={viewMode === 'kanban'}>▥ Kanban</button>
              <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'}>☷ Lista</button>
            </div>
          </div>
        </section>

        {search && (
          <div className="r3-active-filter" role="status">
            Resultados para <strong>“{search}”</strong>
            <button type="button" onClick={() => { setSearch(''); setSearchDraft(''); setPage(1); }} aria-label="Quitar búsqueda">×</button>
          </div>
        )}

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        {viewMode === 'kanban' && (
          <section className="ops-kanban" aria-label="Kanban visual de siniestros por estado">
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
                    <div className="ops-kanban-empty">Sin siniestros en esta agrupación.</div>
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
                <strong>No hay resultados para los filtros actuales.</strong>
                {hasFilters && <button className="ops-refresh-button" type="button" onClick={clearFilters}>Limpiar filtros</button>}
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
                      <th scope="col">Etapa operativa</th>
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
                        <td data-label="Etapa">
                          <OperationalStageBadge claim={claim} />
                        </td>
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
    <Link className="ops-claim-card r3-claim-card" to={`/operator/claims/${claim.claimId}`}>
      <div className="ops-claim-card-top">
        <strong>{claim.trackingCode}</strong>
        <span className={`status-badge status-${claim.status.toLowerCase()}`}>{statusLabel(claim.status)}</span>
      </div>
      <span className="ops-claim-policy">{claim.policyReference}</span>
      <OperationalStageBadge claim={claim} />
      <dl>
        <div><dt>Vehículo</dt><dd>{claim.vehicleReference}</dd></div>
        <div><dt>Ocurrido</dt><dd>{formatDate(claim.occurredAt)}</dd></div>
      </dl>
      <span className="ops-claim-card-action">Abrir detalle <span aria-hidden="true">›</span></span>
    </Link>
  );
}

function OperationalStageBadge({ claim }: { claim: ClaimSummary }) {
  if (!claim.operationalStage) {
    return <span className="r3-stage-badge is-unassigned">Sin etapa operativa</span>;
  }

  return (
    <span className="r3-stage-badge" title={`Stage key: ${claim.operationalStage.stageKey}`}>
      <span aria-hidden="true">◆</span>
      {claim.operationalStage.displayName}
    </span>
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
