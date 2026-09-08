import type { ClaimTaskHistoryRecord, ClaimTaskRepository } from '@insurance/application/claim-tasks';
import {
  ClaimTaskStateConflictError,
  ClaimTaskVersionConflictError,
  type ClaimTaskCancellationReason,
  type ClaimTaskPriority,
  type ClaimTaskProps,
  type ClaimTaskStatus,
  type ClaimTaskType,
} from '@insurance/domain/claim-task';

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryClaimTaskStore implements ClaimTaskRepository {
  private readonly tasks = new Map<string, ClaimTaskProps>();
  private readonly sourceKeys = new Map<string, string>();
  private readonly history: ClaimTaskHistoryRecord[] = [];

  async createIfAbsent(task: ClaimTaskProps, history?: ClaimTaskHistoryRecord): Promise<ClaimTaskProps> {
    if (task.sourceKey) {
      const existingId = this.sourceKeys.get(task.sourceKey);
      if (existingId) return clone(this.tasks.get(existingId)!);
    }
    this.tasks.set(task.id, clone(task));
    if (task.sourceKey) this.sourceKeys.set(task.sourceKey, task.id);
    if (history) this.history.push(clone(history));
    return clone(task);
  }

  async list(input: {
    page: number;
    pageSize: number;
    status?: ClaimTaskStatus;
    type?: ClaimTaskType;
    claimId?: string;
    priority?: ClaimTaskPriority;
    assignedOperatorId?: string;
    overdueBefore?: Date;
  }) {
    const all = [...this.tasks.values()]
      .filter((task) => !input.status || task.status === input.status)
      .filter((task) => !input.type || task.type === input.type)
      .filter((task) => !input.claimId || task.claimId === input.claimId)
      .filter((task) => !input.priority || task.priority === input.priority)
      .filter((task) => !input.assignedOperatorId || task.assignedOperatorId === input.assignedOperatorId)
      .filter((task) => !input.overdueBefore || (task.status === 'OPEN' && task.dueAt !== null && task.dueAt < input.overdueBefore))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const start = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(start, start + input.pageSize)), totalItems: all.length };
  }

  async getById(taskId: string): Promise<ClaimTaskProps | null> {
    const task = this.tasks.get(taskId);
    return task ? clone(task) : null;
  }

  async listHistory(taskId: string): Promise<ClaimTaskHistoryRecord[]> {
    return clone(this.history.filter((entry) => entry.taskId === taskId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()));
  }

  async update(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    this.replaceByVersion(task, expectedVersion, history);
  }

  async complete(task: ClaimTaskProps, expectedStatus: ClaimTaskStatus, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    const current = this.tasks.get(task.id);
    if (!current) return;
    if (current.status !== expectedStatus) throw new ClaimTaskStateConflictError(expectedStatus, current.status);
    this.replaceByVersion(task, expectedVersion, history);
  }

  async cancel(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    this.replaceByVersion(task, expectedVersion, history);
  }

  private replaceByVersion(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): void {
    const current = this.tasks.get(task.id);
    if (!current) return;
    if (current.version !== expectedVersion) throw new ClaimTaskVersionConflictError(expectedVersion, current.version);
    this.tasks.set(task.id, clone(task));
    this.history.push(clone(history));
  }
}

function toDbInstant(value: Date): any {
  const temporal = (globalThis as any).Temporal;
  if (!temporal?.Instant) throw new Error('Temporal.Instant is required by the PostgreSQL runtime.');
  return temporal.Instant.from(value.toISOString());
}

function toAppDate(value: any): Date {
  if (value instanceof Date) return value;
  const serialized = typeof value === 'string' ? value : value?.toString?.();
  const parsed = new Date(serialized);
  if (Number.isNaN(parsed.getTime())) throw new Error('PostgreSQL returned an invalid timestamp value.');
  return parsed;
}

