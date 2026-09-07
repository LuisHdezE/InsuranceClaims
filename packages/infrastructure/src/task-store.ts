import type { ClaimTaskRepository } from '@insurance/application/claim-tasks';
import {
  ClaimTaskStateConflictError,
  type ClaimTaskProps,
  type ClaimTaskStatus,
  type ClaimTaskType,
} from '@insurance/domain/claim-task';

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryClaimTaskStore implements ClaimTaskRepository {
  private readonly tasks = new Map<string, ClaimTaskProps>();
  private readonly sourceKeys = new Map<string, string>();

  async createIfAbsent(task: ClaimTaskProps): Promise<ClaimTaskProps> {
    if (task.sourceKey) {
      const existingId = this.sourceKeys.get(task.sourceKey);
      if (existingId) return clone(this.tasks.get(existingId)!);
    }
    this.tasks.set(task.id, clone(task));
    if (task.sourceKey) this.sourceKeys.set(task.sourceKey, task.id);
    return clone(task);
  }

  async list(input: { page: number; pageSize: number; status?: ClaimTaskStatus; type?: ClaimTaskType; claimId?: string }) {
    const all = [...this.tasks.values()]
      .filter((task) => !input.status || task.status === input.status)
      .filter((task) => !input.type || task.type === input.type)
      .filter((task) => !input.claimId || task.claimId === input.claimId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(start, start + input.pageSize)), totalItems: all.length };
  }

  async getById(taskId: string): Promise<ClaimTaskProps | null> {
    const task = this.tasks.get(taskId);
    return task ? clone(task) : null;
  }

  async complete(task: ClaimTaskProps, expectedStatus: ClaimTaskStatus): Promise<void> {
    const current = this.tasks.get(task.id);
    if (!current) return;
    if (current.status !== expectedStatus) {
      throw new ClaimTaskStateConflictError(expectedStatus, current.status);
    }
    this.tasks.set(task.id, clone(task));
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
    status: row.status,
    priority: row.priority,
    queue: row.queue,
    assignedOperatorId: row.assignedOperatorId ?? null,
    dueAt: row.dueAt ? toAppDate(row.dueAt) : null,
    createdByType: row.createdByType,
    createdById: row.createdById ?? null,
    sourceKey: row.sourceKey ?? null,
    correlationId: row.correlationId ?? null,
    createdAt: toAppDate(row.createdAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    completedById: row.completedById ?? null,
  };
}

export class PrismaClaimTaskStore implements ClaimTaskRepository {
  constructor(private readonly db: any) {}

  async createIfAbsent(task: ClaimTaskProps): Promise<ClaimTaskProps> {
    if (task.sourceKey) {
      const existing = await this.db.orm.public.ClaimTask.first({ sourceKey: task.sourceKey });
      if (existing) return taskRow(existing);
    }
    try {
      const row = await this.db.orm.public.ClaimTask.create({
        id: task.id,
        claimId: task.claimId,
        type: task.type,
        title: task.title,
        status: task.status,
        priority: task.priority,
        queue: task.queue,
        assignedOperatorId: task.assignedOperatorId,
        dueAt: task.dueAt ? toDbInstant(task.dueAt) : null,
        createdByType: task.createdByType,
        createdById: task.createdById,
        sourceKey: task.sourceKey,
        correlationId: task.correlationId,
        createdAt: toDbInstant(task.createdAt),
        completedAt: task.completedAt ? toDbInstant(task.completedAt) : null,
        completedById: task.completedById,
      });
      return taskRow(row);
    } catch (error) {
      if (task.sourceKey) {
        const existing = await this.db.orm.public.ClaimTask.first({ sourceKey: task.sourceKey });
        if (existing) return taskRow(existing);
      }
      throw error;
    }
  }

  async list(input: { page: number; pageSize: number; status?: ClaimTaskStatus; type?: ClaimTaskType; claimId?: string }) {
    let query = this.db.orm.public.ClaimTask.orderBy((task: any) => task.createdAt.desc());
    const where: Record<string, string> = {};
    if (input.status) where.status = input.status;
    if (input.type) where.type = input.type;
    if (input.claimId) where.claimId = input.claimId;
    if (Object.keys(where).length) query = query.where(where);
    const rows = await query.all();
    const start = (input.page - 1) * input.pageSize;
    return { items: rows.slice(start, start + input.pageSize).map(taskRow), totalItems: rows.length };
  }

  async getById(taskId: string): Promise<ClaimTaskProps | null> {
    const row = await this.db.orm.public.ClaimTask.first({ id: taskId });
    return row ? taskRow(row) : null;
  }

  async complete(task: ClaimTaskProps, expectedStatus: ClaimTaskStatus): Promise<void> {
    const updatedCount = await this.db.orm.public.ClaimTask
      .where({ id: task.id, status: expectedStatus })
      .updateAndCount({
        status: task.status,
        completedAt: task.completedAt ? toDbInstant(task.completedAt) : null,
        completedById: task.completedById,
      });
    if (updatedCount !== 1) {
      const current = await this.db.orm.public.ClaimTask.first({ id: task.id });
      const actualStatus = (current?.status ?? expectedStatus) as ClaimTaskStatus;
      throw new ClaimTaskStateConflictError(expectedStatus, actualStatus);
    }
  }
}
