import { Navigate, useNavigate } from 'react-router-dom';
import { ClaimFlowLayout } from '../components/ClaimFlowLayout';
import { useClaimFlow } from '../flow/ClaimFlowContext';

export function ClaimSubmittedPage() {
  const flow = useClaimFlow();
  const navigate = useNavigate();

  if (!flow.receipt) return <Navigate to="/claims/new/verify" replace />;

  return (
    <ClaimFlowLayout step={4}>
      <span className="eyebrow">Paso 4 de 4</span>
      <h1>Siniestro reportado</h1>
      <p className="lead">El API confirmó la creación. Guarda el código de seguimiento para consultar el estado cuando el slice de tracking esté habilitado.</p>

      <div className="alert alert-success" role="status">
        <strong>Tu reporte fue recibido correctamente.</strong>
        {flow.receipt.idempotencyReplayed && <div>Esta respuesta corresponde a una repetición idempotente del envío original, sin crear un duplicado.</div>}
      </div>

      <div className="receipt-card">
        <div>Código de seguimiento</div>
        <div className="tracking-code">{flow.receipt.trackingCode}</div>
        <div>Estado inicial: <strong>{flow.receipt.status}</strong></div>
        <div>Enviado: {new Date(flow.receipt.submittedAt).toLocaleString('es-UY')}</div>
        {flow.receipt.nextSteps.length > 0 && (
          <>
            <h2 style={{ marginTop: 24 }}>Próximos pasos</h2>
            <ul className="next-steps">
              {flow.receipt.nextSteps.map((step) => <li key={step}>{step}</li>)}
            </ul>
          </>
        )}
        {flow.receipt.requestId && <div className="request-id">Referencia técnica: {flow.receipt.requestId}</div>}
      </div>

      <div className="form-actions" style={{ marginTop: 24 }}>
        <button className="btn btn-primary" type="button" onClick={() => { flow.reset(); navigate('/'); }}>Volver al inicio</button>
        <button className="btn btn-ghost" type="button" disabled aria-disabled="true">Seguimiento · siguiente slice</button>
      </div>
    </ClaimFlowLayout>
  );
}
