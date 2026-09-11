import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  activateAdminGuidanceVersion,
  getAdminGuidance,
  updateAdminGuidanceState,
} from '../api/guidance-admin';
import type { GuidanceVersionProjection } from '../api/guidance-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminGuidanceDetailPage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();
  const guidanceQuery = useQuery({
    queryKey: ['admin', 'guidance-definition', definitionId],
    queryFn: () => getAdminGuidance(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'guidance-definition', definitionId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'guidance'] });
  };

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await guidanceQuery.refetch();
  };

  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activateAdminGuidanceVersion(
      definitionId,
      versionId,
      { expectedDefinitionVersion: guidanceQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const stateMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAdminGuidanceState(
      definitionId,
      { expectedDefinitionVersion: guidanceQuery.data!.data.version, enabled },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const failure = guidanceQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const definition = guidanceQuery.data?.data;
  const mutationFailure = (activateMutation.error ?? stateMutation.error) as ApiFailure | null;
  const mutationPending = activateMutation.isPending || stateMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main guidance-admin-main">
        <div className="guidance-breadcrumbs"><Link to="/operator/admin/guidance">Guidance</Link><span>/</span><span>{definition?.key ?? definitionId.slice(0, 8)}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {guidanceQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando Guidance…</div>
        ) : !definition ? null : (
          <>
            <section className="guidance-admin-hero" aria-labelledby="guidance-admin-title">
              <div>
                <span className="ops-kicker">Insurer Guidance Definition R3</span>
                <h1 id="guidance-admin-title">{definition.key}</h1>
                <div className="guidance-admin-hero-meta">
                  <span className={`guidance-enabled is-${definition.enabled ? 'enabled' : 'disabled'}`}>{definition.enabled ? 'Habilitada' : 'Deshabilitada'}</span>
                  <code>{definition.definitionId}</code>
                </div>
              </div>
              <div className="guidance-admin-hero-version">
                <small>Definition version</small>
                <strong>v{definition.version}</strong>
                <span>{definition.activeVersionId ? 'Tiene versión activa' : 'Sin versión activa'}</span>
              </div>
            </section>

            <section className="guidance-admin-actions" aria-label="Acciones de administración de Guidance">
              <Link className="guidance-primary-button" to={`/operator/admin/guidance/${definitionId}/versions/new`}>+ Crear nueva versión</Link>
              <button
                className={`guidance-state-button is-${definition.enabled ? 'disable' : 'enable'}`}
                type="button"
                disabled={mutationPending || (!definition.enabled && !definition.activeVersionId)}
                onClick={() => stateMutation.mutate(!definition.enabled)}
              >
                {stateMutation.isPending ? 'Aplicando…' : definition.enabled ? 'Deshabilitar definición' : definition.activeVersionId ? 'Habilitar definición' : 'Activa una versión antes de habilitar'}
              </button>
              <span>La mutación usa <strong>expectedDefinitionVersion {definition.version}</strong>.</span>
            </section>

            <section className="ops-panel guidance-version-panel" aria-labelledby="guidance-versions-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="guidance-versions-title">Historial de versiones</h2>
                  <p>El contenido existente es inmutable. Solo una versión DRAFT puede activarse.</p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={guidanceQuery.isFetching} onClick={() => void guidanceQuery.refetch()}>
                  {guidanceQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              <div className="guidance-version-list">
                {definition.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
                  <GuidanceVersionCard
                    key={version.versionId}
                    version={version}
                    active={version.versionId === definition.activeVersionId}
                    mutationPending={mutationPending}
                    onActivate={() => activateMutation.mutate(version.versionId)}
                  />
                ))}
              </div>
            </section>

            <section className="guidance-admin-contract-note">
              <strong>Frontera R3</strong>
              <p>Contexto, categoría, categorías documentales, instrucciones, assistance metadata y source classification son configuración publicada. La UI no les asigna reglas de negocio adicionales. Los 409 refrescan la proyección autoritativa, sin reintentos ciegos.</p>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function GuidanceVersionCard({ version, active, mutationPending, onActivate }: {
  version: GuidanceVersionProjection;
  active: boolean;
  mutationPending: boolean;
  onActivate: () => void;
}) {
  const metadata = Object.entries(version.assistanceMetadata);
  return (
    <article className={`guidance-version-card${active ? ' is-active' : ''}`}>
      <div className="guidance-version-card-heading">
        <div>
          <span className={`guidance-version-status is-${version.status.toLowerCase()}`}>{version.status}</span>
          <h3>Versión {version.versionNumber}</h3>
          <code>{version.versionId}</code>
        </div>
        {version.status === 'DRAFT' && (
          <button className="guidance-activate-button" type="button" disabled={mutationPending} onClick={onActivate}>
            {mutationPending ? 'Procesando…' : 'Activar DRAFT'}
          </button>
        )}
      </div>

      <div className="guidance-version-facts">
        <div><span>Context reference</span><strong>{version.insurerContextReference}</strong></div>
        <div><span>Guidance category</span><strong>{version.guidanceCategory}</strong></div>
        <div><span>Source classification</span><strong>{version.sourceClassification}</strong></div>
        <div><span>Creada</span><strong>{formatDateTime(version.createdAt)}</strong></div>
        <div><span>Activada</span><strong>{version.activatedAt ? formatDateTime(version.activatedAt) : '—'}</strong></div>
        <div><span>Retirada</span><strong>{version.retiredAt ? formatDateTime(version.retiredAt) : '—'}</strong></div>
      </div>

      <div className="guidance-content-columns">
        <div className="guidance-content-block">
          <span>Document categories ({version.documentCategories.length})</span>
          {version.documentCategories.length ? <ul>{version.documentCategories.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <small>Sin categorías documentales.</small>}
        </div>
        <div className="guidance-content-block">
          <span>Instructions ({version.instructions.length})</span>
          {version.instructions.length ? <ol>{version.instructions.map((item, index) => <li key={index}>{item}</li>)}</ol> : <small>Sin instrucciones.</small>}
        </div>
      </div>

      <div className="guidance-metadata-summary">
        <span>Assistance metadata ({metadata.length})</span>
        {metadata.length ? <div>{metadata.map(([key, value]) => <code key={key}>{key}: {value}</code>)}</div> : <small>Sin metadata declarada.</small>}
      </div>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
