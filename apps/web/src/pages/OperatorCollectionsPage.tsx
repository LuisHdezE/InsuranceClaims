import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCollections } from '../api/collections';
import type { CollectionCaseStatus } from '../api/collections-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorCollectionsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);

  const collectionsQuery = useQuery({
    queryKey: ['operator', 'collections', page],
    queryFn: () => listCollections({ page, pageSize: 25 }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = collectionsQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = collectionsQuery.data?.data;
  const items = result?.items ?? [];

  return (
    <OperatorShell>
      <main className="operator-main ops-main collection-main">
        <div className="ops-page-heading collection-page-heading">
          <div>
            <span className="ops-kicker">Collections Operations</span>
            <h1>Cobranzas</h1>
            <p>Casos R3 autoritativos con lifecycle, estado de pago verificado y pipeline operativo independientes. La API actual solo publica paginación para este listado.</p>
          </div>
          <div className="collection-heading-summary">
            <span>Resultado R3</span>
            <strong>{result ? `${result.totalItems} caso(s)` : '—'}</strong>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="ops-panel collection-list-panel" aria-labelledby="collections-list-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="collections-list-title">Bandeja de cobranzas</h2>
              <p>No se inventan filtros ni semánticas financieras: la superficie refleja exactamente la proyección R3.</p>
            </div>
            <button className="ops-refresh-button" type="button" disabled={collectionsQuery.isFetching} onClick={() => void collectionsQuery.refetch()}>
              {collectionsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {collectionsQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando cobranzas…</div>
          ) : items.length === 0 ? (
            <div className="ops-compact-empty">No hay casos de cobranza en la página actual.</div>
          ) : (
            <div className="collection-table-wrap">
              <table className="collection-table">
                <thead>
                  <tr><th>Cliente</th><th>Póliza</th><th>Lifecycle</th><th>Pago</th><th>Pipeline</th><th>Versión</th><th /></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.collectionId}>
                      <td data-label="Cliente">
                        <Link className="collection-primary-link" to={`/operator/collections/${item.collectionId}`}>{item.customer?.displayName ?? 'Cliente no resuelto'}</Link>
                        <small>{item.customer?.customerRef ?? item.customerId}</small>
                      </td>
                      <td data-label="Póliza">
                        <strong>{item.policy?.policyReference ?? item.policyId}</strong>
                        <small>{item.policy?.insurerReference ?? 'Sin referencia de aseguradora'}</small>
                      </td>
                      <td data-label="Lifecycle"><CollectionStatus value={item.status} /></td>
                      <td data-label="Pago"><PaymentState value={item.paymentState} /></td>
                      <td data-label="Pipeline">
                        <span className="collection-stage">{item.pipeline?.currentStage?.displayName ?? 'Sin work item'}</span>
                        {item.pipeline?.currentStage && <small><code>{item.pipeline.currentStage.stageKey}</code></small>}
                      </td>
                      <td data-label="Versión">v{item.version}{item.pipeline ? ` · p${item.pipeline.version}` : ''}</td>
                      <td data-label="Acción"><Link className="collection-row-action" to={`/operator/collections/${item.collectionId}`}>Abrir caso →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="collection-pagination" aria-label="Paginación de cobranzas">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Anterior</button>
              <span>Página <strong>{result.page}</strong> de {result.totalPages}</span>
              <button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente →</button>
            </div>
          )}
        </section>
      </main>
    </OperatorShell>
  );
}

function CollectionStatus({ value }: { value: CollectionCaseStatus }) {
  const labels: Record<CollectionCaseStatus, string> = { OPEN: 'Abierta', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
  return <span className={`collection-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function PaymentState({ value }: { value: string | null }) {
  return value
    ? <code className="collection-payment-code">{value}</code>
    : <span className="collection-payment-empty">Sin estado</span>;
}
