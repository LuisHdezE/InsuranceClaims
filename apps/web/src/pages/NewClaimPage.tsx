import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ClaimFlowLayout } from '../components/ClaimFlowLayout';
import { formatFileSize, validateEvidence } from '../flow/evidence';
import { useClaimFlow } from '../flow/ClaimFlowContext';

const schema = z.object({
  eventType: z.string().trim().min(1, 'Describe el tipo de evento.').max(60),
  occurredAt: z.string().min(1, 'Indica fecha y hora del evento.'),
  locationText: z.string().trim().min(1, 'Indica la ubicación.').max(300),
  description: z.string().trim().min(1, 'Describe lo ocurrido.').max(4000),
});

type FormValues = z.infer<typeof schema>;

export function NewClaimPage() {
  const flow = useClaimFlow();
  const navigate = useNavigate();
  const [evidence, setEvidence] = useState<File[]>(flow.draft?.evidence ?? []);
  const [evidenceErrors, setEvidenceErrors] = useState<string[]>([]);

  const defaults = useMemo<FormValues>(() => ({
    eventType: flow.draft?.eventType ?? '',
    occurredAt: flow.draft?.occurredAt ?? '',
    locationText: flow.draft?.locationText ?? '',
    description: flow.draft?.description ?? '',
  }), [flow.draft]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  if (!flow.verification) return <Navigate to="/claims/new/verify" replace />;

  function onEvidenceSelection(files: File[]) {
    const combined = [...evidence, ...files];
    const validation = validateEvidence(combined);
    setEvidenceErrors(validation.errors);
    if (validation.errors.length === 0) setEvidence(validation.accepted);
  }

  function removeEvidence(index: number) {
    setEvidence((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setEvidenceErrors([]);
  }

  function submit(values: FormValues) {
    const validation = validateEvidence(evidence);
    setEvidenceErrors(validation.errors);
    if (validation.errors.length > 0) return;
    flow.setDraft({ ...values, evidence });
    navigate('/claims/new/review');
  }

  return (
    <ClaimFlowLayout step={2}>
      <span className="eyebrow">Paso 2 de 4</span>
      <h1>Cuéntanos qué ocurrió</h1>
      <p className="lead">Completa los datos del evento y, si lo deseas, adjunta evidencia. La validación del servidor sigue siendo la autoridad final.</p>

      <div className="verification-card" aria-label="Verificación confirmada">
        <dl>
          <dt>Póliza verificada</dt><dd>{flow.verification.policyReference}</dd>
          <dt>Vehículo verificado</dt><dd>{flow.verification.vehicleReference}</dd>
          <dt>Cliente sintético</dt><dd>{flow.verification.customerLabel ?? 'No informado por el servicio'}</dd>
        </dl>
      </div>

      <form className="form-grid" style={{ marginTop: 24 }} onSubmit={form.handleSubmit(submit)} noValidate>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="eventType">Tipo de evento</label>
            <input id="eventType" className="input" aria-invalid={Boolean(form.formState.errors.eventType)} {...form.register('eventType')} />
            <span className="hint">Texto libre según el contrato API; el cliente no inventa un catálogo autoritativo.</span>
            {form.formState.errors.eventType && <span className="field-error">{form.formState.errors.eventType.message}</span>}
          </div>
          <div className="field">
            <label htmlFor="occurredAt">Fecha y hora</label>
            <input id="occurredAt" className="input" type="datetime-local" aria-invalid={Boolean(form.formState.errors.occurredAt)} {...form.register('occurredAt')} />
            {form.formState.errors.occurredAt && <span className="field-error">{form.formState.errors.occurredAt.message}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="locationText">Ubicación</label>
          <input id="locationText" className="input" aria-invalid={Boolean(form.formState.errors.locationText)} {...form.register('locationText')} />
          {form.formState.errors.locationText && <span className="field-error">{form.formState.errors.locationText.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="description">Descripción</label>
          <textarea id="description" className="textarea" aria-invalid={Boolean(form.formState.errors.description)} {...form.register('description')} />
          <span className="hint">Máximo 4000 caracteres según el contrato vigente.</span>
          {form.formState.errors.description && <span className="field-error">{form.formState.errors.description.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="evidence">Evidencia opcional</label>
          <input
            id="evidence"
            className="input"
            type="file"
            multiple
            accept="image/jpeg,image/png,application/pdf"
            onChange={(event) => onEvidenceSelection(Array.from(event.target.files ?? []))}
          />
          <span className="hint">Máximo 5 archivos, 5 MiB cada uno. JPEG, PNG o PDF. El servidor vuelve a validar tipo, cantidad y tamaño.</span>
          {evidenceErrors.length > 0 && <div className="alert alert-error" role="alert">{evidenceErrors.map((error) => <div key={error}>{error}</div>)}</div>}
          {evidence.length > 0 && (
            <ul className="evidence-list" aria-label="Archivos seleccionados">
              {evidence.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`}>
                  <span>{file.name} · {formatFileSize(file.size)}</span>
                  <button type="button" onClick={() => removeEvidence(index)} aria-label={`Quitar ${file.name}`}>Quitar</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Continuar a revisión</button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/claims/new/verify')}>Volver</button>
        </div>
      </form>
    </ClaimFlowLayout>
  );
}
