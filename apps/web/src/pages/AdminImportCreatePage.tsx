import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createImportJob, newImportIdempotencyKey } from '../api/governed-imports';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

export function AdminImportCreatePage() {
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const keyRef = useRef(newImportIdempotencyKey('create'));
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => createImportJob(file!, keyRef.current, session!.accessToken),
    onSuccess: ({ data }) => navigate(`/operator/admin/imports/${data.importJobId}`),
  });
  const failure = mutation.error as ApiFailure | null;

  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError(null);
    if (!file) return setLocalError('Selecciona un archivo CSV o XLSX.');
    if (!ACCEPTED.includes(file.type) && !/\.(csv|xlsx)$/i.test(file.name)) return setLocalError('El archivo debe ser CSV o XLSX.');
    if (file.size < 1 || file.size > MAX_BYTES) return setLocalError('El archivo debe contener datos y no superar 10 MiB.');
    mutation.mutate();
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main gi-main gi-create-main">
        <div className="ops-page-heading gi-heading">
          <div>
            <span className="ops-kicker">Governed Imports R3</span>
            <h1>Nueva importación</h1>
            <p>La creación solo admite el fixture sintético aprobado. El archivo queda staged antes de cualquier preview o mutación autoritativa.</p>
          </div>
          <Link className="gi-secondary" to="/operator/admin/imports">← Volver</Link>
        </div>

        <section className="ops-panel gi-form-panel">
          <form onSubmit={submit} className="gi-form">
            <label>
              <span>Tipo de importación</span>
              <input value="SYNTHETIC_REFERENCE_RECORDS" readOnly />
              <small>R3 no expone tipos de negocio reales.</small>
            </label>
            <label>
              <span>Archivo fuente</span>
              <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); keyRef.current = newImportIdempotencyKey('create'); }} />
              <small>CSV o XLSX · máximo 10 MiB · hasta 5.000 filas procesables.</small>
            </label>
            {file && <div className="gi-file-summary"><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>}
            {localError && <p className="gi-local-error" role="alert">{localError}</p>}
            {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
            <div className="gi-form-actions">
              <button className="gi-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creando…' : 'Crear importación'}</button>
              <span>El mismo Idempotency-Key se conserva mientras reintentes este archivo sin cambiar la selección.</span>
            </div>
          </form>
        </section>
      </main>
    </OperatorShell>
  );
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
}
