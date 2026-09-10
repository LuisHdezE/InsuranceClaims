import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getPolicy } from '../api/customer-policy';
import type { PolicyRecordStatus, RelatedClaimProjection } from '../api/customer-policy-types';
import type { ApiFailure } from '../api/types';
import { hasPermission } from '../auth/staff-access';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorPolicyDetailPage() {
  const { policyId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const policyQuery = useQuery({
    queryKey: ['operator', 'policy', policyId],
    queryFn: () => getPolicy(policyId, session!.accessToken),
    enabled: Boolean(session && policyId),
  });

  const failure = policyQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const policy = policyQuery.data?.data;
  const canReadCustomers = hasPermission(session.operator.role, 'customers.read');
  const canReadClaims = hasPermission(session.operator.role, 'claims.backoffice.read');

  return (
    <OperatorShell>
      <main className="operator-main ops-main cp360-main">
        <div className="cp360-breadcrumbs"><Link to="/operator/policies">Pólizas</Link><span>/</span><span>{policy?.policyReference ?? 'Detalle'}</span></div>
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        {policyQuery.isLoading ? <div className="ops-panel ops-loading" role="status">Cargando Policy 360…</div> : policy ? (
          <>
            <section className="cp360-detail-hero cp360-policy-hero" aria-labelledby="policy-detail-title">
              <div className="cp360-detail-identity"><span className="cp360-avatar is-policy" aria-hidden="true">▱</span><div><span className="ops-kicker">Policy 360</span><h1 id="policy-detail-title">{policy.policyReference}</h1><div className="cp360-hero-meta"><span>Legacy: <code>{policy.legacyPolicyReference}</code></span><StatusBadge value={policy.recordStatus} /><span>v{policy.version}</span></div></div></div>
              <div className="cp360-detail-facts"><div><small>Assets</small><strong>{policy.assets.length}</strong></div><div><small>Claims</small><strong>{policy.claims.length}</strong></div><div><small>Aseguradora ref.</small><strong>{policy.insurerReference ?? '—'}</strong></div></div>
            </section>

            <div className="cp360-detail-grid">
              <section className="ops-panel cp360-relation-panel" aria-labelledby="policy-customer-title">
                <div className="ops-panel-heading"><div><h2 id="policy-customer-title">Cliente relacionado</h2><p>Identidad resumida devuelta por Policy 360.</p></div></div>
                {policy.customer ? <div className="cp360-customer-summary"><span className="cp360-avatar is-small" aria-hidden="true">{initials(policy.customer.displayName)}</span><div><strong>{policy.customer.displayName}</strong><code>{policy.customer.customerRef}</code><StatusBadge value={policy.customer.status} /></div>{canReadCustomers && <Link to={`/operator/customers/${policy.customer.customerId}`}>Abrir Customer 360 →</Link>}</div> : <div className="ops-compact-empty">El API no devolvió un cliente relacionado.</div>}
              </section>

              <section className="ops-panel cp360-relation-panel" aria-labelledby="policy-metadata-title">
                <div className="ops-panel-heading"><div><h2 id="policy-metadata-title">Metadata operacional</h2><p>Campos opacos transportados por R3; la UI los presenta sin reinterpretarlos.</p></div></div>
                <MetadataGrid value={policy.operationalMetadata} emptyLabel="Sin metadata operacional." />
              </section>
            </div>

            <section className="ops-panel cp360-relation-panel" aria-labelledby="policy-assets-title">
              <div className="ops-panel-heading"><div><h2 id="policy-assets-title">Assets cubiertos por el registro</h2><p>Referencias modernas y legacy persistidas para esta póliza.</p></div></div>
              {policy.assets.length === 0 ? <div className="ops-compact-empty">No hay assets asociados.</div> : <div className="cp360-assets-grid">{policy.assets.map((asset) => <article className="cp360-asset-card" key={asset.assetId}><span className="cp360-asset-glyph" aria-hidden="true">◇</span><div><small>{asset.assetType}</small><strong>{asset.assetReference}</strong><span>Legacy: {asset.legacyAssetReference}</span></div><MetadataGrid value={asset.metadata} compact emptyLabel="Sin metadata" /></article>)}</div>}
            </section>

            <section className="ops-panel cp360-relation-panel" aria-labelledby="policy-claims-title">
              <div className="ops-panel-heading"><div><h2 id="policy-claims-title">Claims relacionados</h2><p>Proyección correlacionada directamente por Policy 360.</p></div>{canReadClaims && <Link to="/operator/claims">Abrir Claims →</Link>}</div>
              {policy.claims.length === 0 ? <div className="ops-compact-empty">No hay Claims relacionados.</div> : <div className="cp360-claim-list">{policy.claims.map((claim) => <ClaimRow claim={claim} canOpen={canReadClaims} key={claim.claimId} />)}</div>}
            </section>

            <section className="cp360-contract-note"><strong>Read-only por contrato</strong><span>R3 expone lectura 360 en este corte. No presentamos edición de cliente, póliza, asset o metadata porque no existe operación autoritativa para ello.</span></section>
          </>
        ) : null}
      </main>
    </OperatorShell>
  );
}

function MetadataGrid({ value, compact = false, emptyLabel }: { value: Record<string, unknown>; compact?: boolean; emptyLabel: string }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return <div className={compact ? 'cp360-metadata-empty is-compact' : 'cp360-metadata-empty'}>{emptyLabel}</div>;
  return <dl className={compact ? 'cp360-metadata-grid is-compact' : 'cp360-metadata-grid'}>{entries.map(([key, item]) => <div key={key}><dt>{key}</dt><dd>{formatMetadata(item)}</dd></div>)}</dl>;
}

function ClaimRow({ claim, canOpen }: { claim: RelatedClaimProjection; canOpen: boolean }) {
  const content = <><div><strong>{claim.trackingCode}</strong><small>{claim.vehicleReference}</small></div><span className={`cp360-claim-status is-${claim.status.toLowerCase()}`}>{claim.status.replaceAll('_', ' ')}</span><time dateTime={claim.occurredAt}>{formatDate(claim.occurredAt)}</time>{canOpen && <span aria-hidden="true">›</span>}</>;
  return canOpen ? <Link className="cp360-claim-row" to={`/operator/claims/${claim.claimId}`}>{content}</Link> : <div className="cp360-claim-row">{content}</div>;
}

function StatusBadge({ value }: { value: PolicyRecordStatus }) {
  return <span className={`cp360-status is-${value.toLowerCase()}`}>{value === 'ACTIVE' ? 'Activa' : 'Inactiva'}</span>;
}

function formatMetadata(value: unknown) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium' }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'CU';
}
