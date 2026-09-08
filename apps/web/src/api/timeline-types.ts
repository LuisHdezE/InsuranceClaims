import type { ClaimStatus } from './types';
import type { ClaimTaskType } from './task-types';

export type ClaimTimelineEventType =
  | 'CLAIM_REPORTED'
  | 'EVIDENCE_ADDED'
  | 'STATUS_CHANGED'
  | 'TASK_CREATED'
  | 'TASK_COMPLETED';

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
  | (TimelineBase & { eventType: 'CLAIM_REPORTED'; status: ClaimStatus })
  | (TimelineBase & {
      eventType: 'EVIDENCE_ADDED';
      evidenceId: string;
      displayFilename: string | null;
      mediaType: string;
    })
  | (TimelineBase & { eventType: 'STATUS_CHANGED'; fromStatus: ClaimStatus; toStatus: ClaimStatus })
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

export type ClaimTimelineResponse = {
  claimId: string;
  trackingCode: string;
  events: ClaimTimelineEvent[];
  totalItems: number;
};
