import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAdminAutomations } from '../api/automation-admin';
import type { AutomationDefinitionProjection } from '../api/automation-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { isPublicDemoOperator } from '../demo-access';
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
  const items = result?.items ?? [];
  const demoReadOnly = isPublicDemoOperator(session.operator);
  const summary = useMemo(() => summarizePage(items), [items]);

  return (
    <OperatorShell>
      <main className="operator-main ops-main aa-admin-main automations-r3-directory">
        <div className="ops-page-heading aa-directory-heading automations-r3-heading">
          <div>
            <span className="ops-kicker">Configuración de plataforma</span>
            <h1>Automatizaciones</h1>
            <p>
              Reglas versionadas que reaccionan a eventos R3 mediante condiciones y acciones permitidas.
              La API conserva la autoridad sobre estado, versión activa y concurrencia.
            </p>
          </div>
          {!demoReadOnly && (
            <Link className="aa-primary-button" to="/operator/admin/automations/new">+ Nueva automatización</Link>
          )}
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="automations-r3-summary" aria-label="Resumen de automatizaciones">
          <SummaryCard label="Definiciones" value={result?.totalItems ?? '—'} detail="Total autoritativo del servidor" tone="blue" />
          <SummaryCard label="Habilitadas" value={summary.enabled} detail="En la página actual" tone="green" />
          <SummaryCard label="Con versión activa" value={summary.active} detail="En la página actual" tone="violet" />
          <SummaryCard label="Borradores" value={summary.drafts} detail="Versiones DRAFT visibles" tone="yellow" />
        </section>

        <section className="ops-panel automations-r3-panel" aria-labelledby="automations-directory-title">
          <div className="ops-panel-heading automations-r3-panel-heading">
            <div>
              <h2 id="automations-directory-title">Listado de automatizaciones</h2>
              <p>
                {demoReadOnly
                  ? 'Catálogo sintético gobernado para inspección. La demo pública no expone acciones de escritura.'
                  : 'El contrato R3 publica paginación del servidor; no se inventan filtros o búsquedas adicionales.'}
              </p>
            </div>
            <button
              className="ops-refresh-button"
              type="button"
              disabled={automationsQuery.isFetching}
              onClick={() => void automationsQuery.refetch()}
            >
              {automationsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {automationsQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando automatizaciones…</div>
          ) : items.length === 0 ? (
            <div className="automations-r3-empty">
              <strong>No hay automatizaciones en esta página.</strong>
              <span>
                {demoReadOnly
                  ? 'La demo solo publica las definiciones sintéticas incluidas en su catálogo gobernado.'
                  : 'Una nueva definición nace deshabilitada y con su primera versión en estado DRAFT.'}
              </span>
              {!demoReadOnly && <Link to="/operator/admin/automations/new">Crear primera automatización →</Link>}
            </div>
          ) : (
            <div className="automations-r3-table-wrap">
              <table className="automations-r3-table">
                <thead>
                  <tr>
                    <th>Automatización</th>
                    <th>Disparador</th>
                    <th>Estado</th>
                    <th>Versión activa</th>
                    <th>Versiones</th>
                    <th>Acciones</th>
                    <th>Actualizada</th>
                    <th aria-label="Abrir definición" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((automation) => {
                    const representative = representativeVersion(automation);
                    const active = automation.versions.find((version) => version.versionId === automation.activeVersionId);
                    return (
                      <tr key={automation.definitionId}>
                        <td className="automations-r3-name-cell">
                          <Link to={`/operator/admin/automations/${automation.definitionId}`}>{automation.displayName}</Link>
                          <code>{automation.key}</code>
                        </td>
                        <td>
                          <span className="aa-trigger">{representative?.content.when.eventType ?? '—'}</span>
                        </td>
                        <td>
                          <span className={`aa-enabled is-${automation.enabled ? 'enabled' : 'disabled'}`}>
                            {automation.enabled ? 'Habilitada' : 'Deshabilitada'}
                          </span>
                        </td>
                        <td className="automations-r3-number">{active ? `v${active.versionNumber}` : '—'}</td>
                        <td className="automations-r3-number">{automation.versions.length}</td>
                        <td className="automations-r3-number">{representative?.content.then.length ?? 0}</td>
                        <td className="automations-r3-date">{formatDate(automation.updatedAt)}</td>
                        <td className="automations-r3-open-cell">
                          <Link to={`/operator/admin/automations/${automation.definitionId}`}>
                            {demoReadOnly ? 'Ver →' : 'Administrar →'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <footer className="automations-r3-footer">
              <span>
                {result.totalItems === 0
                  ? '0 definiciones'
                  : `Página ${result.page} de ${Math.max(result.totalPages, 1)} · ${result.totalItems} definiciones`}
              </span>
              {result.totalPages > 1 && (
                <nav className="aa-pagination" aria-label="Paginación de automatizaciones">
                  <button
                    type="button"
                    disabled={page <= 1 || automationsQuery.isFetching}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    ← Anterior
                  </button>
                  <span>Página {result.page} / {result.totalPages}</span>
                  <button
                    type="button"
                    disabled={page >= result.totalPages || automationsQuery.isFetching}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Siguiente →
                  </button>
                </nav>
              )}
            </footer>
          )}
        </section>
      </main>
    </OperatorShell>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: 'blue' | 'green' | 'violet' | 'yellow';
}) {
  return (
    <article className={`automations-r3-summary-card is-${tone}`}>
      <span className="automations-r3-summary-mark" aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function summarizePage(items: AutomationDefinitionProjection[]) {
  return {
    enabled: items.filter((item) => item.enabled).length,
    active: items.filter((item) => item.activeVersionId).length,
    drafts: items.reduce(
      (total, item) => total + item.versions.filter((version) => version.status === 'DRAFT').length,
      0,
    ),
  };
}

function representativeVersion(automation: AutomationDefinitionProjection) {
  const active = automation.versions.find((version) => version.versionId === automation.activeVersionId);
  if (active) return active;
  return automation.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-UY', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
