import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  activateAdminPipelineVersion,
  getAdminPipeline,
  updateAdminPipelineState,
} from '../api/pipeline-admin';
import type { PipelineVersionProjection } from '../api/pipeline-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminPipelineDetailPage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();

  const pipelineQuery = useQuery({
    queryKey: ['admin', 'pipeline', definitionId],
    queryFn: () => getAdminPipeline(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'pipeline', definitionId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'pipelines'] });
  };

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await pipelineQuery.refetch();
  };

  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activateAdminPipelineVersion(
      definitionId,
      versionId,
      { expectedDefinitionVersion: pipelineQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const stateMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAdminPipelineState(
      definitionId,
      { expectedDefinitionVersion: pipelineQuery.data!.data.version, enabled },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const failure = pipelineQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const pipeline = pipelineQuery.data?.data;
  const mutationFailure = (activateMutation.error ?? stateMutation.error) as ApiFailure | null;
  const mutationPending = activateMutation.isPending || stateMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main pipeline-admin-main">
        <div className="pipeline-breadcrumbs"><Link to="/operator/admin/pipelines">Pipelines</Link><span>/</span><span>{pipeline?.key ?? definitionId.slice(0, 8)}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {pipelineQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando pipeline…</div>
        ) : !pipeline ? null : (
          <>
            <section className="pipeline-admin-hero" aria-labelledby="pipeline-admin-title">
              <div>
                <span className="ops-kicker">Pipeline Definition R3</span>
                <h1 id="pipeline-admin-title">{pipeline.displayName}</h1>
                <div className="pipeline-admin-hero-meta">
                  <code>{pipeline.key}</code>
                  <span className={`pipeline-consumer is-${pipeline.consumerType.toLowerCase()}`}>{pipeline.consumerType}</span>
                  <span className={`pipeline-enabled is-${pipeline.enabled ? 'enabled' : 'disabled'}`}>{pipeline.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
                </div>
              </div>
              <div className="pipeline-admin-hero-version">
                <small>Definition version</small>
                <strong>v{pipeline.version}</strong>
                <span>{pipeline.activeVersionId ? 'Tiene versión activa' : 'Sin versión activa'}</span>
              </div>
            </section>

            <section className="pipeline-admin-actions" aria-label="Acciones de administración">
              <Link className="pipeline-primary-button" to={`/operator/admin/pipelines/${definitionId}/versions/new`}>+ Crear nueva versión</Link>
              <button
                className={`pipeline-state-button is-${pipeline.enabled ? 'disable' : 'enable'}`}
                type="button"
                disabled={mutationPending || (!pipeline.enabled && !pipeline.activeVersionId)}
                onClick={() => stateMutation.mutate(!pipeline.enabled)}
              >
                {stateMutation.isPending ? 'Aplicando…' : pipeline.enabled ? 'Deshabilitar definición' : pipeline.activeVersionId ? 'Habilitar definición' : 'Activa una versión antes de habilitar'}
              </button>
              <span>El cambio usa <strong>expectedDefinitionVersion {pipeline.version}</strong>.</span>
            </section>

            <section className="ops-panel pipeline-version-panel" aria-labelledby="pipeline-versions-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="pipeline-versions-title">Historial de versiones</h2>
                  <p>Las versiones existentes son inmutables. Solo una DRAFT elegible puede activarse.</p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={pipelineQuery.isFetching} onClick={() => void pipelineQuery.refetch()}>
                  {pipelineQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              <div className="pipeline-version-list">
                {pipeline.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
                  <PipelineVersionCard
                    key={version.versionId}
                    version={version}
                    active={version.versionId === pipeline.activeVersionId}
                    mutationPending={mutationPending}
                    onActivate={() => activateMutation.mutate(version.versionId)}
                  />
                ))}
              </div>
            </section>

            <section className="pipeline-admin-contract-note">
              <strong>Frontera R3</strong>
              <p>Enable/disable y activación pueden fallar por conflictos de configuración o versión. Ante 409 la UI refresca la proyección autoritativa y no reintenta a ciegas.</p>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function PipelineVersionCard({
  version,
  active,
  mutationPending,
  onActivate,
}: {
  version: PipelineVersionProjection;
  active: boolean;
  mutationPending: boolean;
  onActivate: () => void;
}) {
  return (
    <article className={`pipeline-version-card${active ? ' is-active' : ''}`}>
      <div className="pipeline-version-card-heading">
        <div>
          <span className={`pipeline-version-status is-${version.status.toLowerCase()}`}>{version.status}</span>
          <h3>Versión {version.versionNumber}</h3>
          <code>{version.versionId}</code>
        </div>
        {version.status === 'DRAFT' && (
          <button className="pipeline-activate-button" type="button" disabled={mutationPending} onClick={onActivate}>
            {mutationPending ? 'Procesando…' : 'Activar DRAFT'}
          </button>
        )}
      </div>

      <div className="pipeline-version-facts">
        <div><span>Source classification</span><strong>{version.sourceClassification}</strong></div>
        <div><span>Creada</span><strong>{formatDateTime(version.createdAt)}</strong></div>
        <div><span>Activada</span><strong>{version.activatedAt ? formatDateTime(version.activatedAt) : '—'}</strong></div>
        <div><span>Retirada</span><strong>{version.retiredAt ? formatDateTime(version.retiredAt) : '—'}</strong></div>
      </div>

      <div className="pipeline-stage-map">
        {version.stages.map((stage) => (
          <div className="pipeline-stage-node" key={stage.stageKey}>
            <div className="pipeline-stage-node-title">
              <span>{stage.sortOrder}</span>
              <div><strong>{stage.displayName}</strong><code>{stage.stageKey}</code></div>
            </div>
            <div className="pipeline-stage-node-next">
              <span>Permite</span>
              {stage.allowedNextStageKeys.length
                ? stage.allowedNextStageKeys.map((target) => <code key={target}>{target}</code>)
                : <small>Sin transición siguiente publicada</small>}
            </div>
            {Object.keys(stage.reportingFlags).length > 0 && (
              <div className="pipeline-stage-flags">
                {Object.entries(stage.reportingFlags).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
