import { useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { createClaim } from '../api/claims';
import type { ApiFailure } from '../api/types';
import { ClaimFlowLayout } from '../components/ClaimFlowLayout';
import { formatFileSize } from '../flow/evidence';
import { useClaimFlow } from '../flow/ClaimFlowContext';

export function ReviewClaimPage() {
  const flow = useClaimFlow();
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: async () => {
      if (!flow.verification || !flow.draft) {
        throw new Error('El flujo de reporte ya no contiene los datos necesarios.');
      }
      const key = flow.ensureIdempotencyKey();
      return createClaim(flow.verification, flow.draft, key);
    },
    onSuccess(result) {
      flow.setReceipt({
        ...result.data,
        requestId: result.requestId,
        idempotencyReplayed: result.idempotencyReplayed ?? false,
      });
      navigate('/claims/new/success');
    },
  });

  if (!flow.verification) return <Navigate to="/claims/new/verify" replace />;
  if (!flow.draft) return <Navigate to="/claims/new" replace />;

  const failure = mutation.error as ApiFailure | null;

  return (
    <ClaimFlowLayout step={3}>
      <span className="eyebrow">Paso 3 de 4</span>
      <h1>Revisa antes de confirmar</h1>
      <p className="lead">Comprueba los datos. Al confirmar se ejecutará la única creación autoritativa del siniestro mediante <code>createClaim</code>.</p>

      {failure && (
        <div className={failure.problem?.status === 409 ? 'alert alert-warning' : 'alert alert-error'} role="alert">
          <strong>{failure.problem?.status === 409 ? 'La solicitud necesita revisión.' : 'No pudimos enviar el siniestro.'}</strong><br />
          {failure.message}
          {failure.problem?.status === 409 && <div>Conservamos la misma clave de idempotencia para evitar duplicados. No se generará una nueva solicitud automáticamente.</div>}
          {failure.requestId && <div className="request-id">Referencia técnica: {failure.requestId}</div>}
        </div>
      )}

      <div className="review-card">
        <dl>
          <dt>Póliza</dt><dd>{flow.verification.policyReference}</dd>
          <dt>Vehículo</dt><dd>{flow.verification.vehicleReference}</dd>
          <dt>Tipo de evento</dt><dd>{flow.draft.eventType}</dd>
          <dt>Fecha y hora</dt><dd>{new Date(flow.draft.occurredAt).toLocaleString('es-UY')}</dd>
          <dt>Ubicación</dt><dd>{flow.draft.locationText}</dd>
          <dt>Descripción</dt><dd>{flow.draft.description}</dd>
          <dt>Evidencia</dt><dd>{flow.draft.evidence.length === 0 ? 'Sin archivos' : `${flow.draft.evidence.length} archivo(s)`}</dd>
        </dl>

        {flow.draft.evidence.length > 0 && (
          <ul className="evidence-list" aria-label="Evidencia preparada">
            {flow.draft.evidence.map((file, index) => (
              <li key={`${file.name}-${index}`}><span>{file.name}</span><span>{formatFileSize(file.size)}</span></li>
            ))}
          </ul>
        )}
      </div>

      <div className="alert alert-info">
        La clave <code>Idempotency-Key</code> se genera una sola vez para esta intención de envío y se reutiliza si debes reintentar exactamente el mismo contenido.
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Enviando…' : 'Confirmar y enviar'}
        </button>
        <button className="btn btn-ghost" type="button" disabled={mutation.isPending} onClick={() => navigate('/claims/new')}>Editar datos</button>
      </div>
    </ClaimFlowLayout>
  );
}
