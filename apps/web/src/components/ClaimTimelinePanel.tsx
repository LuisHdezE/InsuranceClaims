import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClaimTimeline } from '../api/timeline';
import type { ClaimTimelineEvent } from '../api/timeline-types';
import type { ApiFailure, ClaimStatus } from '../api/types';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import { taskTypeLabel } from './ClaimTasksPanel';
import { OperatorApiErrorNotice } from './OperatorApiErrorNotice';

export function ClaimTimelinePanel({ claimId }: { claimId: string }) {
  const { session, signOut } = useOperatorSession();
  const timelineQuery = useQuery({
    queryKey: ['operator', 'claim', claimId, 'timeline'],
    queryFn: () => getClaimTimeline(claimId, session!.accessToken),
    enabled: Boolean(session && claimId),
  });

  const failure = timelineQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const timeline = timelineQuery.data?.data;

  return (
    <section className="ops-panel ops-timeline-card" aria-labelledby="operations-timeline-title">
      <div className="ops-panel-heading">
        <div>
          <span className="ops-kicker">Actividad operacional</span>
          <h2 id="operations-timeline-title">Timeline</h2>
          <p>Hechos durables de estado, evidencia y trabajo. La auditoría técnica permanece separada.</p>
        </div>
        <span className="ops-count-pill">{timeline?.totalItems ?? 0} evento(s)</span>
      </div>

      {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
      {timelineQuery.isLoading ? (
        <div className="ops-compact-empty" role="status">Cargando actividad operacional…</div>
      ) : !timeline || timeline.events.length === 0 ? (
        <div className="ops-compact-empty">No hay actividad operacional disponible.</div>
      ) : (
        <ol className="ops-operational-timeline">
          {timeline.events.map((event) => {
            const presentation = eventPresentation(event);
            return (
              <li key={event.eventId} className={`is-${timelineTone(event.eventType)}`}>
                <time dateTime={event.occurredAt} title={formatDate(event.occurredAt)}>{formatTime(event.occurredAt)}</time>
                <span className="ops-operational-timeline-marker" aria-hidden="true">{timelineIcon(event.eventType)}</span>
                <div className="ops-operational-timeline-copy">
                  <strong>{presentation.title}</strong>
                  <span>{presentation.detail}</span>
                  <small>{formatDate(event.occurredAt)}</small>
                </div>
                <span className="ops-operational-timeline-actor">{actorLabel(event.actorType)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function eventPresentation(event: ClaimTimelineEvent): { title: string; detail: string } {
  switch (event.eventType) {
    case 'CLAIM_REPORTED':
      return { title: 'Siniestro reportado', detail: `Estado inicial: ${statusLabel(event.status)}` };
    case 'EVIDENCE_ADDED':
      return {
        title: 'Evidencia registrada',
        detail: event.displayFilename ?? mediaTypeLabel(event.mediaType),
      };
    case 'STATUS_CHANGED':
      return {
        title: 'Cambio de estado',
        detail: `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`,
      };
    case 'TASK_CREATED':
      return {
        title: 'Tarea creada',
        detail: `${event.taskTitle} · ${taskTypeLabel(event.taskType)}`,
      };
    case 'TASK_COMPLETED':
      return {
        title: 'Tarea completada',
        detail: `${event.taskTitle} · ${taskTypeLabel(event.taskType)}`,
      };
  }
}

function timelineTone(type: ClaimTimelineEvent['eventType']) {
  return ({
    CLAIM_REPORTED: 'blue',
    EVIDENCE_ADDED: 'violet',
    STATUS_CHANGED: 'cyan',
    TASK_CREATED: 'yellow',
    TASK_COMPLETED: 'green',
  } satisfies Record<ClaimTimelineEvent['eventType'], string>)[type];
}

function timelineIcon(type: ClaimTimelineEvent['eventType']) {
  return ({
    CLAIM_REPORTED: '◆',
    EVIDENCE_ADDED: '▣',
    STATUS_CHANGED: '↗',
    TASK_CREATED: '+',
    TASK_COMPLETED: '✓',
  } satisfies Record<ClaimTimelineEvent['eventType'], string>)[type];
}

function actorLabel(actorType: ClaimTimelineEvent['actorType']) {
  if (actorType === 'OPERATOR') return 'Operador';
  if (actorType === 'SYSTEM') return 'Sistema';
  return 'Registro';
}

function statusLabel(status: ClaimStatus) {
  return ({
    RECEIVED: 'Recibido',
    UNDER_REVIEW: 'En revisión',
    OBSERVED: 'Observado',
    APPROVED: 'Aprobado',
    IN_REPAIR: 'En reparación',
    CLOSED: 'Cerrado',
  } satisfies Record<ClaimStatus, string>)[status];
}

function mediaTypeLabel(mediaType: string) {
  if (mediaType === 'application/pdf') return 'Documento PDF';
  if (mediaType.startsWith('image/')) return 'Imagen adjunta';
  return 'Archivo adjunto';
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