function taskRow(row: any): ClaimTaskProps {
  return {
    id: row.id,
    claimId: row.claimId,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority,
    queue: row.queue,
    assignedOperatorId: row.assignedOperatorId ?? null,
    dueAt: row.dueAt ? toAppDate(row.dueAt) : null,
    createdByType: row.createdByType,
    createdById: row.createdById ?? null,
    sourceKey: row.sourceKey ?? null,
    correlationId: row.correlationId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    completedById: row.completedById ?? null,
    cancelledAt: row.cancelledAt ? toAppDate(row.cancelledAt) : null,
    cancelledById: row.cancelledById ?? null,
    cancellationReason: (row.cancellationReason ?? null) as ClaimTaskCancellationReason | null,
  };
}

function historyRow(row: any): ClaimTaskHistoryRecord {
  return {
    id: row.id,
    taskId: row.taskId,
    eventType: row.eventType,
    fromStatus: row.fromStatus ?? null,
    toStatus: row.toStatus ?? null,
    previousAssignedOperatorId: row.previousAssignedOperatorId ?? null,
    newAssignedOperatorId: row.newAssignedOperatorId ?? null,
    previousPriority: row.previousPriority ?? null,
    newPriority: row.newPriority ?? null,
    previousDueAt: row.previousDueAt ? toAppDate(row.previousDueAt) : null,
    newDueAt: row.newDueAt ? toAppDate(row.newDueAt) : null,
    actorType: row.actorType,
    actorId: row.actorId ?? null,
    correlationId: row.correlationId ?? null,
    occurredAt: toAppDate(row.occurredAt),
    metadata: row.metadata ?? null,
  };
}

function taskMutationRow(task: ClaimTaskProps) {
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    queue: task.queue,
    assignedOperatorId: task.assignedOperatorId,
    dueAt: task.dueAt ? toDbInstant(task.dueAt) : null,
    version: task.version,
    updatedAt: toDbInstant(task.updatedAt),
    completedAt: task.completedAt ? toDbInstant(task.completedAt) : null,
    completedById: task.completedById,
    cancelledAt: task.cancelledAt ? toDbInstant(task.cancelledAt) : null,
    cancelledById: task.cancelledById,
    cancellationReason: task.cancellationReason,
  };
}

async function appendHistory(db: any, entry: ClaimTaskHistoryRecord): Promise<void> {
  await db.orm.public.ClaimTaskHistory.create({
    id: entry.id,
    taskId: entry.taskId,
    eventType: entry.eventType,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    previousAssignedOperatorId: entry.previousAssignedOperatorId,
    newAssignedOperatorId: entry.newAssignedOperatorId,
    previousPriority: entry.previousPriority,
    newPriority: entry.newPriority,
    previousDueAt: entry.previousDueAt ? toDbInstant(entry.previousDueAt) : null,
    newDueAt: entry.newDueAt ? toDbInstant(entry.newDueAt) : null,
    actorType: entry.actorType,
    actorId: entry.actorId,
    correlationId: entry.correlationId,
    occurredAt: toDbInstant(entry.occurredAt),
    metadata: entry.metadata,
  });
}

export class PrismaClaimTaskStore implements ClaimTaskRepository {
  constructor(private readonly db: any) {}

