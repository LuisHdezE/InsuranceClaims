import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCustomers } from '../api/customer-policy';
import type { CustomerRecordStatus } from '../api/customer-policy-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-04.css';

export function OperatorCustomersPage() {
  const { session, signOut } = useOperatorSession();
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerRecordStatus | ''>('');
  const [page, setPage] = useState(1);

  const customersQuery = useQuery({
    queryKey: ['operator', 'customers', page, status || 'ALL', search],
    queryFn: () => listCustomers({ page, pageSize: 25, search: search || undefined, status: status || undefined }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = customersQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = customersQuery.data?.data;
  const items = result?.items ?? [];

  return (
    <OperatorShell>
      <main className="operator-main ops-main cp360-main r3-customer-directory">
        <div className="ops-page-heading cp360-page-heading">
          <div>
            <span className="ops-kicker">Clientes · Directorio</span>
            <h1>Clientes</h1>
            <p>Directorio autoritativo para buscar y seleccionar clientes. El detalle y sus relaciones viven en Cliente 360.</p>
          </div>
          <Link className="cp360-switch-link" to="/operator/policies">Ver pólizas →</Link>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="cp360-toolbar" aria-label="Filtros de clientes">
          <form
            className="cp360-search"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(draftSearch.trim());
            }}
          >
            <label htmlFor="customer-search">Buscar cliente</label>
            <div>
              <input id="customer-search" value={draftSearch} maxLength={120} placeholder="Referencia o nombre disponible" onChange={(event) => setDraftSearch(event.target.value)} />
              <button type="submit">Buscar</button>
            </div>
          </form>
          <label className="cp360-filter">
            <span>Estado</span>
            <select value={status} onChange={(event) => { setStatus(event.target.value as CustomerRecordStatus | ''); setPage(1); }}>
              <option value="">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
          </label>
          <div className="cp360-result-summary" aria-live="polite">
            <span>Resultado R3</span>
            <strong>{result ? `${result.totalItems} cliente(s)` : '—'}</strong>
            <small>Búsqueda y filtros server-side</small>
            {(search || status) && <button type="button" onClick={() => { setDraftSearch(''); setSearch(''); setStatus(''); setPage(1); }}>Restablecer</button>}
          </div>
        </section>

        <section className="ops-panel cp360-list-panel" aria-labelledby="customers-list-title">
          <div className="ops-panel-heading">
            <div><h2 id="customers-list-title">Directorio de clientes</h2><p>25 por página · filtros resueltos por el servidor.</p></div>
            <button className="ops-refresh-button" type="button" disabled={customersQuery.isFetching} onClick={() => void customersQuery.refetch()}>{customersQuery.isFetching ? 'Actualizando…' : 'Actualizar'}</button>
          </div>

          {customersQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando clientes…</div>
          ) : items.length === 0 ? (
            <div className="ops-compact-empty">No hay clientes que coincidan con los filtros actuales.</div>
          ) : (
            <div className="cp360-table-wrap">
              <table className="cp360-table">
                <thead><tr><th>Cliente</th><th>Referencia</th><th>Estado</th><th>Pólizas</th><th>Claims</th><th>Versión</th><th /></tr></thead>
                <tbody>
                  {items.map((customer) => (
                    <tr key={customer.customerId}>
                      <td data-label="Cliente"><Link className="cp360-primary-link" to={`/operator/customers/${customer.customerId}`}>{customer.displayName}</Link><small>Actualizado {formatDate(customer.updatedAt)}</small></td>
                      <td data-label="Referencia"><code>{customer.customerRef}</code></td>
                      <td data-label="Estado"><StatusBadge value={customer.status} /></td>
                      <td data-label="Pólizas"><strong>{customer.policyCount}</strong></td>
                      <td data-label="Claims"><strong>{customer.claimCount}</strong></td>
                      <td data-label="Versión"><span className="r3-customer-version">v{customer.version}</span></td>
                      <td data-label="Acción"><Link className="cp360-row-action" to={`/operator/customers/${customer.customerId}`}>Abrir 360 →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="cp360-pagination" aria-label="Paginación de clientes">
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

function StatusBadge({ value }: { value: CustomerRecordStatus }) {
  return <span className={`cp360-status is-${value.toLowerCase()}`}>{value === 'ACTIVE' ? 'Activo' : 'Inactivo'}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' }).format(new Date(value));
}
