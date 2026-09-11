import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAdminGuidance } from '../api/guidance-admin';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const PAGE_SIZE = 25;

export function AdminGuidancePage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const guidanceQuery = useQuery({
    queryKey: ['admin', 'guidance', page],
    queryFn: () => listAdminGuidance({ page, pageSize: PAGE_SIZE }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = guidanceQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = guidanceQuery.data?.data;

  return (
    <OperatorShell>
      <main className="operator-main ops-main guidance-admin-main">
        <div className="ops-page-heading guidance-directory-heading">
          <div>
            <span className="ops-kicker">Platform Guidance R3</span>
            <h1>Guidance</h1>
            <p>Definiciones versionadas de orientación configurada. Contexto, categorías y metadata permanecen opacos: la UI no inventa semántica fuera del contrato R3.</p>
          </div>
          <Link className="guidance-primary-button" to="/operator/admin/guidance/new">+ Nueva Guidance</Link>
        </div>

        <section className="guidance-contract-strip" aria-label="Frontera de Guidance">
          <div><strong>Contenido</strong><span>Contexto · categoría · documentos · instrucciones</span></div>
          <div><strong>Versionado</strong><span>DRAFT → ACTIVE → RETIRED</span></div>
          <div><strong>Listado</strong><span>Solo paginación del servidor</span></div>
        </section>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {guidanceQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando Guidance…</div>}

        {result && (
          <>
            <section className="ops-panel guidance-directory-panel" aria-labelledby="guidance-directory-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="guidance-directory-title">Definiciones</h2>
                  <p>{result.totalItems} definiciones · página {result.page} de {result.totalPages}</p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={guidanceQuery.isFetching} onClick={() => void guidanceQuery.refetch()}>
                  {guidanceQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              {result.items.length === 0 ? (
                <div className="ops-compact-empty">No hay Guidance configurada.</div>
              ) : (
                <div className="guidance-card-grid">
                  {result.items.map((definition) => {
                    const latest = definition.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
                    const active = definition.versions.find((version) => version.versionId === definition.activeVersionId);
                    return (
                      <Link className="guidance-definition-card" to={`/operator/admin/guidance/${definition.definitionId}`} key={definition.definitionId}>
                        <div className="guidance-card-heading">
                          <span className={`guidance-enabled is-${definition.enabled ? 'enabled' : 'disabled'}`}>{definition.enabled ? 'Habilitada' : 'Deshabilitada'}</span>
                          <span className="guidance-status">{active ? `ACTIVE v${active.versionNumber}` : 'Sin versión activa'}</span>
                        </div>
                        <h3>{definition.key}</h3>
                        <div className="guidance-card-facts">
                          <span><small>Definition version</small><strong>v{definition.version}</strong></span>
                          <span><small>Versiones</small><strong>{definition.versions.length}</strong></span>
                          <span><small>Última categoría</small><strong>{latest?.guidanceCategory ?? '—'}</strong></span>
                          <span><small>Contexto</small><strong>{latest?.insurerContextReference ?? '—'}</strong></span>
                        </div>
                        <span className="guidance-card-link">Administrar →</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <nav className="guidance-pagination" aria-label="Paginación de Guidance">
              <button type="button" disabled={page <= 1 || guidanceQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
              <span>Página {result.page} / {result.totalPages}</span>
              <button type="button" disabled={page >= result.totalPages || guidanceQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente →</button>
            </nav>
          </>
        )}

        <section className="guidance-admin-contract-note">
          <strong>Sin filtros inventados</strong>
          <p>R3 publica paginación para este directorio, no búsqueda por key, categoría, contexto o estado. La UI no simula filtros locales incompletos.</p>
        </section>
      </main>
    </OperatorShell>
  );
}
