import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hasPermission } from '../auth/staff-access';
import { listClaims } from '../api/claims';
import { moveClaimOperationalStage } from '../api/claims-work';
import type { PipelineWorkItemResponse } from '../api/claims-work-types';
import type { ApiFailure } from '../api/types';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { OperatorApiErrorNotice } from './OperatorApiErrorNotice';

export function ClaimOperationalStagePanel({ claimId, trackingCode }: { claimId: string; trackingCode: string }) {
  const queryClient = useQueryClient();
  const { session, signOut } = useOperatorSession();
  const [targetStage, setTargetStage] = useState('');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [lastProjection, setLastProjection] = useState<PipelineWorkItemResponse | null>(null);

  const projectionQuery = useQuery({
    queryKey: ['operator', 'claim', claimId, 'operational-projection'],
    queryFn: async () => {
      const result = await listClaims({ page: 1, pageSize: 100, search: trackingCode }, session!.accessToken);
      return {
        ...result,
        data: result.data.items.find((item) => item.claimId === claimId) ?? null,
      };
    },
    enabled: Boolean(session && claimId && trackingCode),
  });

  const queryFailure = projectionQuery.error as ApiFailure | null;
  useEffect(() => {
    if (queryFailure?.problem?.status === 401) signOut();
  }, [queryFailure, signOut]);

  const moveMutation = useMutation({
    mutationFn: (input: { toStageKey: string; expectedVersion: number }) =>
      moveClaimOperationalStage(claimId, input, session!.accessToken),
    onSuccess: async (result) => {
      setFailure(null);
      setTargetStage('');
      setLastProjection(result.data);
      await Promise.all([
        projectionQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claims'] }),
        queryClient.invalidateQueries({ queryKey: ['operator', 'claims-operational-metrics'] }),
      ]);
    },
    onError: async (error) => {
      const next = error as ApiFailure;
      setFailure(next);
      if (next.problem?.status === 401) {
        signOut();
        return;
      }
      if (next.problem?.status === 409) {
        setTargetStage('');
        setLastProjection(null);
        await projectionQuery.refetch();
      }
    },
  });

  if (!session) return null;
  const projection = projectionQuery.data?.data ?? null;
  const canMove = hasPermission(session.operator.role, 'claims.pipeline.transition');
  const version = projection?.operationalWorkItemVersion ?? null;
  const currentStage = projection?.operationalStage ?? null;
  const suggestions = lastProjection?.allowedNextStageKeys ?? [];

  return (
    <section className="ops-panel r3-pipeline-panel" aria-labelledby="pipeline-panel-title">
      <div className="ops-panel-heading">
        <div>
          <span className="ops-kicker">Pipeline R3</span>
          <h2 id="pipeline-panel-title">Etapa operacional</h2>
          <p>Proyección independiente del estado del Claim. El pipeline fijado por el servidor valida cada movimiento.</p>
        </div>
        {version && <span className="r3-version-chip">v{version}</span>}
      </div>

      {queryFailure && queryFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={queryFailure} />}
      {failure && <OperatorApiErrorNotice failure={failure} />}

      {projectionQuery.isLoading ? (
        <div className="ops-compact-empty" role="status">Cargando pipeline operacional…</div>
      ) : !projection ? (
        <div className="ops-compact-empty">No se encontró una proyección operacional autoritativa para este Claim.</div>
      ) : (
        <>
          <div className="r3-pipeline-current">
            <span className="r3-pipeline-node" aria-hidden="true">◆</span>
            <div>
              <small>Etapa actual</small>
              <strong>{currentStage?.displayName ?? 'Sin etapa operacional'}</strong>
              <code>{currentStage?.stageKey ?? 'unassigned'}</code>
            </div>
            <div className="r3-pipeline-version">
              <small>Versión de trabajo</small>
              <strong>{version ?? '—'}</strong>
            </div>
          </div>

          {canMove && currentStage && version ? (
            <form
              className="r3-pipeline-move"
              onSubmit={(event) => {
                event.preventDefault();
                const normalized = targetStage.trim();
                if (!normalized) return;
                setFailure(null);
                moveMutation.mutate({ toStageKey: normalized, expectedVersion: version });
              }}
            >
              <label htmlFor="pipeline-target-stage">Mover a stage key</label>
              <div className="r3-pipeline-move-row">
                <input
                  id="pipeline-target-stage"
                  value={targetStage}
                  maxLength={80}
                  pattern="[A-Za-z0-9._-]+"
                  placeholder="ej. review.completed"
                  onChange={(event) => setTargetStage(event.target.value)}
                  required
                />
                <button className="ops-primary-action" type="submit" disabled={!targetStage.trim() || moveMutation.isPending}>
                  {moveMutation.isPending ? 'Moviendo…' : 'Mover etapa'}
                </button>
              </div>
              <small>
                No hardcodeamos etapas configurables. El servidor valida el grafo y `expectedVersion = {version}` protege contra decisiones sobre datos obsoletos.
              </small>
            </form>
          ) : (
            <div className="r3-pipeline-readonly">
              {currentStage ? 'Tu rol puede consultar la etapa, pero no moverla.' : 'No hay una versión operacional disponible para mover.'}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="r3-next-stage-suggestions">
              <span>Siguientes stage keys devueltas por el último movimiento</span>
              <div>
                {suggestions.map((stageKey) => (
                  <button type="button" key={stageKey} onClick={() => setTargetStage(stageKey)}>{stageKey}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
