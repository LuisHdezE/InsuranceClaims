import type { ApiFailure } from '../api/types';

export type ApiErrorPresentation = {
  tone: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  recovery?: string;
};

export function describeApiFailure(failure: ApiFailure): ApiErrorPresentation {
  if (failure.network) {
    return {
      tone: 'warning',
      title: 'No pudimos conectar con el servicio.',
      detail: 'Revisa tu conexión e inténtalo nuevamente cuando el servicio esté disponible.',
      recovery: 'No asumimos que la operación se completó ni generamos datos locales como sustituto del API.',
    };
  }

  switch (failure.problem?.status) {
    case 404:
      return {
        tone: 'info',
        title: 'No encontramos un siniestro con esos datos.',
        detail: 'Verifica el código de seguimiento y la referencia de póliza e inténtalo nuevamente.',
        recovery: 'Por seguridad no indicamos cuál de los dos datos de la prueba de seguimiento no coincidió.',
      };
    case 409:
      return {
        tone: 'warning',
        title: 'La solicitud necesita revisión.',
        detail: failure.message,
        recovery: 'Conservamos la misma intención de envío. No generaremos una nueva solicitud automáticamente.',
      };
    case 422:
      return {
        tone: 'error',
        title: 'Revisa los datos enviados.',
        detail: failure.message,
        recovery: 'Corrige la información indicada antes de volver a intentarlo.',
      };
    case 429:
      return {
        tone: 'warning',
        title: 'Hay demasiados intentos en este momento.',
        detail: failure.message,
        recovery: failure.retryAfter
          ? `Espera aproximadamente ${failure.retryAfter} segundos antes de reintentar.`
          : 'Espera un momento antes de reintentar.',
      };
    case 503:
      return {
        tone: 'warning',
        title: 'El servicio no está disponible temporalmente.',
        detail: failure.message,
        recovery: 'Puedes reintentar más tarde. No se sustituye la respuesta autoritativa del servidor con datos locales.',
      };
    default:
      return {
        tone: 'error',
        title: 'No pudimos completar la solicitud.',
        detail: failure.message,
      };
  }
}

export function ApiErrorNotice({ failure }: { failure: ApiFailure }) {
  const presentation = describeApiFailure(failure);
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
