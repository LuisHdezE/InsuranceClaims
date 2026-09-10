import type { ClaimTaskCancellationReason, ClaimTaskStatus, ClaimTaskType } from '../api/task-types';

export function taskTypeLabel(type: ClaimTaskType) {
  return ({
    CLAIM_REVIEW: 'Revisión de siniestro',
    EVIDENCE_REVIEW: 'Revisión de evidencia',
    MISSING_DOCUMENT_FOLLOWUP: 'Seguimiento documental',
    CUSTOMER_FOLLOWUP: 'Seguimiento al cliente',
    CLOSURE_REVIEW: 'Revisión de cierre',
  } satisfies Record<ClaimTaskType, string>)[type];
}

export function taskStatusLabel(status: ClaimTaskStatus) {
  return status === 'OPEN' ? 'Abierta' : status === 'COMPLETED' ? 'Completada' : 'Cancelada';
}

export function cancellationReasonLabel(reason: ClaimTaskCancellationReason) {
  return ({
    NO_LONGER_REQUIRED: 'Ya no es necesaria',
    DUPLICATE: 'Duplicada',
    CREATED_IN_ERROR: 'Creada por error',
  } satisfies Record<ClaimTaskCancellationReason, string>)[reason];
}
