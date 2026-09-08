import {
  ApplicationError,
  type ActorContext,
  type ClaimRepository,
  type EvidenceRecord,
} from './index.js';
import type { ClaimTaskRepository } from './claim-tasks.js';
import type { ClaimTaskProps } from '@insurance/domain/claim-task';

export const EVIDENCE_ATTENTION_STATES = [
  'NO_EVIDENCE',
  'AVAILABLE',
  'PENDING_REVIEW',
  'REVIEWED',
] as const;

export type EvidenceAttentionState = (typeof EVIDENCE_ATTENTION_STATES)[number];

export interface ClaimEvidenceAttentionDependencies {
  claims: ClaimRepository;
  tasks: ClaimTaskRepository;
}

function requireReadPermission(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new ApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('claims.backoffice.read')) {
    throw new ApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  }
  return actor;
}

async function listEvidenceReviewTasks(tasks: ClaimTaskRepository, claimId: string): Promise<ClaimTaskProps[]> {
  const first = await tasks.list({ page: 1, pageSize: 100, claimId, type: 'EVIDENCE_REVIEW' });
  const items = [...first.items];
  const totalPages = Math.ceil(first.totalItems / 100);
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await tasks.list({ page, pageSize: 100, claimId, type: 'EVIDENCE_REVIEW' });
    items.push(...next.items);
  }
  return items;
}

function evidenceProjection(item: EvidenceRecord) {
  return {
    evidenceId: item.evidenceId,
    mediaType: item.mediaType,
    sizeBytes: item.sizeBytes,
    displayFilename: item.displayFilename,
    createdAt: item.createdAt.toISOString(),
  };
}

function taskProjection(task: ClaimTaskProps) {
  return {
    taskId: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignedOperatorId: task.assignedOperatorId,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    completedById: task.completedById,
  };
}

function deriveState(evidenceCount: number, reviewTasks: ClaimTaskProps[]): EvidenceAttentionState {
  if (evidenceCount === 0) return 'NO_EVIDENCE';
  if (reviewTasks.some((task) => task.status === 'OPEN')) return 'PENDING_REVIEW';
  if (reviewTasks.length > 0 && reviewTasks.every((task) => task.status === 'COMPLETED')) return 'REVIEWED';
  return 'AVAILABLE';
}

export class ClaimEvidenceAttentionApplication {
  constructor(private readonly deps: ClaimEvidenceAttentionDependencies) {}

  async getClaimEvidenceAttention(claimId: string, actor?: ActorContext) {
    requireReadPermission(actor);
    const detail = await this.deps.claims.getById(claimId);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');

    const reviewTasks = await listEvidenceReviewTasks(this.deps.tasks, claimId);
    const openReviewTaskCount = reviewTasks.filter((task) => task.status === 'OPEN').length;
    const completedReviewTaskCount = reviewTasks.filter((task) => task.status === 'COMPLETED').length;

    return {
      claimId: detail.claim.id,
      trackingCode: detail.claim.trackingCode,
      attentionState: deriveState(detail.evidence.length, reviewTasks),
      evidenceCount: detail.evidence.length,
      evidence: detail.evidence.map(evidenceProjection),
      reviewTasks: reviewTasks.map(taskProjection),
      openReviewTaskCount,
      completedReviewTaskCount,
    };
  }
}
