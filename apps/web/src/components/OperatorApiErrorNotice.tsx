import type { ApiFailure } from '../api/types';

export type OperatorErrorPresentation = {
  tone: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  recovery?: string;
};

export function describeOperatorApiFailure(failure: ApiFailure): OperatorErrorPresentation {
  if (failure.network) {
    return {
      tone: 'warning',
      title: 'Sin conexión con el servicio.',
      detail: 'No mostramos datos locales como si fueran el estado real del siniestro.',
      recovery: 'Verifica la conectividad y vuelve a consultar el API autoritativo.',
    };
  }

  switch (failure.problem?.status) {
    case 401:
      return {
        tone: 'warning',
        title: 'La sesión no es válida.',
        detail: 'La autenticación falta, venció o fue rechazada.',
        recovery: 'Vuelve a iniciar sesión. El cliente elimina la caché protegida y no intenta renovar el token porque API v1 no ofrece refresh.',
      };
    case 403:
      return {
        tone: 'error',
        title: 'Acceso no autorizado.',
        detail: 'El servidor no autorizó esta operación para la identidad autenticada.',
        recovery: 'La interfaz no sustituye ni amplía los permisos decididos por el API.',
      };
    case 404:
      return {
        tone: 'info',
        title: 'El recurso solicitado no está disponible.',
        detail: failure.message,
        recovery: 'Regresa al listado y consulta nuevamente el estado autoritativo.',
      };
    case 409:
      return {
        tone: 'warning',
        title: 'El siniestro cambió mientras trabajabas.',
        detail: failure.message,
        recovery: 'Actualizamos el detalle desde el servidor. Revisa el estado actual y toma una nueva decisión explícita.',
      };
    case 422:
      return {
        tone: 'error',
        title: 'La solicitud no pasó la validación.',
        detail: failure.message,
        recovery: 'Corrige los datos indicados antes de volver a enviar la operación.',
      };
    case 429:
      return {
        tone: 'warning',
        title: 'Demasiadas solicitudes.',
        detail: failure.message,
        recovery: failure.retryAfter
          ? `Espera aproximadamente ${failure.retryAfter} segundos antes de reintentar.`
          : 'Espera antes de reintentar para no generar una tormenta de solicitudes.',
      };
    case 503:
      return {
        tone: 'warning',
        title: 'El servicio no puede completar la operación temporalmente.',
        detail: failure.message,
        recovery: 'No asumimos éxito. Vuelve a consultar el estado autoritativo antes de decidir el siguiente paso.',
      };
    default:
      return {
        tone: 'error',
        title: 'No pudimos completar la operación.',
        detail: failure.message,
      };
  }
}

export function OperatorApiErrorNotice({ failure }: { failure: ApiFailure }) {
  const presentation = describeOperatorApiFailure(failure);
  const toneClass = presentation.tone === 'warning'
    ? 'alert-warning'
    : presentation.tone === 'info'
      ? 'alert-info'
      : 'alert-error';

  return (
    <div className={`alert ${toneClass}`} role="alert" aria-live="assertive">
      <strong>{presentation.title}</strong><br />
      {presentation.detail}
      {presentation.recovery && <div>{presentation.recovery}</div>}
      {failure.requestId && <div className="request-id">Referencia técnica: {failure.requestId}</div>}
    </div>
  );
}
