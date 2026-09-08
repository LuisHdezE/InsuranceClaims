import {
  ApplicationError,
  type ActorContext,
  type ClaimRepository,
} from './index.js';
import type { ClaimTaskRepository } from './claim-tasks.js';
import type { ClaimStatus } from '@insurance/domain';
import type { ClaimTaskType } from '@insurance/domain/claim-task';

export const CLAIM_TIMELINE_EVENT_TYPES = [
  'CLAIM_REPORTED',
  'EVIDENCE_ADDED',
  'STATUS_CHANGED',
  'TASK_CREATED',
  'TASK_COMPLETED',
] as const;

export type ClaimTimelineEventType = (typeof CLAIM_TIMELINE_EVENT_TYPES)[number];
export type ClaimTimelineSource = 'CLAIM_HISTORY' | 'CLAIM_EVIDENCE' | 'CLAIM_TASK';
export type ClaimTimelineActorType = 'SYSTEM' | 'OPERATOR' | null;

type TimelineBase = {
  eventId: string;
  eventType: ClaimTimelineEventType;
  source: ClaimTimelineSource;
  occurredAt: string;
  actorType: ClaimTimelineActorType;
  actorId: string | null;
};

export type ClaimTimelineEvent =
  | (TimelineBase & {
      eventType: 'CLAIM_REPORTED';
      status: ClaimStatus;
    })
  | (TimelineBase & {
      eventType: 'EVIDENCE_ADDED';
      evidenceId: string;
      displayFilename: string | null;
      mediaType: string;
    })
  | (TimelineBase & {
      eventType: 'STATUS_CHANGED';
      fromStatus: ClaimStatus;
      toStatus: ClaimStatus;
    })
  | (TimelineBase & {
      eventType: 'TASK_CREATED';
      taskId: string;
      taskType: ClaimTaskType;
      taskTitle: string;
    })
  | (TimelineBase & {
      eventType: 'TASK_COMPLETED';
      taskId: string;
      taskType: ClaimTaskType;
      taskTitle: string;
    });

export interface ClaimTimelineDependencies {
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

async function listAllClaimTasks(tasks: ClaimTaskRepository, claimId: string) {
  const first = await tasks.list({ page: 1, pageSize: 100, claimId });
  const items = [...first.items];
  const totalPages = Math.ceil(first.totalItems / 100);
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await tasks.list({ page, pageSize: 100, claimId });
    items.push(...next.items);
  }
  return items;
}

const EVENT_ORDER: Record<ClaimTimelineEventType, number> = {
  CLAIM_REPORTED: 0,
  EVIDENCE_ADDED: 1,
  TASK_CREATED: 2,
  STATUS_CHANGED: 3,
  TASK_COMPLETED: 4,
};

export class ClaimTimelineApplication {
  constructor(private readonly deps: ClaimTimelineDependencies) {}

  async listClaimTimeline(claimId: string, actor?: ActorContext) {
    requireReadPermission(actor);
    const detail = await this.deps.claims.getById(claimId);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');

    const tasks = await listAllClaimTasks(this.deps.tasks, claimId);
    const events: ClaimTimelineEvent[] = [];

    for (const item of detail.history) {
      if (item.fromStatus === null) {
        events.push({
          eventId: `history:${item.historyId}`,
          eventType: 'CLAIM_REPORTED',
          source: 'CLAIM_HISTORY',
          occurredAt: item.occurredAt.toISOString(),
          actorType: item.actorType,
          actorId: item.actorId,
          status: item.toStatus,
        });
      } else {
        events.push({
          eventId: `history:${item.historyId}`,
          eventType: 'STATUS_CHANGED',
          source: 'CLAIM_HISTORY',
          occurredAt: item.occurredAt.toISOString(),
          actorType: item.actorType,
          actorId: item.actorId,
          fromStatus: item.fromStatus,
          toStatus: item.toStatus,
        });
      }
    }

    for (const evidence of detail.evidence) {
      // Evidence is staged before the Claim transaction commits. Operationally it cannot
      // be associated to the Claim before the Claim exists, so clamp the projection time
      // to the Claim creation time while preserving later evidence timestamps if added.
      const associatedAt = new Date(Math.max(evidence.createdAt.getTime(), detail.claim.createdAt.getTime()));
      events.push({
        eventId: `evidence:${evidence.evidenceId}`,
        eventType: 'EVIDENCE_ADDED',
        source: 'CLAIM_EVIDENCE',
        occurredAt: associatedAt.toISOString(),
        actorType: null,
        actorId: null,
        evidenceId: evidence.evidenceId,
        displayFilename: evidence.displayFilename,
        mediaType: evidence.mediaType,
      });
    }

    for (const task of tasks) {
      events.push({
        eventId: `task:${task.id}:created`,
        eventType: 'TASK_CREATED',
        source: 'CLAIM_TASK',
        occurredAt: task.createdAt.toISOString(),
        actorType: task.createdByType,
        actorId: task.createdById,
        taskId: task.id,
        taskType: task.type,
        taskTitle: task.title,
      });
      if (task.completedAt) {
        events.push({
          eventId: `task:${task.id}:completed`,
          eventType: 'TASK_COMPLETED',
          source: 'CLAIM_TASK',
          occurredAt: task.completedAt.toISOString(),
          actorType: 'OPERATOR',
          actorId: task.completedById,
          taskId: task.id,
          taskType: task.type,
          taskTitle: task.title,
        });
      }
    }

    events.sort((left, right) => {
      const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
      if (byTime !== 0) return byTime;
      const byType = EVENT_ORDER[left.eventType] - EVENT_ORDER[right.eventType];
      if (byType !== 0) return byType;
      return left.eventId.localeCompare(right.eventId);
    });

    return {
      claimId: detail.claim.id,
      trackingCode: detail.claim.trackingCode,
      events,
      totalItems: events.length,
    };
  }
}
