import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listImportJobs } from '../api/governed-imports';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
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

  return (
    <OperatorShell>
      <main className="operator-main ops-main gi-main">
        <div className="ops-page-heading gi-heading">
          <div>
            <span className="ops-kicker">Governed Imports R3</span>
            <h1>Importaciones gobernadas</h1>
            <p>Importa registros sintéticos mediante un workflow auditable, con preview, mapping explícito, validación, dry-run y commit controlado.</p>
          </div>
          <Link className="gi-primary" to="/operator/admin/imports/new">+ Nueva importación</Link>
        </div>

        <section className="gi-contract-strip" aria-label="Límites de Governed Imports">
          <div><strong>Fixture</strong><span>SYNTHETIC_REFERENCE_RECORDS</span></div>
          <div><strong>Formatos</strong><span>CSV o XLSX · máximo 10 MiB</span></div>
          <div><strong>Límite</strong><span>5.000 filas por archivo</span></div>
        </section>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {jobsQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando importaciones…</div>}

        {result && (
          <>
            <section className="ops-panel gi-panel" aria-labelledby="gi-directory-title">
              <div className="ops-panel-heading">
                <div><h2 id="gi-directory-title">Jobs de importación</h2><p>{result.totalItems} jobs · página {result.page} de {Math.max(result.totalPages, 1)}</p></div>
                <button className="ops-refresh-button" type="button" disabled={jobsQuery.isFetching} onClick={() => void jobsQuery.refetch()}>{jobsQuery.isFetching ? 'Actualizando…' : 'Actualizar'}</button>
              </div>

              {result.items.length === 0 ? (
                <div className="ops-compact-empty">No hay importaciones registradas.</div>
              ) : (
                <div className="gi-job-grid">
                  {result.items.map((job) => (
                    <Link className="gi-job-card" to={`/operator/admin/imports/${job.importJobId}`} key={job.importJobId}>
                      <div className="gi-card-top"><span className={`gi-status is-${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span><span>v{job.version}</span></div>
                      <h3>{job.importType}</h3>
                      <code>{job.importJobId}</code>
                      <div className="gi-count-grid">
                        <span><small>Total</small><strong>{job.counts.total}</strong></span>
                        <span><small>Válidas</small><strong>{job.counts.valid}</strong></span>
                        <span><small>Inválidas</small><strong>{job.counts.invalid}</strong></span>
                        <span><small>Commit</small><strong>{job.counts.committed}</strong></span>
                      </div>
                      <span className="gi-card-link">Abrir workflow →</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <nav className="gi-pagination" aria-label="Paginación de importaciones">
              <button type="button" disabled={page <= 1 || jobsQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Anterior</button>
              <span>Página {result.page} / {Math.max(result.totalPages, 1)}</span>
              <button type="button" disabled={page >= result.totalPages || jobsQuery.isFetching} onClick={() => setPage((value) => value + 1)}>Siguiente →</button>
            </nav>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function statusLabel(status: string) {
  return ({
    UPLOADED: 'Subida', PREVIEWED: 'Preview', MAPPED: 'Mapeada', VALIDATED: 'Validada', DRY_RUN_READY: 'Dry-run listo',
    COMMITTING: 'Commit en curso', COMPLETED: 'Completada', COMPLETED_WITH_ERRORS: 'Completada con errores', FAILED: 'Fallida', CANCELLED: 'Cancelada',
  } as Record<string, string>)[status] ?? status;
}
