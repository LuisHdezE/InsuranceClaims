import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listImportJobs, type ImportJobResponse } from '../api/governed-imports';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { isPublicDemoOperator } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const PAGE_SIZE = 25;

export function AdminImportsPage() {
  const { session, signOut } = useOperatorSession();
  const [page, setPage] = useState(1);
  const jobsQuery = useQuery({
    queryKey: ['admin', 'import-jobs', page],
    queryFn: () => listImportJobs(page, PAGE_SIZE, session!.accessToken),
    enabled: Boolean(session),
  });
  const failure = jobsQuery.error as ApiFailure | null;

  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;

  const result = jobsQuery.data?.data;
  const items = result?.items ?? [];
  const demoReadOnly = isPublicDemoOperator(session.operator);
  const summary = summarizePage(items);

  return (
    <OperatorShell>
      <main className="operator-main ops-main gi-main imports-r3-directory">
        <div className="ops-page-heading gi-heading imports-r3-heading">
          <div>
            <span className="ops-kicker">Centro de auditoría de datos</span>
            <h1>Importaciones</h1>
            <p>
              Historial gobernado de cargas externas con validación por filas, dry-run y resultados de commit.
              El backend conserva la autoridad sobre lifecycle, conteos y versión.
            </p>
          </div>
          {!demoReadOnly && <Link className="gi-primary" to="/operator/admin/imports/new">+ Nueva importación</Link>}
        </div>

        {demoReadOnly && (
          <section className="imports-r3-demo-banner" aria-label="Demo pública solo lectura">
            <div>
              <strong>DEMO PÚBLICA · SOLO LECTURA</strong>
              <span>Se muestran únicamente importaciones sintéticas gobernadas. Crear, subir, mapear, validar, ejecutar dry-run o confirmar commits permanece bloqueado.</span>
            </div>
            <span className="imports-r3-demo-role">Administration</span>
          </section>
        )}

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="imports-r3-summary" aria-label="Resumen de importaciones">
          <SummaryCard label="Importaciones" value={result?.totalItems ?? '—'} detail="Total autoritativo visible" tone="blue" />
          <SummaryCard label="Completadas" value={summary.completed} detail="En la página actual" tone="green" />
          <SummaryCard label="Con observaciones" value={summary.withErrors} detail="Completadas con errores" tone="red" />
          <SummaryCard label="En proceso" value={summary.inProgress} detail="Lifecycle no terminal" tone="yellow" />
        </section>

        <section className="ops-panel imports-r3-panel" aria-labelledby="imports-directory-title">
          <div className="ops-panel-heading imports-r3-panel-heading">
            <div>
              <h2 id="imports-directory-title">Historial de importaciones</h2>
              <p>
                {demoReadOnly
                  ? 'Catálogo sintético gobernado para inspección. Los resultados se derivan exclusivamente del contrato real de ImportJob.'
                  : 'Listado autoritativo del API. No se agregan filtros, búsquedas ni métricas que el contrato no soporte.'}
              </p>
            </div>
            <button
              className="ops-refresh-button"
              type="button"
              disabled={jobsQuery.isFetching}
              onClick={() => void jobsQuery.refetch()}
            >
              {jobsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {jobsQuery.isLoading ? (
            <div className="ops-compact-empty" role="status">Cargando importaciones…</div>
          ) : items.length === 0 ? (
            <div className="ops-compact-empty">No hay importaciones disponibles en esta página.</div>
          ) : (
            <div className="imports-r3-table-wrap">
              <table className="imports-r3-table">
                <thead>
                  <tr>
                    <th>Importación</th>
                    <th>Estado</th>
                    <th>Filas</th>
                    <th>Válidas</th>
                    <th>Inválidas</th>
                    <th>Commit</th>
                    <th>Versión</th>
                    <th>Actualizada</th>
                    <th aria-label="Abrir importación" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((job) => (
                    <tr key={job.importJobId}>
                      <td className="imports-r3-type-cell">
                        <Link to={`/operator/admin/imports/${job.importJobId}`}>{importTypeLabel(job.importType)}</Link>
                        <code>{shortId(job.importJobId)}</code>
                      </td>
                      <td><span className={`gi-status is-${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span></td>
                      <td className="imports-r3-number">{job.counts.total}</td>
                      <td className="imports-r3-number">{job.counts.valid}</td>
                      <td className="imports-r3-number">{job.counts.invalid}</td>
                      <td className="imports-r3-number">{job.counts.committed}</td>
                      <td className="imports-r3-number">v{job.version}</td>
                      <td className="imports-r3-date">{formatTimestamp(job.updatedAt)}</td>
                      <td className="imports-r3-open-cell"><Link to={`/operator/admin/imports/${job.importJobId}`}>Ver importación →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <footer className="imports-r3-footer">
              <span>
                {result.totalItems === 0
                  ? '0 importaciones'
                  : `Página ${result.page} de ${Math.max(result.totalPages, 1)} · ${result.totalItems} importaciones`}
              </span>
              {result.totalPages > 1 && (
                <nav className="gi-pagination" aria-label="Paginación de importaciones">
                  <button type="button" disabled={page <= 1 || jobsQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Anterior</button>
                  <span>Página {result.page} / {result.totalPages}</span>
                  <button type="button" disabled={page >= result.totalPages || jobsQuery.isFetching} onClick={() => setPage((value) => value + 1)}>Siguiente →</button>
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
  tone: 'blue' | 'green' | 'red' | 'yellow';
}) {
  return (
    <article className={`imports-r3-summary-card is-${tone}`}>
      <span className="imports-r3-summary-mark" aria-hidden="true" />
      <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

function summarizePage(items: ImportJobResponse[]) {
  const terminal = new Set(['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED']);
  return {
    completed: items.filter((job) => job.status === 'COMPLETED').length,
    withErrors: items.filter((job) => job.status === 'COMPLETED_WITH_ERRORS').length,
    inProgress: items.filter((job) => !terminal.has(job.status)).length,
  };
}

function importTypeLabel(importType: ImportJobResponse['importType']) {
  return importType === 'SYNTHETIC_REFERENCE_RECORDS' ? 'Registros de referencia sintéticos' : importType;
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusLabel(status: string) {
  return ({
    UPLOADED: 'Subida', PREVIEWED: 'Preview', MAPPED: 'Mapeada', VALIDATED: 'Validada', DRY_RUN_READY: 'Dry-run listo',
    COMMITTING: 'Commit en curso', COMPLETED: 'Completada', COMPLETED_WITH_ERRORS: 'Completada con errores', FAILED: 'Fallida', CANCELLED: 'Cancelada',
  } as Record<string, string>)[status] ?? status;
}
