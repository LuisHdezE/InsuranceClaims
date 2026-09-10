import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listPolicies } from '../api/customer-policy';
import type { PolicyRecordStatus } from '../api/customer-policy-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorPoliciesPage() {
  const { session, signOut } = useOperatorSession();
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PolicyRecordStatus | ''>('');
  const [page, setPage] = useState(1);

  const policiesQuery = useQuery({
    queryKey: ['operator', 'policies', page, status || 'ALL', search],
    queryFn: () => listPolicies({ page, pageSize: 25, search: search || undefined, status: status || undefined }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = policiesQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = policiesQuery.data?.data;
  const items = result?.items ?? [];

  return (
    <OperatorShell>
      <main className="operator-main ops-main cp360-main">
        <div className="ops-page-heading cp360-page-heading">
          <div>
            <span className="ops-kicker">Policy 360</span>
            <h1>Pólizas</h1>
            <p>Directorio R3 de pólizas con referencias modernas y legacy, assets relacionados y conteo de Claims.</p>
          </div>
          <Link className="cp360-switch-link" to="/operator/customers">← Ver clientes</Link>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="cp360-toolbar" aria-label="Filtros de pólizas">
          <form className="cp360-search" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(draftSearch.trim()); }}>
            <label htmlFor="policy-search">Buscar póliza</label>
            <div><input id="policy-search" value={draftSearch} maxLength={120} placeholder="Referencia disponible" onChange={(event) => setDraftSearch(event.target.value)} /><button type="submit">Buscar</button></div>
          </form>
          <label className="cp360-filter"><span>Estado</span><select value={status} onChange={(event) => { setStatus(event.target.value as PolicyRecordStatus | ''); setPage(1); }}><option value="">Todos</option><option value="ACTIVE">Activas</option><option value="INACTIVE">Inactivas</option></select></label>
          <div className="cp360-result-summary"><span>Resultado R3</span><strong>{result ? `${result.totalItems} póliza(s)` : '—'}</strong>{(search || status) && <button type="button" onClick={() => { setDraftSearch(''); setSearch(''); setStatus(''); setPage(1); }}>Restablecer</button>}</div>
        </section>

        <section className="ops-panel cp360-list-panel" aria-labelledby="policies-list-title">
          <div className="ops-panel-heading"><div><h2 id="policies-list-title">Directorio de pólizas</h2><p>La relación con cliente, assets y Claims proviene de la proyección R3.</p></div><button className="ops-refresh-button" type="button" disabled={policiesQuery.isFetching} onClick={() => void policiesQuery.refetch()}>{policiesQuery.isFetching ? 'Actualizando…' : 'Actualizar'}</button></div>

          {policiesQuery.isLoading ? <div className="ops-compact-empty" role="status">Cargando pólizas…</div> : items.length === 0 ? <div className="ops-compact-empty">No hay pólizas que coincidan con los filtros actuales.</div> : (
            <div className="cp360-table-wrap"><table className="cp360-table"><thead><tr><th>Póliza</th><th>Cliente</th><th>Estado</th><th>Assets</th><th>Claims</th><th>Versión</th><th /></tr></thead><tbody>{items.map((policy) => (
              <tr key={policy.policyId}>
                <td data-label="Póliza"><Link className="cp360-primary-link" to={`/operator/policies/${policy.policyId}`}>{policy.policyReference}</Link><small>Legacy: {policy.legacyPolicyReference}</small></td>
                <td data-label="Cliente">{policy.customer ? <><strong>{policy.customer.displayName}</strong><small>{policy.customer.customerRef}</small></> : '—'}</td>
                <td data-label="Estado"><StatusBadge value={policy.recordStatus} /></td>
                <td data-label="Assets"><strong>{policy.assets.length}</strong></td>
                <td data-label="Claims"><strong>{policy.claimCount}</strong></td>
                <td data-label="Versión">v{policy.version}</td>
                <td data-label="Acción"><Link className="cp360-row-action" to={`/operator/policies/${policy.policyId}`}>Abrir 360 →</Link></td>
              </tr>
            ))}</tbody></table></div>
          )}

          {result && result.totalPages > 1 && <div className="cp360-pagination" aria-label="Paginación de pólizas"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Anterior</button><span>Página <strong>{result.page}</strong> de {result.totalPages}</span><button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente →</button></div>}
        </section>
      </main>
    </OperatorShell>
  );
}

function StatusBadge({ value }: { value: PolicyRecordStatus }) {
  return <span className={`cp360-status is-${value.toLowerCase()}`}>{value === 'ACTIVE' ? 'Activa' : 'Inactiva'}</span>;
}