  async createIfAbsent(task: ClaimTaskProps, history?: ClaimTaskHistoryRecord): Promise<ClaimTaskProps> {
    if (task.sourceKey) {
      const existing = await this.db.orm.public.ClaimTask.first({ sourceKey: task.sourceKey });
      if (existing) return taskRow(existing);
    }
    try {
      return await this.db.transaction(async (txDb: any) => {
        const row = await txDb.orm.public.ClaimTask.create({
          id: task.id,
          claimId: task.claimId,
          type: task.type,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          queue: task.queue,
          assignedOperatorId: task.assignedOperatorId,
          dueAt: task.dueAt ? toDbInstant(task.dueAt) : null,
          createdByType: task.createdByType,
          createdById: task.createdById,
          sourceKey: task.sourceKey,
          correlationId: task.correlationId,
          version: task.version,
          createdAt: toDbInstant(task.createdAt),
          updatedAt: toDbInstant(task.updatedAt),
          completedAt: task.completedAt ? toDbInstant(task.completedAt) : null,
          completedById: task.completedById,
          cancelledAt: task.cancelledAt ? toDbInstant(task.cancelledAt) : null,
          cancelledById: task.cancelledById,
          cancellationReason: task.cancellationReason,
        });
        if (history) await appendHistory(txDb, history);
        return taskRow(row);
      });
    } catch (error) {
      if (task.sourceKey) {
        const existing = await this.db.orm.public.ClaimTask.first({ sourceKey: task.sourceKey });
        if (existing) return taskRow(existing);
      }
      throw error;
    }
  }

  async list(input: {
    page: number;
    pageSize: number;
    status?: ClaimTaskStatus;
    type?: ClaimTaskType;
    claimId?: string;
    priority?: ClaimTaskPriority;
    assignedOperatorId?: string;
    overdueBefore?: Date;
  }) {
    let query = this.db.orm.public.ClaimTask.orderBy((task: any) => task.createdAt.desc()).orderBy((task: any) => task.id.asc());
    const where: Record<string, unknown> = {};
    if (input.status) where.status = input.status;
    if (input.type) where.type = input.type;
    if (input.claimId) where.claimId = input.claimId;
    if (input.priority) where.priority = input.priority;
    if (input.assignedOperatorId) where.assignedOperatorId = input.assignedOperatorId;
    if (Object.keys(where).length) query = query.where(where);
    let rows = await query.all();
    if (input.overdueBefore) {
      rows = rows.filter((row: any) => row.status === 'OPEN' && row.dueAt && toAppDate(row.dueAt) < input.overdueBefore!);
    }
    const start = (input.page - 1) * input.pageSize;
    return { items: rows.slice(start, start + input.pageSize).map(taskRow), totalItems: rows.length };
  }

  async getById(taskId: string): Promise<ClaimTaskProps | null> {
    const row = await this.db.orm.public.ClaimTask.first({ id: taskId });
    return row ? taskRow(row) : null;
  }

  async listHistory(taskId: string): Promise<ClaimTaskHistoryRecord[]> {
    const rows = await this.db.orm.public.ClaimTaskHistory.where({ taskId }).orderBy((entry: any) => entry.occurredAt.asc()).all();
    return rows.map(historyRow);
  }

  async update(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    await this.persistMutation(task, expectedVersion, history);
  }

  async complete(task: ClaimTaskProps, expectedStatus: ClaimTaskStatus, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      const updatedCount = await txDb.orm.public.ClaimTask
        .where({ id: task.id, status: expectedStatus, version: expectedVersion })
        .updateAndCount(taskMutationRow(task));
      if (updatedCount !== 1) {
        const current = await txDb.orm.public.ClaimTask.first({ id: task.id });
        if (current && current.status !== expectedStatus) throw new ClaimTaskStateConflictError(expectedStatus, current.status);
        throw new ClaimTaskVersionConflictError(expectedVersion, Number(current?.version ?? expectedVersion));
      }
      await appendHistory(txDb, history);
    });
  }

  async cancel(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    await this.persistMutation(task, expectedVersion, history);
  }

  private async persistMutation(task: ClaimTaskProps, expectedVersion: number, history: ClaimTaskHistoryRecord): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      const updatedCount = await txDb.orm.public.ClaimTask
        .where({ id: task.id, version: expectedVersion })
        .updateAndCount(taskMutationRow(task));
      if (updatedCount !== 1) {
        const current = await txDb.orm.public.ClaimTask.first({ id: task.id });
        throw new ClaimTaskVersionConflictError(expectedVersion, Number(current?.version ?? expectedVersion));
      }
      await appendHistory(txDb, history);
    });
  }
}
