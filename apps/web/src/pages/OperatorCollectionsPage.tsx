import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCollections } from '../api/collections';
import type { CollectionCaseStatus } from '../api/collections-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-06.css';

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
      <main className="operator-main ops-main collection-main r3-collections-directory">
        <div className="ops-page-heading r3-case-page-heading">
          <div>
            <span className="ops-kicker">Collections Operations</span>
            <h1>Cobranzas</h1>
            <p>Casos de cobranza con lifecycle, estado de pago autoritativo y pipeline operativo claramente separados. La bandeja refleja únicamente la proyección R3.</p>
          </div>
          <div className="r3-case-heading-summary" aria-label="Resumen del listado">
            <span>Resultado R3</span>
            <strong>{result ? `${result.totalItems} caso(s)` : '—'}</strong>
            <small>25 por página · sin filtros simulados</small>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="ops-panel r3-case-list-panel" aria-labelledby="collections-list-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="collections-list-title">Bandeja de cobranzas</h2>
              <p>Cliente, póliza, lifecycle, pago y etapa operativa provienen del servidor.</p>
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
            <div className="r3-case-table-wrap">
              <table className="r3-case-table">
                <thead>
                  <tr><th>Cliente</th><th>Póliza</th><th>Lifecycle</th><th>Estado de pago</th><th>Etapa operativa</th><th>Actualizado</th><th /></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.collectionId}>
                      <td data-label="Cliente">
                        <Link className="r3-case-primary-link" to={`/operator/collections/${item.collectionId}`}>{item.customer?.displayName ?? 'Cliente no resuelto'}</Link>
                        <small>{item.customer?.customerRef ?? item.customerId}</small>
                      </td>
                      <td data-label="Póliza">
                        <strong>{item.policy?.policyReference ?? item.policyId}</strong>
                        <small>{item.policy?.insurerReference ?? 'Sin referencia de aseguradora'}</small>
                      </td>
                      <td data-label="Lifecycle"><CollectionStatus value={item.status} /></td>
                      <td data-label="Estado de pago"><PaymentState value={item.paymentState} /></td>
                      <td data-label="Etapa operativa"><span className="r3-case-stage">{item.pipeline?.currentStage?.displayName ?? 'Sin work item'}</span></td>
                      <td data-label="Actualizado"><time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time></td>
                      <td data-label="Acción"><Link className="r3-case-row-action" to={`/operator/collections/${item.collectionId}`}>Abrir caso →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="r3-case-pagination" aria-label="Paginación de cobranzas">
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
  return <span className={`r3-case-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function PaymentState({ value }: { value: string | null }) {
  return value
    ? <span className="r3-payment-state" title="Valor autoritativo publicado por el servidor">{value}</span>
    : <span className="r3-payment-state is-empty">Sin estado</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
