import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAdminCustomFields } from '../api/custom-field-admin';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const PAGE_SIZE = 25;

export function AdminCustomFieldsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const fieldsQuery = useQuery({
    queryKey: ['admin', 'custom-fields', page],
    queryFn: () => listAdminCustomFields({ page, pageSize: PAGE_SIZE }, session!.accessToken),
    enabled: Boolean(session),
  });

  const failure = fieldsQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const result = fieldsQuery.data?.data;

  return (
    <OperatorShell>
      <main className="operator-main ops-main cf-admin-main custom-fields-r3-directory">
        <div className="ops-page-heading cf-directory-heading">
          <div>
            <span className="ops-kicker">Configuración de plataforma</span>
            <h1>Campos personalizados</h1>
            <p>Extensiones operacionales versionadas para CLAIM, RENEWAL y COLLECTION, gobernadas sin reemplazar identidad, estado, seguridad ni campos reservados del dominio.</p>
          </div>
          <Link className="cf-primary-button" to="/operator/admin/custom-fields/new">+ Nuevo campo</Link>
        </div>

        <section className="cf-contract-strip" aria-label="Frontera de campos personalizados">
          <div><strong>Ámbitos</strong><span>CLAIM · RENEWAL · COLLECTION</span></div>
          <div><strong>Versionado</strong><span>DRAFT → ACTIVE → RETIRED</span></div>
          <div><strong>Directorio</strong><span>25 por página · sin filtros locales</span></div>
        </section>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {fieldsQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando campos personalizados…</div>}

        {result && (
          <>
            <section className="ops-panel cf-directory-panel" aria-labelledby="cf-directory-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="cf-directory-title">Definiciones</h2>
                  <p>{result.totalItems} definiciones · página {result.page} de {result.totalPages}</p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={fieldsQuery.isFetching} onClick={() => void fieldsQuery.refetch()}>
                  {fieldsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              {result.items.length === 0 ? (
                <div className="ops-compact-empty">No hay campos personalizados configurados.</div>
              ) : (
                <div className="cf-card-grid">
                  {result.items.map((field) => {
                    const latest = field.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
                    const active = field.versions.find((version) => version.versionId === field.activeVersionId);
                    return (
                      <Link className="cf-definition-card" to={`/operator/admin/custom-fields/${field.definitionId}`} key={field.definitionId}>
                        <div className="cf-card-heading">
                          <span className={`cf-target is-${field.targetType.toLowerCase()}`}>{field.targetType}</span>
                          <span className={`cf-enabled is-${field.enabled ? 'enabled' : 'disabled'}`}>{field.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
                        </div>
                        <h3>{field.fieldKey}</h3>
                        <div className="cf-card-facts">
                          <span><small>Versión definición</small><strong>v{field.version}</strong></span>
                          <span><small>Versiones</small><strong>{field.versions.length}</strong></span>
                          <span><small>Versión activa</small><strong>{active ? `v${active.versionNumber}` : '—'}</strong></span>
                          <span><small>Último tipo</small><strong>{latest?.valueType ?? '—'}</strong></span>
                        </div>
                        <span className="cf-card-link">Administrar →</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <nav className="cf-pagination" aria-label="Paginación de campos personalizados">
              <button type="button" disabled={page <= 1 || fieldsQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
              <span>Página {result.page} / {result.totalPages}</span>
              <button type="button" disabled={page >= result.totalPages || fieldsQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Siguiente →</button>
            </nav>
          </>
        )}

        <section className="cf-admin-contract-note">
          <strong>Frontera R3</strong>
          <p>El directorio publicado solo admite paginación. La UI no inventa búsqueda por clave, ámbito, estado o tipo, ni replica la lista interna de claves protegidas.</p>
        </section>
      </main>
    </OperatorShell>
  );
}
