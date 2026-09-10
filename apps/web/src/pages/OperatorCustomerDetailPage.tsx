import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getCustomer } from '../api/customer-policy';
import type { CustomerRecordStatus, RelatedClaimProjection } from '../api/customer-policy-types';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorCustomerDetailPage() {
  const { customerId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const customerQuery = useQuery({
    queryKey: ['operator', 'customer', customerId],
    queryFn: () => getCustomer(customerId, session!.accessToken),
    enabled: Boolean(session && customerId),
  });

  const failure = customerQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const customer = customerQuery.data?.data;
  const canReadPolicies = hasPermission(session.operator.role, 'policies.read');
  const canReadClaims = hasPermission(session.operator.role, 'claims.backoffice.read');

  return (
    <OperatorShell>
      <main className="operator-main ops-main cp360-main">
        <div className="cp360-breadcrumbs"><Link to="/operator/customers">Clientes</Link><span>/</span><span>{customer?.customerRef ?? 'Detalle'}</span></div>
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        {customerQuery.isLoading ? <div className="ops-panel ops-loading" role="status">Cargando Customer 360…</div> : customer ? (
          <>
            <section className="cp360-detail-hero" aria-labelledby="customer-detail-title">
              <div className="cp360-detail-identity">
                <span className="cp360-avatar" aria-hidden="true">{initials(customer.displayName)}</span>
                <div><span className="ops-kicker">Customer 360</span><h1 id="customer-detail-title">{customer.displayName}</h1><div className="cp360-hero-meta"><code>{customer.customerRef}</code><StatusBadge value={customer.status} /><span>v{customer.version}</span></div></div>
              </div>
              <div className="cp360-detail-facts">
                <div><small>Pólizas relacionadas</small><strong>{customer.policies.length}</strong></div>
                <div><small>Claims relacionados</small><strong>{customer.claims.length}</strong></div>
                <div><small>Actualizado</small><strong>{formatDate(customer.updatedAt)}</strong></div>
              </div>
            </section>

            <div className="cp360-detail-grid">
              <section className="ops-panel cp360-relation-panel" aria-labelledby="customer-policies-title">
                <div className="ops-panel-heading"><div><h2 id="customer-policies-title">Pólizas</h2><p>Relaciones persistidas devueltas por Customer 360.</p></div>{canReadPolicies && <Link to="/operator/policies">Directorio →</Link>}</div>
                {customer.policies.length === 0 ? <div className="ops-compact-empty">No hay pólizas relacionadas.</div> : (
                  <div className="cp360-card-list">
                    {customer.policies.map((policy) => (
                      <article className="cp360-relation-card" key={policy.policyId}>
                        <div className="cp360-relation-card-head"><span className="cp360-policy-icon" aria-hidden="true">▱</span><div><strong>{policy.policyReference}</strong><small>Legacy: {policy.legacyPolicyReference}</small></div><StatusBadge value={policy.recordStatus} /></div>
                        <div className="cp360-mini-facts"><span><small>Assets</small><strong>{policy.assets.length}</strong></span><span><small>Aseguradora ref.</small><strong>{policy.insurerReference ?? '—'}</strong></span><span><small>Versión</small><strong>v{policy.version}</strong></span></div>
                        {canReadPolicies ? <Link className="cp360-card-action" to={`/operator/policies/${policy.policyId}`}>Abrir póliza 360 →</Link> : <span className="cp360-readonly-note">Tu rol no puede abrir el recurso Policy 360.</span>}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="ops-panel cp360-relation-panel" aria-labelledby="customer-claims-title">
                <div className="ops-panel-heading"><div><h2 id="customer-claims-title">Claims</h2><p>Claims correlacionados por el backend R3, sin reconstrucción local.</p></div>{canReadClaims && <Link to="/operator/claims">Workspace →</Link>}</div>
                {customer.claims.length === 0 ? <div className="ops-compact-empty">No hay Claims relacionados.</div> : (
                  <div className="cp360-claim-list">{customer.claims.map((claim) => <ClaimRow claim={claim} canOpen={canReadClaims} key={claim.claimId} />)}</div>
                )}
              </section>
            </div>

            <section className="cp360-contract-note"><strong>Alcance contractual</strong><span>Customer 360 expone referencia, nombre de presentación, estado, versión y relaciones. No inferimos datos de contacto ni atributos ausentes.</span></section>
          </>
        ) : null}
      </main>
    </OperatorShell>
  );
}

function ClaimRow({ claim, canOpen }: { claim: RelatedClaimProjection; canOpen: boolean }) {
  const content = <><div><strong>{claim.trackingCode}</strong><small>{claim.policyReference} · {claim.vehicleReference}</small></div><span className={`cp360-claim-status is-${claim.status.toLowerCase()}`}>{claim.status.replaceAll('_', ' ')}</span><time dateTime={claim.occurredAt}>{formatDate(claim.occurredAt)}</time>{canOpen && <span aria-hidden="true">›</span>}</>;
  return canOpen ? <Link className="cp360-claim-row" to={`/operator/claims/${claim.claimId}`}>{content}</Link> : <div className="cp360-claim-row">{content}</div>;
}

function StatusBadge({ value }: { value: CustomerRecordStatus }) {
  return <span className={`cp360-status is-${value.toLowerCase()}`}>{value === 'ACTIVE' ? 'Activo' : 'Inactivo'}</span>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CU';
}
