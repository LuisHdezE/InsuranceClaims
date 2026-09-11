import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createAdminPipelineVersion, getAdminPipeline } from '../api/pipeline-admin';
import type { ApiFailure } from '../api/types';
import {
  emptyStageDraft,
  PipelineStageEditor,
  stageDraftFromProjection,
  stageDraftsToPayload,
  type PipelineStageDraft,
} from '../components/PipelineStageEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminPipelineVersionCreatePage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [sourceClassification, setSourceClassification] = useState('');
  const [stages, setStages] = useState<PipelineStageDraft[]>([emptyStageDraft()]);
  const [initializedFromVersionId, setInitializedFromVersionId] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const pipelineQuery = useQuery({
    queryKey: ['admin', 'pipeline', definitionId],
    queryFn: () => getAdminPipeline(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const pipeline = pipelineQuery.data?.data;
  const latestVersion = useMemo(
    () => pipeline?.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null,
    [pipeline],
  );

  useEffect(() => {
    if (!latestVersion || initializedFromVersionId === latestVersion.versionId) return;
    setSourceClassification(latestVersion.sourceClassification);
    setStages(latestVersion.stages.map(stageDraftFromProjection));
    setInitializedFromVersionId(latestVersion.versionId);
  }, [latestVersion, initializedFromVersionId]);

  const mutation = useMutation({
    mutationFn: () => createAdminPipelineVersion(definitionId, {
      expectedDefinitionVersion: pipeline!.version,
      sourceClassification: sourceClassification.trim(),
      stages: stageDraftsToPayload(stages),
    }, session!.accessToken),
    onSuccess: () => navigate(`/operator/admin/pipelines/${definitionId}`, { replace: true }),
    onError: async (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
      if (failure.problem?.status === 409) await pipelineQuery.refetch();
    },
  });

  const failure = pipelineQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const mutationFailure = mutation.error as ApiFailure | null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    if (!sourceClassification.trim()) {
      setClientError('Source classification es obligatoria.');
      return;
    }
    try {
      stageDraftsToPayload(stages);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : 'La definición de etapas no es válida.');
      return;
    }
    mutation.mutate();
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main pipeline-admin-main">
        <div className="pipeline-breadcrumbs">
          <Link to="/operator/admin/pipelines">Pipelines</Link><span>/</span>
          <Link to={`/operator/admin/pipelines/${definitionId}`}>{pipeline?.key ?? definitionId.slice(0, 8)}</Link><span>/</span>
          <span>Nueva versión</span>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}
        {clientError && <div className="pipeline-client-error" role="alert">{clientError}</div>}

        {pipelineQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando definición…</div>
        ) : !pipeline ? null : (
          <form className="pipeline-admin-form" onSubmit={submit}>
            <div className="ops-page-heading pipeline-admin-page-heading">
              <div>
                <span className="ops-kicker">Immutable Configuration Version</span>
                <h1>Nueva versión · {pipeline.displayName}</h1>
                <p>Se parte de la última versión como ayuda de edición. Guardar crea una DRAFT nueva; ninguna versión existente se modifica.</p>
              </div>
              <span className="pipeline-definition-version">definition v{pipeline.version}</span>
            </div>

            <section className="ops-panel pipeline-definition-form-card">
              <div className="pipeline-form-grid is-compact">
                <label>
                  <span>Source classification</span>
                  <input value={sourceClassification} maxLength={80} disabled={mutation.isPending} onChange={(event) => setSourceClassification(event.target.value)} />
                </label>
                <div className="pipeline-form-context">
                  <span>Consumer</span><strong>{pipeline.consumerType}</strong>
                  <small>Key: <code>{pipeline.key}</code></small>
                </div>
              </div>
            </section>

            <PipelineStageEditor stages={stages} onChange={setStages} disabled={mutation.isPending} />

            <div className="pipeline-form-actions">
              <Link className="pipeline-secondary-button" to={`/operator/admin/pipelines/${definitionId}`}>Cancelar</Link>
              <button className="pipeline-primary-button" type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Creando versión…' : 'Crear nueva DRAFT'}
              </button>
            </div>
          </form>
        )}
      </main>
    </OperatorShell>
  );
}
