import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAdminCommunicationTemplates } from '../api/communication-template-admin';
import type { CommunicationTemplateDefinitionProjection } from '../api/communication-template-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../r3-admin-config.css';

const PAGE_SIZE = 25;

export function AdminCommunicationTemplatesPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const templatesQuery = useQuery({
    queryKey: ['admin', 'communication-templates', page],
    queryFn: () => listAdminCommunicationTemplates({ page, pageSize: PAGE_SIZE }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = templatesQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = templatesQuery.data?.data;

  return (
    <OperatorShell>
      <main className="operator-main ops-main comm-admin-main">
        <div className="ops-page-heading comm-admin-page-heading">
          <div>
            <span className="ops-kicker">Communication Templates R3</span>
            <h1>Plantillas de comunicación</h1>
            <p>Definiciones gobernadas por versiones inmutables para EMAIL y WHATSAPP. El listado usa solo paginación publicada por R3.</p>
          </div>
          <Link className="comm-primary-button" to="/operator/admin/communication-templates/new">+ Nueva plantilla</Link>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="ops-panel comm-directory-panel" aria-labelledby="comm-directory-title">
          <div className="ops-panel-heading">
            <div>
              <h2 id="comm-directory-title">Directorio administrado</h2>
              <p>{result ? `${result.totalItems} definiciones publicadas por el API` : 'Cargando definiciones…'}</p>
            </div>
            <button className="ops-refresh-button" type="button" disabled={templatesQuery.isFetching} onClick={() => void templatesQuery.refetch()}>
              {templatesQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {templatesQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando plantillas…</div>
          ) : result && result.items.length > 0 ? (
            <div className="comm-template-grid">
              {result.items.map((template) => <TemplateCard key={template.definitionId} template={template} />)}
            </div>
          ) : (
            <div className="ops-compact-empty">No hay definiciones de plantilla en esta página.</div>
          )}

          {result && (
            <div className="comm-pagination" aria-label="Paginación de plantillas">
              <button type="button" disabled={page <= 1 || templatesQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
              <span>Página {result.page} de {result.totalPages}</span>
              <button type="button" disabled={page >= result.totalPages || templatesQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente →</button>
            </div>
          )}
        </section>

        <section className="comm-admin-contract-note">
          <strong>Frontera R3</strong>
          <p>Este directorio administra plantillas. No se expone al rol operador como catálogo de envío, porque `communications.admin` y `communications.send` son permisos distintos.</p>
        </section>
      </main>
    </OperatorShell>
  );
}

function TemplateCard({ template }: { template: CommunicationTemplateDefinitionProjection }) {
  const active = template.versions.find((version) => version.versionId === template.activeVersionId) ?? null;
  const latest = template.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ?? null;
  return (
    <article className="comm-template-card">
      <div className="comm-template-card-top">
        <span className={`comm-channel is-${template.channel.toLowerCase()}`}>{template.channel}</span>
        <span className={`comm-enabled is-${template.enabled ? 'enabled' : 'disabled'}`}>{template.enabled ? 'Habilitada' : 'Deshabilitada'}</span>
      </div>
      <h3>{template.key}</h3>
      <code>{template.definitionId}</code>
      <div className="comm-template-facts">
        <span><small>Definition version</small><strong>v{template.version}</strong></span>
        <span><small>Versiones</small><strong>{template.versions.length}</strong></span>
        <span><small>Activa</small><strong>{active ? `v${active.versionNumber}` : '—'}</strong></span>
        <span><small>Última</small><strong>{latest ? `${latest.status} v${latest.versionNumber}` : '—'}</strong></span>
      </div>
      <Link className="comm-card-link" to={`/operator/admin/communication-templates/${template.definitionId}`}>Administrar definición →</Link>
    </article>
  );
}
