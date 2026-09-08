import { isClaimStatus, type ClaimProps, type ClaimStatus } from '@insurance/domain';
import { ApplicationError, type ActorContext, type ClaimRepository, type ClockPort } from './index.js';
import type { ClaimTaskRepository } from './claim-tasks.js';
import type { PipelineWorkItemRepository } from './claim-pipeline.js';

export const CLAIMS_OPERATIONAL_SORTS = [
  'createdAt:desc',
  'createdAt:asc',
  'occurredAt:desc',
  'occurredAt:asc',
  'trackingCode:asc',
  'trackingCode:desc',
] as const;

export type ClaimsOperationalSort = (typeof CLAIMS_OPERATIONAL_SORTS)[number];

export interface ClaimsOperationalQueryDependencies {
  claims: ClaimRepository;
  tasks: ClaimTaskRepository;
  pipelines: PipelineWorkItemRepository;
  clock: ClockPort;
}

interface ClaimStageProjection {
  workItemId: string;
  workItemVersion: number;
  pipelineDefinitionId: string;
  pipelineVersionId: string;
  stageKey: string;
  displayName: string;
  sortOrder: number;
}

interface OperationalClaimRecord {
  claim: ClaimProps;
  stage: ClaimStageProjection | null;
}

function requirePermission(actor: ActorContext | undefined, permission: 'claims.backoffice.read' | 'claims.analytics.read'): ActorContext {
  if (!actor) throw new ApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) throw new ApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  return actor;
}

function normalizeSearch(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 120) {
    throw new ApplicationError('VALIDATION_ERROR', 'search must contain 1 to 120 characters.');
  }
  return normalized;
}

function normalizeStage(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 80 || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new ApplicationError('VALIDATION_ERROR', 'stage must be a bounded pipeline stage key.');
  }
  return normalized;
}

function isOperationalSort(value: string): value is ClaimsOperationalSort {
  return (CLAIMS_OPERATIONAL_SORTS as readonly string[]).includes(value);
}

async function collectClaims(claims: ClaimRepository, status?: ClaimStatus): Promise<ClaimProps[]> {
  const pageSize = 100;
  const first = await claims.list({ page: 1, pageSize, status });
  const items = [...first.items];
  const totalPages = Math.ceil(first.totalItems / pageSize);
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await claims.list({ page, pageSize, status });
    items.push(...next.items);
  }
  return items;
}

async function collectOpenTasks(tasks: ClaimTaskRepository) {
  const pageSize = 100;
  const first = await tasks.list({ page: 1, pageSize, status: 'OPEN' });
  const items = [...first.items];
  const totalPages = Math.ceil(first.totalItems / pageSize);
  for (let page = 2; page <= totalPages; page += 1) {
    const next = await tasks.list({ page, pageSize, status: 'OPEN' });
    items.push(...next.items);
  }
  return items;
}

function matchesSearch(claim: ClaimProps, search: string | undefined): boolean {
  if (!search) return true;
  return [claim.trackingCode, claim.policyReference, claim.vehicleReference]
    .some((value) => value.toLowerCase().includes(search));
}

function compareRecords(a: OperationalClaimRecord, b: OperationalClaimRecord, sort: ClaimsOperationalSort): number {
  let result = 0;
  switch (sort) {
    case 'createdAt:asc': result = a.claim.createdAt.getTime() - b.claim.createdAt.getTime(); break;
    case 'createdAt:desc': result = b.claim.createdAt.getTime() - a.claim.createdAt.getTime(); break;
    case 'occurredAt:asc': result = a.claim.occurredAt.getTime() - b.claim.occurredAt.getTime(); break;
    case 'occurredAt:desc': result = b.claim.occurredAt.getTime() - a.claim.occurredAt.getTime(); break;
    case 'trackingCode:asc': result = a.claim.trackingCode.localeCompare(b.claim.trackingCode); break;
    case 'trackingCode:desc': result = b.claim.trackingCode.localeCompare(a.claim.trackingCode); break;
  }
  return result || a.claim.id.localeCompare(b.claim.id);
}

function emptyStatusCounts(): Record<ClaimStatus, number> {
  return {
    RECEIVED: 0,
    UNDER_REVIEW: 0,
    OBSERVED: 0,
    APPROVED: 0,
    IN_REPAIR: 0,
    CLOSED: 0,
  };
}

export class ClaimsOperationalQueryApplication {
  constructor(private readonly deps: ClaimsOperationalQueryDependencies) {}

