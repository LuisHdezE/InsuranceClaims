import { useEffect, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  activateAdminAutomationVersion,
  getAdminAutomation,
  updateAdminAutomationState,
} from '../api/automation-admin';
import type { AutomationVersionProjection } from '../api/automation-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { isPublicDemoOperator } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminAutomationDetailPage() {
  const { definitionId } = useParams();
  const { session, signOut } = useOperatorSession();
  const automationQuery = useQuery({
    queryKey: ['admin', 'automation', definitionId],
    queryFn: () => getAdminAutomation(definitionId!, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const refreshOnConflict = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await automationQuery.refetch();
  };

  const activationMutation = useMutation({
    mutationFn: ({ versionId, expectedDefinitionVersion }: { versionId: string; expectedDefinitionVersion: number }) => activateAdminAutomationVersion(definitionId!, versionId, { expectedDefinitionVersion }, session!.accessToken),
    onSuccess: async () => { await automationQuery.refetch(); },
    onError: refreshOnConflict,
  });
  const stateMutation = useMutation({
    mutationFn: ({ enabled, expectedDefinitionVersion }: { enabled: boolean; expectedDefinitionVersion: number }) => updateAdminAutomationState(definitionId!, { enabled, expectedDefinitionVersion }, session!.accessToken),
    onSuccess: async () => { await automationQuery.refetch(); },
    onError: refreshOnConflict,
  });

  const failure = (automationQuery.error ?? activationMutation.error ?? stateMutation.error) as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  const automation = automationQuery.data?.data;
  const versions = useMemo(() => automation?.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber) ?? [], [automation]);

  if (!session) return null;
  const demoReadOnly = isPublicDemoOperator(session.operator);

  return (
    <OperatorShell>
      <main className="operator-main ops-main aa-admin-main automations-r3-detail">
        <div className="aa-breadcrumbs"><Link to="/operator/admin/automations">Automatizaciones</Link><span>/</span><span>Detalle</span></div>
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {automationQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando automatización…</div>}

        {automation && (
          <>
            <section className="aa-detail-hero automations-r3-detail-hero">
              <div>
                <span className="ops-kicker">Automatización R3</span>
                <h1>{automation.displayName}</h1>
                <code>{automation.key}</code>
                <p>
                  Definición v{automation.version}. El historial de versiones es inmutable y la API mantiene la autoridad sobre activación y concurrencia.
                </p>
              </div>
              <div className="aa-detail-actions">
                <span className={`aa-enabled is-${automation.enabled ? 'enabled' : 'disabled'}`}>
                  {automation.enabled ? 'Habilitada' : 'Deshabilitada'}
                </span>
                {demoReadOnly ? (
                  <span className="automations-r3-readonly-badge">Solo lectura</span>
                ) : (
                  <>
                    <Link className="aa-secondary-button" to={`/operator/admin/automations/${automation.definitionId}/versions/new`}>Nueva versión</Link>
                    <button
                      className="aa-primary-button"
                      type="button"
                      disabled={stateMutation.isPending || (!automation.enabled && !automation.activeVersionId)}
                      onClick={() => stateMutation.mutate({ enabled: !automation.enabled, expectedDefinitionVersion: automation.version })}
                    >
                      {stateMutation.isPending ? 'Guardando…' : automation.enabled ? 'Deshabilitar' : 'Habilitar'}
                    </button>
                  </>
                )}
              </div>
            </section>

            <section className="aa-contract-strip automations-r3-detail-summary" aria-label="Estado de automatización">
              <div><strong>Versión de definición</strong><span>v{automation.version}</span></div>
              <div><strong>Versión activa</strong><span>{activeLabel(automation.versions, automation.activeVersionId)}</span></div>
              <div><strong>Versiones</strong><span>{automation.versions.length}</span></div>
            </section>

            <section className="ops-panel aa-version-panel automations-r3-version-panel" aria-labelledby="aa-version-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="aa-version-title">Historial de versiones</h2>
                  <p>
                    {demoReadOnly
                      ? 'Inspección del historial sintético gobernado. Las mutaciones permanecen ocultas en la demo pública.'
                      : 'DRAFT puede activarse. ACTIVE y RETIRED forman parte del historial inmutable.'}
                  </p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={automationQuery.isFetching} onClick={() => void automationQuery.refetch()}>
                  {automationQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>
              <div className="aa-version-list">
                {versions.map((version) => (
                  <article className={`aa-version-card is-${version.status.toLowerCase()}`} key={version.versionId}>
                    <div className="aa-version-heading">
                      <div>
                        <span className={`aa-status is-${version.status.toLowerCase()}`}>{version.status}</span>
                        <h3>Versión {version.versionNumber}</h3>
                        <small>{version.sourceClassification}</small>
                      </div>
                      {!demoReadOnly && version.status === 'DRAFT' && (
                        <button
                          className="aa-primary-button"
                          type="button"
                          disabled={activationMutation.isPending}
                          onClick={() => activationMutation.mutate({ versionId: version.versionId, expectedDefinitionVersion: automation.version })}
                        >
                          {activationMutation.isPending ? 'Activando…' : 'Activar DRAFT'}
                        </button>
                      )}
                    </div>
                    <AutomationVersionReadOnly version={version} />
                    <footer className="aa-version-footer">
                      <span>Creada: {formatTimestamp(version.createdAt)}</span>
                      <span>Activada: {formatTimestamp(version.activatedAt)}</span>
                      <span>Retirada: {formatTimestamp(version.retiredAt)}</span>
                    </footer>
                  </article>
                ))}
              </div>
            </section>

            <section className="aa-admin-contract-note">
              <strong>{demoReadOnly ? 'Demo pública protegida' : 'Concurrencia optimista'}</strong>
              <p>
                {demoReadOnly
                  ? 'Esta sesión permite revisar definiciones, versiones, condiciones y acciones sintéticas. Crear, activar, habilitar o deshabilitar permanece bloqueado por el cliente y por la API.'
                  : 'Crear versión, activar y habilitar o deshabilitar usan expectedDefinitionVersion. Un 409 fuerza el refresco de esta proyección y nunca dispara un reintento ciego.'}
              </p>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function AutomationVersionReadOnly({ version }: { version: AutomationVersionProjection }) {
  return (
    <div className="aa-version-content">
      <div className="aa-rule-summary">
        <span><small>CUANDO</small><strong>{version.content.when.eventType}</strong></span>
        <span><small>SI</small><strong>{version.content.if.length} condiciones</strong></span>
        <span><small>ESPERA</small><strong>{version.content.wait ? `${version.content.wait.delaySeconds}s` : '—'}</strong></span>
        <span><small>ENTONCES</small><strong>{version.content.then.length} acciones</strong></span>
      </div>
      {version.content.if.length > 0 && (
        <div className="aa-read-block">
          <h4>Condiciones</h4>
          {version.content.if.map((condition, index) => (
            <code key={`${condition.field}-${index}`}>
              {condition.field} {condition.operator}{condition.value === undefined ? '' : ` ${JSON.stringify(condition.value)}`}
            </code>
          ))}
        </div>
      )}
      <div className="aa-read-block">
        <h4>Acciones</h4>
        {version.content.then.map((action) => (
          <div className="aa-read-action" key={action.key}>
            <strong>{action.key}</strong><span>{action.type}</span><code>{JSON.stringify(action.parameters)}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function activeLabel(versions: AutomationVersionProjection[], activeVersionId: string | null) {
  const active = versions.find((version) => version.versionId === activeVersionId);
  return active ? `v${active.versionNumber}` : 'Sin versión activa';
}

function formatTimestamp(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}
