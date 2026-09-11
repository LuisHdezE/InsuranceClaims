import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAdminPipelines } from '../api/pipeline-admin';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminPipelinesPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['admin', 'pipelines', page],
    queryFn: () => listAdminPipelines({ page, pageSize: 25 }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = query.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = query.data?.data;
  const items = result?.items ?? [];

  return (
    <OperatorShell>
      <main className="operator-main ops-main pipeline-admin-main">
        <div className="ops-page-heading pipeline-admin-page-heading">
          <div>
            <span className="ops-kicker">Platform Configuration</span>
            <h1>Administración de pipelines</h1>
            <p>Definiciones y versiones R3 para CLAIM, RENEWAL y COLLECTION. Las versiones son inmutables y la API conserva la autoridad de activación y concurrencia.</p>
          </div>
          <Link className="pipeline-primary-button" to="/operator/admin/pipelines/new">+ Nuevo pipeline</Link>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="pipeline-admin-summary" aria-label="Resumen de definiciones">
          <div><span>Definiciones</span><strong>{result?.totalItems ?? '—'}</strong></div>
          <div><span>Habilitadas en esta página</span><strong>{items.filter((item) => item.enabled).length}</strong></div>
          <div><span>Con versión activa</span><strong>{items.filter((item) => item.activeVersionId).length}</strong></div>
        </section>

        <section className="ops-panel pipeline-admin-list-panel" aria-labelledby="pipeline-list-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="pipeline-list-title">Definiciones configuradas</h2>
              <p>La lista usa únicamente paginación porque R3 no publica filtros administrativos adicionales.</p>
            </div>
            <button className="ops-refresh-button" type="button" disabled={query.isFetching} onClick={() => void query.refetch()}>
              {query.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {query.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando pipelines…</div>
          ) : items.length === 0 ? (
            <div className="pipeline-empty-state">
              <strong>No hay definiciones en esta página.</strong>
              <span>Una nueva definición nace deshabilitada con su primera versión DRAFT.</span>
              <Link to="/operator/admin/pipelines/new">Crear primera definición →</Link>
            </div>
          ) : (
            <div className="pipeline-admin-grid">
              {items.map((pipeline) => {
                const active = pipeline.versions.find((version) => version.versionId === pipeline.activeVersionId);
                const draftCount = pipeline.versions.filter((version) => version.status === 'DRAFT').length;
                return (
                  <Link className="pipeline-definition-card" to={`/operator/admin/pipelines/${pipeline.definitionId}`} key={pipeline.definitionId}>
                    <div className="pipeline-definition-card-top">
                      <span className={`pipeline-consumer is-${pipeline.consumerType.toLowerCase()}`}>{pipeline.consumerType}</span>
                      <span className={`pipeline-enabled is-${pipeline.enabled ? 'enabled' : 'disabled'}`}>
                        {pipeline.enabled ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </div>
                    <h3>{pipeline.displayName}</h3>
                    <code>{pipeline.key}</code>
                    <div className="pipeline-definition-meta">
                      <div><span>Definition version</span><strong>v{pipeline.version}</strong></div>
                      <div><span>Versiones</span><strong>{pipeline.versions.length}</strong></div>
                      <div><span>Drafts</span><strong>{draftCount}</strong></div>
                    </div>
                    <div className="pipeline-definition-active">
                      <span>Versión activa</span>
                      <strong>{active ? `v${active.versionNumber}` : 'Sin versión activa'}</strong>
                      {active && <small>{active.stages.length} etapa(s) · {active.sourceClassification}</small>}
                    </div>
                    <span className="pipeline-card-link">Administrar →</span>
                  </Link>
                );
              })}
            </div>
          )}

          {result && result.totalPages > 1 && (
            <div className="pipeline-pagination" aria-label="Paginación de pipelines">
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Anterior</button>
              <span>Página <strong>{result.page}</strong> de {result.totalPages}</span>
              <button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => Math.min(result.totalPages, value + 1))}>Siguiente →</button>
            </div>
          )}
        </section>
      </main>
    </OperatorShell>
  );
}