  private async stageForClaim(claimId: string): Promise<ClaimStageProjection | null> {
    const workItem = await this.deps.pipelines.findWorkItemForConsumer('CLAIM', claimId);
    if (!workItem) return null;
    const version = await this.deps.pipelines.findVersion(workItem.pipelineVersionId);
    const stage = version?.stages.find((entry) => entry.id === workItem.currentStageId) ?? null;
    if (!stage) return null;
    return {
      workItemId: workItem.id,
      workItemVersion: workItem.version,
      pipelineDefinitionId: workItem.pipelineDefinitionId,
      pipelineVersionId: workItem.pipelineVersionId,
      stageKey: stage.key,
      displayName: stage.displayName,
      sortOrder: stage.sortOrder,
    };
  }

  async listClaims(input: {
    page?: number;
    pageSize?: number;
    status?: string;
    stage?: string;
    search?: string;
    sort?: string;
  }, actor?: ActorContext) {
    requirePermission(actor, 'claims.backoffice.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid pagination parameters.');
    }
    let status: ClaimStatus | undefined;
    if (input.status !== undefined) {
      if (!isClaimStatus(input.status)) throw new ApplicationError('VALIDATION_ERROR', 'Invalid claim status.');
      status = input.status;
    }
    const stage = normalizeStage(input.stage);
    const search = normalizeSearch(input.search);
    const sort = input.sort ?? 'createdAt:desc';
    if (!isOperationalSort(sort)) {
      throw new ApplicationError('VALIDATION_ERROR', 'sort must use an approved claims operational sort value.');
    }

    const claims = await collectClaims(this.deps.claims, status);
    const records = await Promise.all(claims.map(async (claim) => ({ claim, stage: await this.stageForClaim(claim.id) })));
    const filtered = records
      .filter((record) => !stage || record.stage?.stageKey === stage)
      .filter((record) => matchesSearch(record.claim, search))
      .sort((a, b) => compareRecords(a, b, sort));
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      items: items.map(({ claim, stage: currentStage }) => ({
        claimId: claim.id,
        trackingCode: claim.trackingCode,
        status: claim.status,
        occurredAt: claim.occurredAt.toISOString(),
        policyReference: claim.policyReference,
        vehicleReference: claim.vehicleReference,
        operationalStage: currentStage ? {
          stageKey: currentStage.stageKey,
          displayName: currentStage.displayName,
          sortOrder: currentStage.sortOrder,
        } : null,
        operationalWorkItemVersion: currentStage?.workItemVersion ?? null,
        createdAt: claim.createdAt.toISOString(),
      })),
      page,
      pageSize,
      totalItems: filtered.length,
      totalPages: Math.ceil(filtered.length / pageSize),
    };
  }

  async getClaimsOperationalMetrics(input: { from: string; to: string }, actor?: ActorContext) {
    requirePermission(actor, 'claims.analytics.read');
    const from = new Date(input.from);
    const to = new Date(input.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new ApplicationError('VALIDATION_ERROR', 'Metrics require a valid [from,to) RFC 3339 window.');
    }

    const generatedAt = this.deps.clock.now();
    const claims = await collectClaims(this.deps.claims);
    const openTasks = await collectOpenTasks(this.deps.tasks);
    const stages = await Promise.all(claims.map(async (claim) => ({ claimId: claim.id, stage: await this.stageForClaim(claim.id) })));

    const byStatus = emptyStatusCounts();
    for (const claim of claims) byStatus[claim.status] += 1;

    const byStageMap = new Map<string, { stageKey: string; displayName: string; sortOrder: number; count: number }>();
    for (const entry of stages) {
      if (!entry.stage) continue;
      const current = byStageMap.get(entry.stage.stageKey);
      if (current) current.count += 1;
      else byStageMap.set(entry.stage.stageKey, {
        stageKey: entry.stage.stageKey,
        displayName: entry.stage.displayName,
        sortOrder: entry.stage.sortOrder,
        count: 1,
      });
    }

    const openEvidenceReviewClaimIds = new Set(
      openTasks.filter((task) => task.type === 'EVIDENCE_REVIEW').map((task) => task.claimId),
    );
    let evidencePendingReviewClaims = 0;
    for (const claimId of openEvidenceReviewClaimIds) {
      const detail = await this.deps.claims.getById(claimId);
      if (detail && detail.evidence.length > 0) evidencePendingReviewClaims += 1;
    }

    return {
      window: { from: from.toISOString(), to: to.toISOString(), semantics: '[from,to)' as const },
      generatedAt: generatedAt.toISOString(),
      openClaims: claims.filter((claim) => claim.status !== 'CLOSED').length,
      reportedInWindow: claims.filter((claim) => claim.createdAt >= from && claim.createdAt < to).length,
      claimsByStatus: byStatus,
      claimsByOperationalStage: [...byStageMap.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.stageKey.localeCompare(b.stageKey))
        .map(({ sortOrder: _sortOrder, ...metric }) => metric),
      evidencePendingReviewClaims,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter((task) => task.dueAt !== null && task.dueAt < generatedAt).length,
      closedClaims: byStatus.CLOSED,
    };
  }
}
