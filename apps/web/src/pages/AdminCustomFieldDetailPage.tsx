import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  activateAdminCustomFieldVersion,
  getAdminCustomField,
  updateAdminCustomFieldState,
} from '../api/custom-field-admin';
import type { CustomFieldVersionProjection } from '../api/custom-field-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminCustomFieldDetailPage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();
  const fieldQuery = useQuery({
    queryKey: ['admin', 'custom-field', definitionId],
    queryFn: () => getAdminCustomField(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'custom-field', definitionId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'custom-fields'] });
  };

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await fieldQuery.refetch();
  };

  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activateAdminCustomFieldVersion(
      definitionId,
      versionId,
      { expectedDefinitionVersion: fieldQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const stateMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAdminCustomFieldState(
      definitionId,
      { expectedDefinitionVersion: fieldQuery.data!.data.version, enabled },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const failure = fieldQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const field = fieldQuery.data?.data;
  const mutationFailure = (activateMutation.error ?? stateMutation.error) as ApiFailure | null;
  const mutationPending = activateMutation.isPending || stateMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main cf-admin-main">
        <div className="cf-breadcrumbs"><Link to="/operator/admin/custom-fields">Custom Fields</Link><span>/</span><span>{field?.fieldKey ?? definitionId.slice(0, 8)}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {fieldQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando Custom Field…</div>
        ) : !field ? null : (
          <>
            <section className="cf-admin-hero" aria-labelledby="cf-admin-title">
              <div>
                <span className="ops-kicker">Custom Field Definition R3</span>
                <h1 id="cf-admin-title">{field.fieldKey}</h1>
                <div className="cf-admin-hero-meta">
                  <span className={`cf-target is-${field.targetType.toLowerCase()}`}>{field.targetType}</span>
                  <span className={`cf-enabled is-${field.enabled ? 'enabled' : 'disabled'}`}>{field.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
                  <code>{field.definitionId}</code>
                </div>
              </div>
              <div className="cf-admin-hero-version">
                <small>Definition version</small>
                <strong>v{field.version}</strong>
                <span>{field.activeVersionId ? 'Tiene versión activa' : 'Sin versión activa'}</span>
              </div>
            </section>

            <section className="cf-admin-actions" aria-label="Acciones de administración de Custom Field">
              <Link className="cf-primary-button" to={`/operator/admin/custom-fields/${definitionId}/versions/new`}>+ Crear nueva versión</Link>
              <button
                className={`cf-state-button is-${field.enabled ? 'disable' : 'enable'}`}
                type="button"
                disabled={mutationPending || (!field.enabled && !field.activeVersionId)}
                onClick={() => stateMutation.mutate(!field.enabled)}
              >
                {stateMutation.isPending ? 'Aplicando…' : field.enabled ? 'Deshabilitar definición' : field.activeVersionId ? 'Habilitar definición' : 'Activa una versión antes de habilitar'}
              </button>
              <span>La mutación usa <strong>expectedDefinitionVersion {field.version}</strong>.</span>
            </section>

            <section className="ops-panel cf-version-panel" aria-labelledby="cf-versions-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="cf-versions-title">Historial de versiones</h2>
                  <p>fieldKey y target son identidad. Los cambios de contenido crean una nueva versión DRAFT inmutable.</p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={fieldQuery.isFetching} onClick={() => void fieldQuery.refetch()}>
                  {fieldQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              <div className="cf-version-list">
                {field.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
                  <CustomFieldVersionCard
                    key={version.versionId}
                    version={version}
                    active={version.versionId === field.activeVersionId}
                    mutationPending={mutationPending}
                    onActivate={() => activateMutation.mutate(version.versionId)}
                  />
                ))}
              </div>
            </section>

            <section className="cf-admin-contract-note">
              <strong>Concurrencia y retiro</strong>
              <p>Solo DRAFT puede activarse. Deshabilitar una definición activa puede retirar su versión activa. Los conflictos 409 refrescan la proyección autoritativa y nunca disparan un reintento ciego.</p>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function CustomFieldVersionCard({
  version,
  active,
  mutationPending,
  onActivate,
}: {
  version: CustomFieldVersionProjection;
  active: boolean;
  mutationPending: boolean;
  onActivate: () => void;
}) {
  const metadata = Object.entries(version.validationMetadata);
  return (
    <article className={`cf-version-card${active ? ' is-active' : ''}`}>
      <div className="cf-version-card-heading">
        <div>
          <span className={`cf-version-status is-${version.status.toLowerCase()}`}>{version.status}</span>
          <h3>Versión {version.versionNumber}</h3>
          <code>{version.versionId}</code>
        </div>
        {version.status === 'DRAFT' && (
          <button className="cf-activate-button" type="button" disabled={mutationPending} onClick={onActivate}>
            {mutationPending ? 'Procesando…' : 'Activar DRAFT'}
          </button>
        )}
      </div>

      <div className="cf-version-facts">
        <div><span>Tipo</span><strong>{version.valueType}</strong></div>
        <div><span>Sensibilidad</span><strong>{version.sensitivityClassification}</strong></div>
        <div><span>Source classification</span><strong>{version.sourceClassification}</strong></div>
        <div><span>Creada</span><strong>{formatDateTime(version.createdAt)}</strong></div>
        <div><span>Activada</span><strong>{version.activatedAt ? formatDateTime(version.activatedAt) : '—'}</strong></div>
        <div><span>Retirada</span><strong>{version.retiredAt ? formatDateTime(version.retiredAt) : '—'}</strong></div>
      </div>

      <div className="cf-content-block"><span>Nombre visible</span><strong>{version.displayName}</strong></div>

      {version.valueType === 'ENUM' && (
        <div className="cf-token-summary">
          <span>Valores ENUM ({version.enumValues.length})</span>
          <div>{version.enumValues.map((entry) => <code key={entry}>{entry}</code>)}</div>
        </div>
      )}

      <div className="cf-token-summary">
        <span>validationMetadata ({metadata.length})</span>
        {metadata.length > 0
          ? <div>{metadata.map(([key, value]) => <code key={key}>{key}: {String(value)}</code>)}</div>
          : <small>Sin metadata de validación.</small>}
      </div>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
