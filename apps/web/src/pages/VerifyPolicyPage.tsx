import { useMutation } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { verifyPolicyVehicle } from '../api/claims';
import type { ApiFailure } from '../api/types';
import { ApiErrorNotice } from '../components/ApiErrorNotice';
import { ClaimFlowLayout } from '../components/ClaimFlowLayout';
import { useClaimFlow } from '../flow/ClaimFlowContext';

const schema = z.object({
  policyReference: z.string().trim().min(1, 'Ingresa la referencia de póliza.').max(80),
  vehicleReference: z.string().trim().min(1, 'Ingresa la referencia del vehículo.').max(80),
});

type FormValues = z.infer<typeof schema>;

export function VerifyPolicyPage() {
  const navigate = useNavigate();
  const flow = useClaimFlow();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { policyReference: '', vehicleReference: '' },
  });

  const mutation = useMutation({
    mutationFn: verifyPolicyVehicle,
    onSuccess(result) {
      flow.setVerification(result.data);
      navigate('/claims/new');
    },
  });

  const failure = mutation.error as ApiFailure | null;

  return (
    <ClaimFlowLayout step={1}>
      <span className="eyebrow">Paso 1 de 4</span>
      <h1>Verifica tu póliza y vehículo</h1>
      <p className="lead">Antes de iniciar el reporte, validamos la combinación contra el servicio autorizado. El navegador nunca consulta directamente el sistema legacy simulado.</p>

      {failure && <ApiErrorNotice failure={failure} />}

      <form className="form-grid" onSubmit={form.handleSubmit((values) => mutation.mutate(values))} noValidate>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="policyReference">Referencia de póliza</label>
            <input
              id="policyReference"
              className="input"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.policyReference)}
              aria-describedby={form.formState.errors.policyReference ? 'policyReference-error' : 'policyReference-hint'}
              {...form.register('policyReference')}
            />
            <span id="policyReference-hint" className="hint">Para la demo puedes usar, por ejemplo, SYN-POL-001.</span>
            {form.formState.errors.policyReference && <span id="policyReference-error" className="field-error">{form.formState.errors.policyReference.message}</span>}
          </div>

          <div className="field">
            <label htmlFor="vehicleReference">Referencia del vehículo</label>
            <input
              id="vehicleReference"
              className="input"
              autoComplete="off"
              aria-invalid={Boolean(form.formState.errors.vehicleReference)}
              aria-describedby={form.formState.errors.vehicleReference ? 'vehicleReference-error' : 'vehicleReference-hint'}
              {...form.register('vehicleReference')}
            />
            <span id="vehicleReference-hint" className="hint">Para la demo puedes usar, por ejemplo, SYN-VEH-001.</span>
            {form.formState.errors.vehicleReference && <span id="vehicleReference-error" className="field-error">{form.formState.errors.vehicleReference.message}</span>}
          </div>
        </div>

        <div className="alert alert-info">
          Los valores de demostración son sintéticos. La elegibilidad siempre la decide el API mediante <code>verifyPolicyVehicle</code>.
        </div>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Verificando…' : 'Verificar y continuar'}
          </button>
        </div>
      </form>
    </ClaimFlowLayout>
  );
}
