import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getCustomer } from '../api/customer-policy';
import type { CustomerRecordStatus, RelatedClaimProjection } from '../api/customer-policy-types';
import type { ApiFailure, ClaimStatus } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-ui-increment-04.css';

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
      <main className="operator-main ops-main cp360-main r3-customer-detail">
        <div className="cp360-breadcrumbs"><Link to="/operator/customers">Clientes</Link><span>/</span><span>{customer?.customerRef ?? 'Detalle'}</span></div>
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        {customerQuery.isLoading ? <div className="ops-panel ops-loading" role="status">Cargando Cliente 360…</div> : customer ? (
          <>
            <div className="r3-customer-detail-title">
              <div><span className="ops-kicker">Clientes</span><h1 id="customer-detail-title">Cliente 360</h1></div>
              <StatusBadge value={customer.status} />
            </div>

            <section className="cp360-detail-hero" aria-labelledby="customer-detail-title">
              <div className="cp360-detail-identity">
                <span className="cp360-avatar" aria-hidden="true">{initials(customer.displayName)}</span>
                <div><h2>{customer.displayName}</h2><div className="cp360-hero-meta"><code>{customer.customerRef}</code><span>Referencia autoritativa del cliente</span></div></div>
              </div>
              <div className="cp360-detail-facts">
                <div><small>Pólizas relacionadas</small><strong>{customer.policies.length}</strong><span>según Customer 360</span></div>
                <div><small>Siniestros relacionados</small><strong>{customer.claims.length}</strong><span>correlacionados por backend</span></div>
                <div><small>Actualizado</small><strong>{formatDate(customer.updatedAt)}</strong><span>dato autoritativo</span></div>
              </div>
            </section>

            <div className="cp360-detail-grid">
              <section className="ops-panel cp360-relation-panel" aria-labelledby="customer-policies-title">
                <div className="ops-panel-heading"><div><h2 id="customer-policies-title">Pólizas relacionadas</h2><p>Contexto de cobertura disponible para este cliente.</p></div>{canReadPolicies && <Link to="/operator/policies">Directorio →</Link>}</div>
                {customer.policies.length === 0 ? <div className="ops-compact-empty">No hay pólizas relacionadas.</div> : (
                  <div className="cp360-card-list">
                    {customer.policies.map((policy) => (
                      <article className="cp360-relation-card" key={policy.policyId}>
                        <div className="cp360-relation-card-head"><span className="cp360-policy-icon" aria-hidden="true">▱</span><div><strong>{policy.policyReference}</strong><small>Legacy: {policy.legacyPolicyReference}</small></div><StatusBadge value={policy.recordStatus} /></div>
                        <div className="cp360-mini-facts r3-customer-policy-facts">
                          <span><small>Assets</small><strong>{policy.assets.length}</strong></span>
                          {policy.insurerReference && <span><small>Aseguradora ref.</small><strong>{policy.insurerReference}</strong></span>}
                        </div>
                        {canReadPolicies ? <Link className="cp360-card-action" to={`/operator/policies/${policy.policyId}`}>Abrir póliza 360 →</Link> : <span className="cp360-readonly-note">Tu rol no puede abrir el recurso Policy 360.</span>}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="ops-panel cp360-relation-panel" aria-labelledby="customer-claims-title">
                <div className="ops-panel-heading"><div><h2 id="customer-claims-title">Siniestros relacionados</h2><p>Proyección correlacionada por el backend R3.</p></div>{canReadClaims && <Link to="/operator/claims">Workspace →</Link>}</div>
                {customer.claims.length === 0 ? <div className="ops-compact-empty">No hay siniestros relacionados.</div> : (
                  <div className="cp360-claim-list">{customer.claims.map((claim) => <ClaimRow claim={claim} canOpen={canReadClaims} key={claim.claimId} />)}</div>
                )}
              </section>
            </div>

            <section className="cp360-contract-note">
              <div><strong>Alcance contractual</strong><span>Vista de contexto y navegación. No edita cliente, pólizas ni siniestros y no infiere datos ausentes del contrato R3.</span></div>
              <small className="r3-customer-tech-meta">Versión de registro: v{customer.version}</small>
            </section>
          </>
        ) : null}
      </main>
    </OperatorShell>
  );
}

function ClaimRow({ claim, canOpen }: { claim: RelatedClaimProjection; canOpen: boolean }) {
  const content = <><div><strong>{claim.trackingCode}</strong><small>{claim.policyReference} · {claim.vehicleReference}</small></div><span className={`cp360-claim-status is-${claim.status.toLowerCase()}`}>{claimStatusLabel(claim.status)}</span><time dateTime={claim.occurredAt}>{formatDate(claim.occurredAt)}</time>{canOpen && <span aria-hidden="true">›</span>}</>;
  return canOpen ? <Link className="cp360-claim-row" to={`/operator/claims/${claim.claimId}`}>{content}</Link> : <div className="cp360-claim-row">{content}</div>;
}

function StatusBadge({ value }: { value: CustomerRecordStatus }) {
  return <span className={`cp360-status is-${value.toLowerCase()}`}>{value === 'ACTIVE' ? 'Activo' : 'Inactivo'}</span>;
}

const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  RECEIVED: 'Recibido',
  UNDER_REVIEW: 'En revisión',
  OBSERVED: 'Requiere información',
  APPROVED: 'Aprobado',
  IN_REPAIR: 'En reparación',
  CLOSED: 'Cerrado',
};

function claimStatusLabel(value: ClaimStatus) {
  return CLAIM_STATUS_LABELS[value];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CU';
}
