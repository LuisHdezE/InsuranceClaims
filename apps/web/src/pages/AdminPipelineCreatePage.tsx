import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createAdminPipeline } from '../api/pipeline-admin';
import type { PipelineConsumerType } from '../api/pipeline-admin-types';
import type { ApiFailure } from '../api/types';
import {
  emptyStageDraft,
  PipelineStageEditor,
  stageDraftsToPayload,
  type PipelineStageDraft,
} from '../components/PipelineStageEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminPipelineCreatePage() {
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [consumerType, setConsumerType] = useState<PipelineConsumerType>('CLAIM');
  const [sourceClassification, setSourceClassification] = useState('');
  const [stages, setStages] = useState<PipelineStageDraft[]>([emptyStageDraft()]);
  const [clientError, setClientError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const payloadStages = stageDraftsToPayload(stages);
      return createAdminPipeline({
        key: key.trim(),
        displayName: displayName.trim(),
        consumerType,
        sourceClassification: sourceClassification.trim(),
        stages: payloadStages,
      }, session!.accessToken);
    },
    onSuccess: (result) => {
      navigate(`/operator/admin/pipelines/${result.data.definitionId}`, { replace: true });
    },
    onError: (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
    },
  });

  if (!session) return null;
  const failure = mutation.error as ApiFailure | null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    if (!key.trim() || !displayName.trim() || !sourceClassification.trim()) {
      setClientError('Key, nombre visible y source classification son obligatorios.');
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
        <div className="pipeline-breadcrumbs"><Link to="/operator/admin/pipelines">Pipelines</Link><span>/</span><span>Nueva definición</span></div>

        <div className="ops-page-heading pipeline-admin-page-heading">
          <div>
            <span className="ops-kicker">New Definition</span>
            <h1>Crear pipeline</h1>
            <p>R3 crea la definición deshabilitada y una primera versión DRAFT. La activación y el enable son pasos separados y explícitos.</p>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {clientError && <div className="pipeline-client-error" role="alert">{clientError}</div>}

        <form className="pipeline-admin-form" onSubmit={submit}>
          <section className="ops-panel pipeline-definition-form-card" aria-labelledby="pipeline-definition-title">
            <div className="ops-panel-heading">
              <div><h2 id="pipeline-definition-title">Identidad de la definición</h2><p>Valores gobernados por los límites R3, sin tipos de consumidor adicionales.</p></div>
            </div>
            <div className="pipeline-form-grid">
              <label>
                <span>Key</span>
                <input value={key} maxLength={80} disabled={mutation.isPending} placeholder="claims-main" onChange={(event) => setKey(event.target.value)} />
                <small>Única y estable. El servidor valida el patrón admitido.</small>
              </label>
              <label>
                <span>Nombre visible</span>
                <input value={displayName} maxLength={160} disabled={mutation.isPending} placeholder="Claims principal" onChange={(event) => setDisplayName(event.target.value)} />
              </label>
              <label>
                <span>Consumer type</span>
                <select value={consumerType} disabled={mutation.isPending} onChange={(event) => setConsumerType(event.target.value as PipelineConsumerType)}>
                  <option value="CLAIM">CLAIM</option>
                  <option value="RENEWAL">RENEWAL</option>
                  <option value="COLLECTION">COLLECTION</option>
                </select>
              </label>
              <label>
                <span>Source classification</span>
                <input value={sourceClassification} maxLength={80} disabled={mutation.isPending} placeholder="R3_ADMIN" onChange={(event) => setSourceClassification(event.target.value)} />
                <small>Clasificación opaca conservada por R3; la UI no le asigna semántica adicional.</small>
              </label>
            </div>
          </section>

          <PipelineStageEditor stages={stages} onChange={setStages} disabled={mutation.isPending} />

          <div className="pipeline-form-actions">
            <Link className="pipeline-secondary-button" to="/operator/admin/pipelines">Cancelar</Link>
            <button className="pipeline-primary-button" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear definición + DRAFT'}
            </button>
          </div>
        </form>
      </main>
    </OperatorShell>
  );
}
