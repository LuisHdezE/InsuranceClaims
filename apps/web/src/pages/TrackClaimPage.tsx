import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { trackClaim } from '../api/claims';
import type { ApiFailure, TrackClaimRequest } from '../api/types';
import { ApiErrorNotice } from '../components/ApiErrorNotice';
import { PublicShell } from '../components/PublicShell';
import { useTrackingFlow } from '../flow/TrackingFlowContext';

const schema = z.object({
  trackingCode: z.string().trim().min(1, 'Ingresa el código de seguimiento.').max(80),
  policyReference: z.string().trim().min(1, 'Ingresa la referencia de póliza.').max(80),
});

type FormValues = z.infer<typeof schema>;

export function TrackClaimPage() {
  const navigate = useNavigate();
  const tracking = useTrackingFlow();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { trackingCode: '', policyReference: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: TrackClaimRequest) => trackClaim(values),
    onSuccess(result, proof) {
      // The status route requires the proof/result pair synchronously on its first render.
      // Commit the in-memory tracking state before navigation so the route guard never
      // observes a transient null value and redirects a successful lookup back to search.
      flushSync(() => {
        tracking.setResult(proof, result.data, result.requestId);
      });
      navigate('/claims/track/status');
    },
  });

  const failure = mutation.error as ApiFailure | null;

  return (
    <PublicShell>
      <main className="flow-main">
        <div className="container-shell tracking-lookup-shell">
          <section className="flow-panel tracking-lookup-panel" aria-labelledby="tracking-title">
            <span className="eyebrow">Seguimiento de siniestro</span>
            <h1 id="tracking-title">Consulta el estado de tu reporte</h1>
            <p className="lead">
              Ingresa el código de seguimiento y la referencia de póliza. Ambos datos forman una prueba conjunta y se envían únicamente al API público autorizado.
            </p>

            {failure && <ApiErrorNotice failure={failure} />}

            <form className="form-grid" onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
              <div className="field">
                <label htmlFor="trackingCode">Código de seguimiento</label>
                <input
                  id="trackingCode"
                  className="input"
                  autoComplete="off"
                  aria-invalid={Boolean(form.formState.errors.trackingCode)}
                  aria-describedby={form.formState.errors.trackingCode ? 'trackingCode-error trackingCode-hint' : 'trackingCode-hint'}
                  {...form.register('trackingCode')}
                />
                <span id="trackingCode-hint" className="hint">Es el código opaco entregado al confirmar el reporte.</span>
                {form.formState.errors.trackingCode && <span id="trackingCode-error" className="field-error">{form.formState.errors.trackingCode.message}</span>}
              </div>

              <div className="field">
                <label htmlFor="trackingPolicyReference">Referencia de póliza</label>
                <input
                  id="trackingPolicyReference"
                  className="input"
                  autoComplete="off"
                  aria-invalid={Boolean(form.formState.errors.policyReference)}
                  aria-describedby={form.formState.errors.policyReference ? 'trackingPolicyReference-error trackingPolicyReference-hint' : 'trackingPolicyReference-hint'}
                  {...form.register('policyReference')}
                />
                <span id="trackingPolicyReference-hint" className="hint">Usa la misma referencia sintética asociada al reporte.</span>
                {form.formState.errors.policyReference && <span id="trackingPolicyReference-error" className="field-error">{form.formState.errors.policyReference.message}</span>}
              </div>

              <div className="alert alert-info">
                Por seguridad, una combinación inválida siempre se presenta como “no encontrado”. Nunca indicamos cuál de los dos datos no coincidió.
              </div>

              <div className="form-actions">
                <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Consultando…' : 'Consultar estado'}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => navigate('/')}>Volver al inicio</button>
              </div>
            </form>
          </section>
        </div>
      </main>
    </PublicShell>
  );
}
