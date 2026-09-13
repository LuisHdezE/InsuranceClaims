import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listRenewals } from '../api/renewals';
import type { RenewalCaseStatus } from '../api/renewals-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-06.css';

export function OperatorRenewalsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);

  const renewalsQuery = useQuery({
    queryKey: ['operator', 'renewals', page],
    queryFn: () => listRenewals({ page, pageSize: 25 }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = renewalsQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = renewalsQuery.data?.data;
  const items = result?.items ?? [];

  return (
    <OperatorShell>
      <main className="operator-main ops-main renewal-main r3-renewals-directory">
        <div className="ops-page-heading r3-case-page-heading">
          <div>
            <span className="ops-kicker">Policy Lifecycle</span>
            <h1>Renovaciones</h1>
            <p>Casos de renovación con lifecycle y pipeline operativo separados. La bandeja usa exclusivamente la proyección publicada por la API R3.</p>
          </div>
          <div className="r3-case-heading-summary" aria-label="Resumen del listado">
            <span>Resultado R3</span>
            <strong>{result ? `${result.totalItems} caso(s)` : '—'}</strong>
            <small>25 por página · sin filtros simulados</small>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="ops-panel r3-case-list-panel" aria-labelledby="renewals-list-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="renewals-list-title">Bandeja de renovaciones</h2>
              <p>Cliente, póliza, lifecycle y etapa operativa provienen del servidor.</p>
            </div>
            <button className="ops-refresh-button" type="button" disabled={renewalsQuery.isFetching} onClick={() => void renewalsQuery.refetch()}>
              {renewalsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {renewalsQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando renovaciones…</div>
          ) : items.length === 0 ? (
            <div className="ops-compact-empty">No hay casos de renovación en la página actual.</div>
          ) : (
            <div className="r3-case-table-wrap">
              <table className="r3-case-table">
                <thead>
                  <tr><th>Cliente</th><th>Póliza</th><th>Lifecycle</th><th>Etapa operativa</th><th>Actualizado</th><th /></tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.renewalId}>
                      <td data-label="Cliente">
                        <Link className="r3-case-primary-link" to={`/operator/renewals/${item.renewalId}`}>{item.customer?.displayName ?? 'Cliente no resuelto'}</Link>
                        <small>{item.customer?.customerRef ?? item.customerId}</small>
                      </td>
                      <td data-label="Póliza">
                        <strong>{item.policy?.policyReference ?? item.policyId}</strong>
                        <small>{item.policy?.insurerReference ?? 'Sin referencia de aseguradora'}</small>
                      </td>
                      <td data-label="Lifecycle"><RenewalStatus value={item.status} /></td>
                      <td data-label="Etapa operativa"><span className="r3-case-stage">{item.pipeline?.currentStage?.displayName ?? 'Sin work item'}</span></td>
                      <td data-label="Actualizado"><time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time></td>
                      <td data-label="Acción"><Link className="r3-case-row-action" to={`/operator/renewals/${item.renewalId}`}>Abrir caso →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="r3-case-pagination" aria-label="Paginación de renovaciones">
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

function RenewalStatus({ value }: { value: RenewalCaseStatus }) {
  const labels: Record<RenewalCaseStatus, string> = { OPEN: 'Abierta', COMPLETED: 'Completada', CANCELLED: 'Cancelada' };
  return <span className={`r3-case-status is-${value.toLowerCase()}`}>{labels[value]}</span>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
