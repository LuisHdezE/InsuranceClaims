import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAdminAutomations } from '../api/automation-admin';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const PAGE_SIZE = 25;

export function AdminAutomationsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const automationsQuery = useQuery({
    queryKey: ['admin', 'automations', page],
    queryFn: () => listAdminAutomations({ page, pageSize: PAGE_SIZE }, session!.accessToken),
    enabled: Boolean(session),
  });
  const failure = automationsQuery.error as ApiFailure | null;

  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = automationsQuery.data?.data;

  return (
    <OperatorShell>
      <main className="operator-main ops-main aa-admin-main">
        <div className="ops-page-heading aa-directory-heading">
          <div>
            <span className="ops-kicker">Platform Automation R3</span>
            <h1>Automations</h1>
            <p>Reglas versionadas sobre triggers y acciones aprobadas. La API mantiene la autoridad sobre activación, concurrencia y seguridad del contenido.</p>
          </div>
          <Link className="aa-primary-button" to="/operator/admin/automations/new">+ Nueva Automation</Link>
        </div>

        <section className="aa-contract-strip" aria-label="Frontera de Automations">
          <div><strong>Triggers</strong><span>6 eventos R3 aprobados</span></div>
          <div><strong>Actions</strong><span>8 tipos permitidos</span></div>
          <div><strong>Listado</strong><span>Solo paginación del servidor</span></div>
        </section>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {automationsQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando Automations…</div>}

        {result && (
          <>
            <section className="ops-panel aa-directory-panel" aria-labelledby="aa-directory-title">
              <div className="ops-panel-heading">
                <div><h2 id="aa-directory-title">Definiciones</h2><p>{result.totalItems} definiciones · página {result.page} de {result.totalPages}</p></div>
                <button className="ops-refresh-button" type="button" disabled={automationsQuery.isFetching} onClick={() => void automationsQuery.refetch()}>{automationsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}</button>
              </div>

              {result.items.length === 0 ? (
                <div className="ops-compact-empty">No hay Automations configuradas.</div>
              ) : (
                <div className="aa-card-grid">
                  {result.items.map((automation) => {
                    const latest = automation.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
                    const active = automation.versions.find((version) => version.versionId === automation.activeVersionId);
                    return (
                      <Link className="aa-definition-card" to={`/operator/admin/automations/${automation.definitionId}`} key={automation.definitionId}>
                        <div className="aa-card-heading"><span className={`aa-enabled is-${automation.enabled ? 'enabled' : 'disabled'}`}>{automation.enabled ? 'Habilitada' : 'Deshabilitada'}</span><span className="aa-trigger">{active?.content.when.eventType ?? latest?.content.when.eventType ?? '—'}</span></div>
                        <h3>{automation.displayName}</h3>
                        <code>{automation.key}</code>
                        <div className="aa-card-facts">
                          <span><small>Definition version</small><strong>v{automation.version}</strong></span>
                          <span><small>Versiones</small><strong>{automation.versions.length}</strong></span>
                          <span><small>Activa</small><strong>{active ? `v${active.versionNumber}` : '—'}</strong></span>
                          <span><small>Acciones</small><strong>{(active ?? latest)?.content.then.length ?? 0}</strong></span>
                        </div>
                        <span className="aa-card-link">Administrar →</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <nav className="aa-pagination" aria-label="Paginación de Automations">
              <button type="button" disabled={page <= 1 || automationsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
              <span>Página {result.page} / {result.totalPages}</span>
              <button type="button" disabled={page >= result.totalPages || automationsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente →</button>
            </nav>
          </>
        )}

        <section className="aa-admin-contract-note"><strong>Sin filtros ni semántica inventada</strong><p>R3 publica paginación, no filtros por trigger, action type, key o estado. Los parámetros de acciones permanecen opacos salvo los límites de seguridad explícitos del contrato.</p></section>
      </main>
    </OperatorShell>
  );
}
