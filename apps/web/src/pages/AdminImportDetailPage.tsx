import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  commitImportJob,
  dryRunImportJob,
  getImportJob,
  listImportRows,
  newImportIdempotencyKey,
  previewImportJob,
  updateImportMapping,
  validateImportJob,
  type ImportJobResponse,
} from '../api/governed-imports';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { isPublicDemoOperator } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const ROW_PAGE_SIZE = 50;

export function AdminImportDetailPage() {
  const { importJobId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();
  const [staleNotice, setStaleNotice] = useState(false);
  const [externalReference, setExternalReference] = useState('');
  const [label, setLabel] = useState('');
  const [classification, setClassification] = useState('');
  const commitKey = useRef(newImportIdempotencyKey('commit'));

  const jobQuery = useQuery({
    queryKey: ['admin', 'import-job', importJobId],
    queryFn: () => getImportJob(importJobId, session!.accessToken),
    enabled: Boolean(session && importJobId),
    refetchInterval: (query) => query.state.data?.data.status === 'COMMITTING' ? 2500 : false,
  });
  const job = jobQuery.data?.data;
  const rowsQuery = useQuery({
    queryKey: ['admin', 'import-job-rows', importJobId, job?.version],
    queryFn: () => listImportRows(importJobId, 1, ROW_PAGE_SIZE, session!.accessToken),
    enabled: Boolean(session && job && ['VALIDATED', 'DRY_RUN_READY', 'COMMITTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'].includes(job.status)),
  });

  useEffect(() => {
    if (!job) return;
    setExternalReference(job.mapping?.externalReference ?? '');
    setLabel(job.mapping?.label ?? '');
    setClassification(job.mapping?.classification ?? '');
  }, [job?.importJobId, job?.version]);

  const refreshAuthoritative = async (error: unknown) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) return signOut();
    if (failure.problem?.status === 409) {
      setStaleNotice(true);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'import-job', importJobId] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'import-job-rows', importJobId] });
    }
  };
  const afterMutation = async () => {
    setStaleNotice(false);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'import-job', importJobId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'import-job-rows', importJobId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'import-jobs'] });
  };

  const previewMutation = useMutation({ mutationFn: () => previewImportJob(importJobId, job!.version, session!.accessToken), onSuccess: afterMutation, onError: refreshAuthoritative });
  const mappingMutation = useMutation({ mutationFn: (mapping: Record<string, string>) => updateImportMapping(importJobId, job!.version, mapping, session!.accessToken), onSuccess: afterMutation, onError: refreshAuthoritative });
  const validateMutation = useMutation({ mutationFn: () => validateImportJob(importJobId, job!.version, session!.accessToken), onSuccess: afterMutation, onError: refreshAuthoritative });
  const dryRunMutation = useMutation({ mutationFn: () => dryRunImportJob(importJobId, job!.version, session!.accessToken), onSuccess: afterMutation, onError: refreshAuthoritative });
  const commitMutation = useMutation({ mutationFn: () => commitImportJob(importJobId, job!.version, commitKey.current, session!.accessToken), onSuccess: afterMutation, onError: refreshAuthoritative });

  const failure = (jobQuery.error || previewMutation.error || mappingMutation.error || validateMutation.error || dryRunMutation.error || commitMutation.error || rowsQuery.error) as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const demoReadOnly = isPublicDemoOperator(session.operator);

  const submitMapping = (event: FormEvent) => {
    event.preventDefault();
    const mapping: Record<string, string> = { externalReference, label };
    if (classification) mapping.classification = classification;
    mappingMutation.mutate(mapping);
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main gi-main gi-detail-main imports-r3-detail">
        <div className="gi-breadcrumbs"><Link to="/operator/admin/imports">Importaciones</Link><span>/</span><span>Detalle</span></div>

        {failure && failure.problem?.status !== 401 && failure.problem?.status !== 409 && <OperatorApiErrorNotice failure={failure} />}
        {staleNotice && !demoReadOnly && <div className="gi-stale" role="status"><strong>Estado actualizado</strong><span>Otro actor modificó este job. Recargamos la versión autoritativa y no repetimos la mutación obsoleta.</span></div>}
        {jobQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando importación…</div>}

        {job && (
          <>
            <section className="imports-r3-detail-hero">
              <div>
                <span className="ops-kicker">Importación gobernada R3</span>
                <h1>{importTypeLabel(job.importType)}</h1>
                <p>Inspección del lifecycle autoritativo, mapping aplicado y resultados persistidos por fila.</p>
                <code>{job.importJobId}</code>
              </div>
              <div className="imports-r3-detail-actions">
                <span className={`gi-status is-${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span>
                {demoReadOnly && <span className="imports-r3-readonly-badge">Solo lectura</span>}
                <button className="ops-refresh-button" type="button" disabled={jobQuery.isFetching} onClick={() => void jobQuery.refetch()}>
                  {jobQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>
            </section>

            {demoReadOnly && (
              <section className="imports-r3-demo-banner" aria-label="Protección de demo pública">
                <div><strong>DEMO PÚBLICA · SOLO LECTURA</strong><span>Este job es un fixture sintético gobernado. Las rutas de escritura están ocultas en la interfaz y bloqueadas por la API.</span></div>
                <span className="imports-r3-demo-role">Administration</span>
              </section>
            )}

            <JobSummary job={job} />
            <Lifecycle job={job} />
            <MappingReadOnly job={job} />

            {!demoReadOnly && (
              <section className="ops-panel gi-action-panel">
                <div className="ops-panel-heading"><div><h2>Siguiente acción gobernada</h2><p>Versión esperada: v{job.version}</p></div></div>
                {job.status === 'UPLOADED' && <ActionButton label="Generar preview" pending={previewMutation.isPending} onClick={() => previewMutation.mutate()} />}
                {job.status === 'PREVIEWED' && (
                  <MappingForm job={job} externalReference={externalReference} label={label} classification={classification} setExternalReference={setExternalReference} setLabel={setLabel} setClassification={setClassification} pending={mappingMutation.isPending} onSubmit={submitMapping} />
                )}
                {job.status === 'MAPPED' && <ActionButton label="Validar filas" pending={validateMutation.isPending} onClick={() => validateMutation.mutate()} />}
                {job.status === 'VALIDATED' && <ActionButton label="Ejecutar dry-run" pending={dryRunMutation.isPending} onClick={() => dryRunMutation.mutate()} />}
                {job.status === 'DRY_RUN_READY' && (
                  <div className="gi-commit-box">
                    <p><strong>Commit autoritativo.</strong> Esta acción solicita al worker aplicar las filas elegibles. El dry-run ya calculó el efecto esperado.</p>
                    <button className="gi-danger" type="button" disabled={commitMutation.isPending} onClick={() => { if (window.confirm('¿Confirmas el commit de esta importación?')) commitMutation.mutate(); }}>{commitMutation.isPending ? 'Solicitando commit…' : 'Confirmar commit'}</button>
                  </div>
                )}
                {job.status === 'COMMITTING' && <div className="ops-compact-empty">Commit en procesamiento. Esta vista consulta el estado autoritativo periódicamente.</div>}
                {['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'].includes(job.status) && <div className="ops-compact-empty">Job terminal: <strong>{statusLabel(job.status)}</strong>. No hay más mutaciones permitidas desde esta vista.</div>}
              </section>
            )}

            {rowsQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando resultados por fila…</div>}
            {rowsQuery.data?.data && <RowsTable rows={rowsQuery.data.data.items} total={rowsQuery.data.data.totalItems} />}
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function JobSummary({ job }: { job: ImportJobResponse }) {
  return (
    <section className="ops-panel gi-summary imports-r3-detail-summary">
      <div className="ops-panel-heading"><div><h2>Resumen autoritativo</h2><p>Creada {formatTimestamp(job.createdAt)} · actualizada {formatTimestamp(job.updatedAt)}</p></div></div>
      <div className="gi-summary-grid imports-r3-detail-grid">
        <span><small>Estado</small><strong>{statusLabel(job.status)}</strong></span>
        <span><small>Versión</small><strong>v{job.version}</strong></span>
        <span><small>Filas</small><strong>{job.counts.total}</strong></span>
        <span><small>Válidas / inválidas</small><strong>{job.counts.valid} / {job.counts.invalid}</strong></span>
        <span><small>Confirmadas</small><strong>{job.counts.committed}</strong></span>
        <span><small>Rechazadas / fallidas</small><strong>{job.counts.rejected} / {job.counts.failed}</strong></span>
        <span><small>Formato</small><strong>{job.source.mediaType}</strong></span>
        <span><small>Tamaño</small><strong>{formatBytes(job.source.sizeBytes)}</strong></span>
      </div>
    </section>
  );
}

function Lifecycle({ job }: { job: ImportJobResponse }) {
  const steps = ['UPLOADED', 'PREVIEWED', 'MAPPED', 'VALIDATED', 'DRY_RUN_READY', 'COMMITTING'];
  const terminal = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'].includes(job.status);
  const current = terminal ? steps.length : steps.indexOf(job.status);
  return (
    <section className="ops-panel imports-r3-lifecycle-panel" aria-labelledby="imports-lifecycle-title">
      <div className="ops-panel-heading"><div><h2 id="imports-lifecycle-title">Lifecycle</h2><p>Cada etapa refleja únicamente el estado persistido por el dominio.</p></div>{terminal && <span className={`gi-status is-${job.status.toLowerCase()}`}>{statusLabel(job.status)}</span>}</div>
      <div className="gi-lifecycle" aria-label="Ciclo de vida de importación">
        {steps.map((step, index) => <span className={index < current ? 'is-done' : index === current ? 'is-current' : ''} key={step}>{statusLabel(step)}</span>)}
      </div>
      <div className="imports-r3-lifecycle-meta">
        <span><small>Inicio</small><strong>{formatTimestamp(job.startedAt)}</strong></span>
        <span><small>Finalización</small><strong>{formatTimestamp(job.completedAt)}</strong></span>
      </div>
    </section>
  );
}

function MappingReadOnly({ job }: { job: ImportJobResponse }) {
  const entries = Object.entries(job.mapping ?? {});
  return (
    <section className="ops-panel imports-r3-mapping" aria-labelledby="imports-mapping-title">
      <div className="ops-panel-heading"><div><h2 id="imports-mapping-title">Mapping aplicado</h2><p>Proyección targetField → sourceHeader almacenada en el job.</p></div></div>
      {entries.length === 0 ? (
        <div className="ops-compact-empty">Este estado todavía no tiene un mapping persistido.</div>
      ) : (
        <div className="imports-r3-mapping-grid">{entries.map(([target, source]) => <span key={target}><small>{target}</small><strong>{source}</strong></span>)}</div>
      )}
    </section>
  );
}

function MappingForm(props: { job: ImportJobResponse; externalReference: string; label: string; classification: string; setExternalReference: (v: string) => void; setLabel: (v: string) => void; setClassification: (v: string) => void; pending: boolean; onSubmit: (event: FormEvent) => void }) {
  const headers = props.job.sourceHeaders ?? [];
  if (!headers.length) return <div className="gi-stale"><strong>Headers no disponibles</strong><span>El contrato debe devolver los nombres de columna del preview para construir un mapping seguro. Actualiza el job después de desplegar la proyección R3.</span></div>;
  const select = (value: string, onChange: (v: string) => void, optional = false) => <select value={value} onChange={(event) => onChange(event.target.value)} required={!optional}><option value="">{optional ? 'Sin mapping' : 'Selecciona una columna'}</option>{headers.map((header) => <option value={header} key={header}>{header}</option>)}</select>;
  return <form className="gi-mapping-form" onSubmit={props.onSubmit}><p>El mapping es <strong>targetField → sourceHeader</strong>. Una columna fuente no puede alimentar dos targets.</p><label><span>externalReference *</span>{select(props.externalReference, props.setExternalReference)}</label><label><span>label *</span>{select(props.label, props.setLabel)}</label><label><span>classification</span>{select(props.classification, props.setClassification, true)}</label><button className="gi-primary" type="submit" disabled={props.pending || !props.externalReference || !props.label}>{props.pending ? 'Guardando…' : 'Guardar mapping'}</button></form>;
}

function ActionButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return <button className="gi-primary" type="button" disabled={pending} onClick={onClick}>{pending ? 'Procesando…' : label}</button>;
}

function RowsTable({ rows, total }: { rows: Awaited<ReturnType<typeof listImportRows>>['data']['items']; total: number }) {
  return (
    <section className="ops-panel gi-rows imports-r3-rows">
      <div className="ops-panel-heading"><div><h2>Resultado por filas</h2><p>Mostrando hasta {ROW_PAGE_SIZE} de {total} filas. El stagedInput crudo no se expone.</p></div></div>
      <div className="gi-table-wrap"><table><thead><tr><th>Fila</th><th>Validación</th><th>Dry-run</th><th>Commit</th><th>Errores</th></tr></thead><tbody>{rows.map((row) => <tr key={row.importRowId}><td>{row.rowNumber}</td><td>{outcomeLabel(row.validationStatus)}</td><td>{outcomeLabel(row.dryRunOutcome)}</td><td>{outcomeLabel(row.commitOutcome)}</td><td>{row.validationErrors.join(', ') || '—'}</td></tr>)}</tbody></table></div>
    </section>
  );
}

function importTypeLabel(importType: ImportJobResponse['importType']) {
  return importType === 'SYNTHETIC_REFERENCE_RECORDS' ? 'Registros de referencia sintéticos' : importType;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function formatTimestamp(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function outcomeLabel(value: string) {
  return ({
    PENDING: 'Pendiente', VALID: 'Válida', INVALID: 'Inválida', CREATE: 'Crear', UPDATE: 'Actualizar', UNCHANGED: 'Sin cambios',
    REJECTED: 'Rechazada', CREATED: 'Creada', UPDATED: 'Actualizada', FAILED: 'Fallida',
  } as Record<string, string>)[value] ?? value;
}

function statusLabel(status: string) {
  return ({
    UPLOADED: 'Subida', PREVIEWED: 'Preview generado', MAPPED: 'Mapeada', VALIDATED: 'Validada', DRY_RUN_READY: 'Dry-run listo',
    COMMITTING: 'Commit en curso', COMPLETED: 'Completada', COMPLETED_WITH_ERRORS: 'Completada con errores', FAILED: 'Fallida', CANCELLED: 'Cancelada',
  } as Record<string, string>)[status] ?? status;
}
