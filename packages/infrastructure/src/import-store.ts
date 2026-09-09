import type {
  GovernedImportRepository,
  ImportAuditRecord,
  ImportCommitRowResult,
  ImportMutationResult,
} from '@insurance/application/governed-imports';
import type { IdempotencyRecord } from '@insurance/application';
import type { AsyncJobProps } from '@insurance/domain';
import type { ImportJobProps, ImportRowProps, SyntheticImportReferenceRecord } from '@insurance/domain/import-job';
import { MemoryAsyncOperationsStore } from './async-store.js';

function clone<T>(value: T): T { return structuredClone(value); }

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

function stringMap(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  return Object.fromEntries(entries);
}

function nullableStringMap(value: unknown): Record<string, string | null> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result: Record<string, string | null> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string' || item === null) result[key] = item;
  }
  return result;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function jobRow(row: any): ImportJobProps {
  return {
    id: row.id,
    importType: row.importType,
    sourceStorageKey: row.sourceStorageKey,
    sourceMediaType: row.sourceMediaType,
    sourceSizeBytes: Number(row.sourceSizeBytes),
    sourceDisplayFilename: row.sourceDisplayFilename ?? null,
    status: row.status,
    mappingConfiguration: stringMap(row.mappingConfiguration),
    totalRows: Number(row.totalRows),
    validRows: Number(row.validRows),
    invalidRows: Number(row.invalidRows),
    unchangedRows: Number(row.unchangedRows),
    committedRows: Number(row.committedRows),
    rejectedRows: Number(row.rejectedRows),
    failedRows: Number(row.failedRows),
    createdById: row.createdById,
    commitRequestedById: row.commitRequestedById ?? null,
    correlationId: row.correlationId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    startedAt: row.startedAt ? toAppDate(row.startedAt) : null,
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
  };
}

function importRow(row: any): ImportRowProps {
  return {
    id: row.id,
    importJobId: row.importJobId,
    rowNumber: Number(row.rowNumber),
    stagedInput: stringMap(row.stagedInput) ?? {},
    normalizedInput: nullableStringMap(row.normalizedInput),
    validationStatus: row.validationStatus,
    validationErrors: stringArray(row.validationErrors),
    dryRunOutcome: row.dryRunOutcome,
    commitOutcome: row.commitOutcome,
    targetType: row.targetType ?? null,
    targetId: row.targetId ?? null,
    rowFingerprint: row.rowFingerprint,
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function targetRow(row: any): SyntheticImportReferenceRecord {
  return {
    id: row.id,
    externalReference: row.externalReference,
    label: row.label,
    classification: row.classification ?? null,
    sourceImportJobId: row.sourceImportJobId,
    sourceImportRowId: row.sourceImportRowId,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function idempotencyRow(row: any): IdempotencyRecord {
  return {
    scope: row.scope,
    keyHash: row.idempotencyKeyHash,
    requestFingerprint: row.requestFingerprint,
    status: row.status,
    claimId: row.claimId ?? null,
    responseReference: row.responseReference ?? null,
    createdAt: toAppDate(row.createdAt),
    expiresAt: toAppDate(row.expiresAt),
  };
}

async function appendAudit(db: any, audit: ImportAuditRecord): Promise<void> {
  await db.orm.public.AuditEvent.create({
    id: audit.id,
    eventCode: audit.eventCode,
    occurredAt: toDbInstant(audit.occurredAt),
    actorType: audit.actorType,
    actorId: audit.actorId,
    targetType: audit.targetType,
    targetId: audit.targetId,
    outcome: audit.outcome,
    requestId: audit.requestId,
    metadata: audit.metadata,
    createdAt: toDbInstant(audit.occurredAt),
  });
}

export class MemoryGovernedImportStore implements GovernedImportRepository {
  private readonly jobs = new Map<string, ImportJobProps>();
  private readonly rows = new Map<string, ImportRowProps[]>();
  private readonly targets = new Map<string, SyntheticImportReferenceRecord>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  readonly audits: ImportAuditRecord[] = [];

  constructor(private readonly asyncStore: MemoryAsyncOperationsStore) {}

  snapshotJob(importJobId: string): ImportJobProps | null { const value = this.jobs.get(importJobId); return value ? clone(value) : null; }
  snapshotTargets(): SyntheticImportReferenceRecord[] { return [...this.targets.values()].map(clone); }
  snapshotAudits(): ImportAuditRecord[] { return this.audits.map(clone); }

  async listJobs(input: { page: number; pageSize: number }) {
    const all = [...this.jobs.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize).map(clone), totalItems: all.length };
  }
  async getJob(importJobId: string) { return this.snapshotJob(importJobId); }
  async listRows(input: { importJobId: string; page: number; pageSize: number }) {
    if (!this.jobs.has(input.importJobId)) return null;
    const all = (this.rows.get(input.importJobId) ?? []).slice().sort((a, b) => a.rowNumber - b.rowNumber || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize).map(clone), totalItems: all.length };
  }

  private idemKey(scope: string, keyHash: string): string { return `${scope}\u0000${keyHash}`; }
  async getIdempotency(scope: string, keyHash: string) { const value = this.idempotency.get(this.idemKey(scope, keyHash)); return value ? clone(value) : null; }
  async reserveIdempotency(record: IdempotencyRecord): Promise<boolean> {
    const key = this.idemKey(record.scope, record.keyHash);
    if (this.idempotency.has(key)) return false;
    this.idempotency.set(key, clone(record));
    return true;
  }
  async markIdempotencyRetryable(scope: string, keyHash: string): Promise<void> {
    const key = this.idemKey(scope, keyHash);
    const value = this.idempotency.get(key);
    if (value) this.idempotency.set(key, clone({ ...value, status: 'FAILED_RETRYABLE' as const }));
  }

  async createJob(input: { job: ImportJobProps; audit: ImportAuditRecord; idempotencyScope: string; idempotencyKeyHash: string; responseReference: unknown }): Promise<void> {
    if (this.jobs.has(input.job.id)) throw new Error('Import job already exists.');
    this.jobs.set(input.job.id, clone(input.job));
    this.rows.set(input.job.id, []);
    this.audits.push(clone(input.audit));
    const key = this.idemKey(input.idempotencyScope, input.idempotencyKeyHash);
    const idem = this.idempotency.get(key);
    if (!idem) throw new Error('Import idempotency reservation disappeared.');
    this.idempotency.set(key, clone({ ...idem, status: 'COMPLETED' as const, responseReference: input.responseReference }));
  }

  private mutation(importJobId: string, expectedVersion: number, expectedStatus: ImportJobProps['status'], patch: Partial<ImportJobProps>): ImportMutationResult {
    const job = this.jobs.get(importJobId);
    if (!job) return { outcome: 'NOT_FOUND' };
    if (job.version !== expectedVersion) return { outcome: 'STALE' };
    if (job.status !== expectedStatus) return { outcome: 'STATE_CONFLICT' };
    const updated = { ...job, ...patch, version: job.version + 1 } as ImportJobProps;
    this.jobs.set(importJobId, clone(updated));
    return { outcome: 'UPDATED', job: clone(updated) };
  }

  async savePreview(input: { importJobId: string; expectedVersion: number; rows: readonly ImportRowProps[]; at: Date }): Promise<ImportMutationResult> {
    const result = this.mutation(input.importJobId, input.expectedVersion, 'UPLOADED', { status: 'PREVIEWED', totalRows: input.rows.length, updatedAt: input.at });
    if (result.outcome === 'UPDATED') this.rows.set(input.importJobId, input.rows.map(clone));
    return result;
  }
  async saveMapping(input: { importJobId: string; expectedVersion: number; mapping: Readonly<Record<string, string>>; at: Date }): Promise<ImportMutationResult> {
    return this.mutation(input.importJobId, input.expectedVersion, 'PREVIEWED', { status: 'MAPPED', mappingConfiguration: { ...input.mapping }, updatedAt: input.at });
  }
  async saveValidation(input: { importJobId: string; expectedVersion: number; rows: readonly ImportRowProps[]; validRows: number; invalidRows: number; at: Date }): Promise<ImportMutationResult> {
    const result = this.mutation(input.importJobId, input.expectedVersion, 'MAPPED', { status: 'VALIDATED', validRows: input.validRows, invalidRows: input.invalidRows, updatedAt: input.at });
    if (result.outcome === 'UPDATED') this.rows.set(input.importJobId, input.rows.map(clone));
    return result;
  }
  async findSyntheticTarget(externalReference: string) { const value = this.targets.get(externalReference); return value ? clone(value) : null; }
  async saveDryRun(input: { importJobId: string; expectedVersion: number; rows: readonly ImportRowProps[]; unchangedRows: number; audit: ImportAuditRecord; at: Date }): Promise<ImportMutationResult> {
    const result = this.mutation(input.importJobId, input.expectedVersion, 'VALIDATED', { status: 'DRY_RUN_READY', unchangedRows: input.unchangedRows, updatedAt: input.at });
    if (result.outcome === 'UPDATED') {
      this.rows.set(input.importJobId, input.rows.map(clone));
      this.audits.push(clone(input.audit));
    }
    return result;
  }

  async requestCommit(input: { importJobId: string; expectedVersion: number; asyncJobId: string; requestedById: string; correlationId: string | null; at: Date; audit: ImportAuditRecord; idempotencyScope: string; idempotencyKeyHash: string; responseReference: unknown }): Promise<ImportMutationResult> {
    const result = this.mutation(input.importJobId, input.expectedVersion, 'DRY_RUN_READY', {
      status: 'COMMITTING', commitRequestedById: input.requestedById, correlationId: input.correlationId,
      startedAt: input.at, updatedAt: input.at,
    });
    if (result.outcome !== 'UPDATED') return result;
    const asyncJob: AsyncJobProps = {
      id: input.asyncJobId, jobType: 'COMMIT_IMPORT_JOB', idempotencyIdentity: `import:${input.importJobId}`,
      payload: { importJobId: input.importJobId }, status: 'PENDING', attemptCount: 0, maxAttempts: 3,
      availableAt: input.at, leaseOwner: null, leaseExpiresAt: null, correlationId: input.correlationId,
      lastFailureCategory: null, createdAt: input.at, updatedAt: input.at, completedAt: null, version: 1,
    };
    this.asyncStore.seedJob(asyncJob);
    this.audits.push(clone(input.audit));
    const key = this.idemKey(input.idempotencyScope, input.idempotencyKeyHash);
    const idem = this.idempotency.get(key);
    if (!idem) throw new Error('Import commit idempotency reservation disappeared.');
    this.idempotency.set(key, clone({ ...idem, status: 'COMPLETED' as const, responseReference: input.responseReference }));
    return result;
  }

  async commitRow(input: { importJobId: string; rowId: string; expectedDryRunOutcome: ImportRowProps['dryRunOutcome']; normalizedInput: Readonly<Record<string, string | null>> | null; targetId: string | null; at: Date; generatedTargetId: string }): Promise<ImportCommitRowResult> {
    const job = this.jobs.get(input.importJobId);
    const rows = this.rows.get(input.importJobId);
    const row = rows?.find((item) => item.id === input.rowId);
    if (!job || job.status !== 'COMMITTING' || !rows || !row) return { outcome: 'FAILED', targetId: null, failureCategory: 'IMPORT_ROW_STATE_CONFLICT' };
    if (row.commitOutcome !== 'PENDING') {
      if (row.commitOutcome === 'CREATED' || row.commitOutcome === 'UPDATED' || row.commitOutcome === 'UNCHANGED') return { outcome: row.commitOutcome, targetId: row.targetId! };
      if (row.commitOutcome === 'REJECTED') return { outcome: 'REJECTED', targetId: null };
      return { outcome: 'FAILED', targetId: row.targetId, failureCategory: 'IMPORT_ROW_PREVIOUSLY_FAILED' };
    }
    if (row.dryRunOutcome !== input.expectedDryRunOutcome || !input.normalizedInput) {
      row.commitOutcome = row.dryRunOutcome === 'REJECTED' ? 'REJECTED' : 'FAILED';
      row.updatedAt = input.at;
      return row.commitOutcome === 'REJECTED' ? { outcome: 'REJECTED', targetId: null } : { outcome: 'FAILED', targetId: row.targetId, failureCategory: 'IMPORT_ROW_PAYLOAD_INVALID' };
    }
    if (row.dryRunOutcome === 'REJECTED') {
      row.commitOutcome = 'REJECTED'; row.updatedAt = input.at; return { outcome: 'REJECTED', targetId: null };
    }
    const externalReference = input.normalizedInput.externalReference;
    const label = input.normalizedInput.label;
    if (!externalReference || !label) {
      row.commitOutcome = 'FAILED'; row.updatedAt = input.at; return { outcome: 'FAILED', targetId: row.targetId, failureCategory: 'IMPORT_ROW_PAYLOAD_INVALID' };
    }
    const existing = this.targets.get(externalReference);
    if (row.dryRunOutcome === 'CREATE') {
      if (existing) { row.commitOutcome = 'FAILED'; row.updatedAt = input.at; return { outcome: 'FAILED', targetId: existing.id, failureCategory: 'IMPORT_TARGET_CONCURRENCY_CONFLICT' }; }
      const target: SyntheticImportReferenceRecord = {
        id: input.generatedTargetId, externalReference, label, classification: input.normalizedInput.classification ?? null,
        sourceImportJobId: input.importJobId, sourceImportRowId: row.id, version: 1, createdAt: input.at, updatedAt: input.at,
      };
      this.targets.set(externalReference, clone(target));
      Object.assign(row, { commitOutcome: 'CREATED', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: target.id, updatedAt: input.at });
      return { outcome: 'CREATED', targetId: target.id };
    }
    if (!existing || (input.targetId && existing.id !== input.targetId)) {
      row.commitOutcome = 'FAILED'; row.updatedAt = input.at; return { outcome: 'FAILED', targetId: existing?.id ?? null, failureCategory: 'IMPORT_TARGET_CONCURRENCY_CONFLICT' };
    }
    const same = existing.label === label && existing.classification === (input.normalizedInput.classification ?? null);
    if (row.dryRunOutcome === 'UNCHANGED' && same) {
      Object.assign(row, { commitOutcome: 'UNCHANGED', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: existing.id, updatedAt: input.at });
      return { outcome: 'UNCHANGED', targetId: existing.id };
    }
    const updatedTarget = { ...existing, label, classification: input.normalizedInput.classification ?? null, sourceImportJobId: input.importJobId, sourceImportRowId: row.id, updatedAt: input.at, version: existing.version + 1 };
    this.targets.set(externalReference, clone(updatedTarget));
    Object.assign(row, { commitOutcome: 'UPDATED', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: existing.id, updatedAt: input.at });
    return { outcome: 'UPDATED', targetId: existing.id };
  }

  async finalizeCommit(input: { importJobId: string; terminalStatus: 'COMPLETED' | 'COMPLETED_WITH_ERRORS'; committedRows: number; rejectedRows: number; failedRows: number; at: Date; audit: ImportAuditRecord }): Promise<ImportMutationResult> {
    const job = this.jobs.get(input.importJobId);
    if (!job) return { outcome: 'NOT_FOUND' };
    if (job.status !== 'COMMITTING') return { outcome: 'STATE_CONFLICT' };
    const updated: ImportJobProps = { ...job, status: input.terminalStatus, committedRows: input.committedRows, rejectedRows: input.rejectedRows, failedRows: input.failedRows, completedAt: input.at, updatedAt: input.at, version: job.version + 1 };
    this.jobs.set(job.id, clone(updated));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', job: clone(updated) };
  }
  async failCommit(input: { importJobId: string; at: Date; audit: ImportAuditRecord }): Promise<ImportMutationResult> {
    const job = this.jobs.get(input.importJobId);
    if (!job) return { outcome: 'NOT_FOUND' };
    if (job.status !== 'COMMITTING') return { outcome: 'STATE_CONFLICT' };
    const updated: ImportJobProps = { ...job, status: 'FAILED', failedRows: Math.max(job.failedRows, 1), completedAt: input.at, updatedAt: input.at, version: job.version + 1 };
    this.jobs.set(job.id, clone(updated));
    this.audits.push(clone(input.audit));
    return { outcome: 'UPDATED', job: clone(updated) };
  }
}

export class PrismaGovernedImportStore implements GovernedImportRepository {
  constructor(private readonly db: any) {}

  async listJobs(input: { page: number; pageSize: number }) {
    const rows = (await this.db.orm.public.ImportJob.all()).map(jobRow)
      .sort((a: ImportJobProps, b: ImportJobProps) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: rows.slice(offset, offset + input.pageSize), totalItems: rows.length };
  }
  async getJob(importJobId: string) { const row = await this.db.orm.public.ImportJob.first({ id: importJobId }); return row ? jobRow(row) : null; }
  async listRows(input: { importJobId: string; page: number; pageSize: number }) {
    const job = await this.db.orm.public.ImportJob.first({ id: input.importJobId });
    if (!job) return null;
    const rows = (await this.db.orm.public.ImportRow.where({ importJobId: input.importJobId }).all()).map(importRow)
      .sort((a: ImportRowProps, b: ImportRowProps) => a.rowNumber - b.rowNumber || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: rows.slice(offset, offset + input.pageSize), totalItems: rows.length };
  }
  async getIdempotency(scope: string, keyHash: string) {
    const row = await this.db.orm.public.IdempotencyRecord.first({ scope, idempotencyKeyHash: keyHash });
    return row ? idempotencyRow(row) : null;
  }
  async reserveIdempotency(record: IdempotencyRecord): Promise<boolean> {
    try {
      await this.db.orm.public.IdempotencyRecord.create({
        scope: record.scope, idempotencyKeyHash: record.keyHash, requestFingerprint: record.requestFingerprint,
        status: record.status, claimId: record.claimId, responseReference: record.responseReference,
        createdAt: toDbInstant(record.createdAt), expiresAt: toDbInstant(record.expiresAt),
      });
      return true;
    } catch { return false; }
  }
  async markIdempotencyRetryable(scope: string, keyHash: string): Promise<void> {
    await this.db.orm.public.IdempotencyRecord.where({ scope, idempotencyKeyHash: keyHash }).update({ status: 'FAILED_RETRYABLE' });
  }

  async createJob(input: { job: ImportJobProps; audit: ImportAuditRecord; idempotencyScope: string; idempotencyKeyHash: string; responseReference: unknown }): Promise<void> {
    await this.db.transaction(async (txDb: any) => {
      const job = input.job;
      await txDb.orm.public.ImportJob.create({
        id: job.id, importType: job.importType, sourceStorageKey: job.sourceStorageKey, sourceMediaType: job.sourceMediaType,
        sourceSizeBytes: BigInt(job.sourceSizeBytes), sourceDisplayFilename: job.sourceDisplayFilename, status: job.status,
        mappingConfiguration: job.mappingConfiguration, totalRows: job.totalRows, validRows: job.validRows, invalidRows: job.invalidRows,
        unchangedRows: job.unchangedRows, committedRows: job.committedRows, rejectedRows: job.rejectedRows, failedRows: job.failedRows,
        createdById: job.createdById, commitRequestedById: job.commitRequestedById, correlationId: job.correlationId, version: job.version,
        createdAt: toDbInstant(job.createdAt), updatedAt: toDbInstant(job.updatedAt), startedAt: null, completedAt: null,
      });
      await appendAudit(txDb, input.audit);
      const completed = await txDb.orm.public.IdempotencyRecord.where({ scope: input.idempotencyScope, idempotencyKeyHash: input.idempotencyKeyHash })
        .updateAndCount({ status: 'COMPLETED', responseReference: input.responseReference });
      if (completed !== 1) throw new Error('Import creation idempotency reservation disappeared.');
    });
  }

  private async currentForMutation(db: any, importJobId: string, expectedVersion: number, expectedStatus: ImportJobProps['status']): Promise<ImportMutationResult | ImportJobProps> {
    const row = await db.orm.public.ImportJob.first({ id: importJobId });
    if (!row) return { outcome: 'NOT_FOUND' };
    const job = jobRow(row);
    if (job.version !== expectedVersion) return { outcome: 'STALE' };
    if (job.status !== expectedStatus) return { outcome: 'STATE_CONFLICT' };
    return job;
  }

  async savePreview(input: { importJobId: string; expectedVersion: number; rows: readonly ImportRowProps[]; at: Date }): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const current = await this.currentForMutation(txDb, input.importJobId, input.expectedVersion, 'UPLOADED');
      if ('outcome' in current) return current;
      if (input.rows.length) await txDb.orm.public.ImportRow.createAll(input.rows.map((row) => ({
        id: row.id, importJobId: row.importJobId, rowNumber: row.rowNumber, stagedInput: row.stagedInput, normalizedInput: row.normalizedInput,
        validationStatus: row.validationStatus, validationErrors: row.validationErrors, dryRunOutcome: row.dryRunOutcome, commitOutcome: row.commitOutcome,
        targetType: row.targetType, targetId: row.targetId, rowFingerprint: row.rowFingerprint,
        createdAt: toDbInstant(row.createdAt), updatedAt: toDbInstant(row.updatedAt),
      })));
      const count = await txDb.orm.public.ImportJob.where({ id: input.importJobId, version: input.expectedVersion, status: 'UPLOADED' }).updateAndCount({
        status: 'PREVIEWED', totalRows: input.rows.length, updatedAt: toDbInstant(input.at), version: input.expectedVersion + 1,
      });
      if (count !== 1) return { outcome: 'STALE' } as const;
      const updated = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }

  async saveMapping(input: { importJobId: string; expectedVersion: number; mapping: Readonly<Record<string, string>>; at: Date }): Promise<ImportMutationResult> {
    return this.simpleJobAdvance(input.importJobId, input.expectedVersion, 'PREVIEWED', 'MAPPED', { mappingConfiguration: input.mapping }, input.at);
  }

  async saveValidation(input: { importJobId: string; expectedVersion: number; rows: readonly ImportRowProps[]; validRows: number; invalidRows: number; at: Date }): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const current = await this.currentForMutation(txDb, input.importJobId, input.expectedVersion, 'MAPPED');
      if ('outcome' in current) return current;
      for (const row of input.rows) {
        await txDb.orm.public.ImportRow.where({ id: row.id, importJobId: input.importJobId }).update({
          normalizedInput: row.normalizedInput, validationStatus: row.validationStatus, validationErrors: row.validationErrors,
          dryRunOutcome: 'PENDING', commitOutcome: 'PENDING', targetType: null, targetId: null, updatedAt: toDbInstant(input.at),
        });
      }
      const count = await txDb.orm.public.ImportJob.where({ id: input.importJobId, version: input.expectedVersion, status: 'MAPPED' }).updateAndCount({
        status: 'VALIDATED', validRows: input.validRows, invalidRows: input.invalidRows, updatedAt: toDbInstant(input.at), version: input.expectedVersion + 1,
      });
      if (count !== 1) return { outcome: 'STALE' } as const;
      const updated = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }

  async findSyntheticTarget(externalReference: string) {
    const row = await this.db.orm.public.SyntheticImportReference.first({ externalReference });
    return row ? targetRow(row) : null;
  }

  async saveDryRun(input: { importJobId: string; expectedVersion: number; rows: readonly ImportRowProps[]; unchangedRows: number; audit: ImportAuditRecord; at: Date }): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const current = await this.currentForMutation(txDb, input.importJobId, input.expectedVersion, 'VALIDATED');
      if ('outcome' in current) return current;
      for (const row of input.rows) {
        await txDb.orm.public.ImportRow.where({ id: row.id, importJobId: input.importJobId }).update({
          dryRunOutcome: row.dryRunOutcome, targetType: row.targetType, targetId: row.targetId, updatedAt: toDbInstant(input.at),
        });
      }
      await appendAudit(txDb, input.audit);
      const count = await txDb.orm.public.ImportJob.where({ id: input.importJobId, version: input.expectedVersion, status: 'VALIDATED' }).updateAndCount({
        status: 'DRY_RUN_READY', unchangedRows: input.unchangedRows, updatedAt: toDbInstant(input.at), version: input.expectedVersion + 1,
      });
      if (count !== 1) return { outcome: 'STALE' } as const;
      const updated = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }

  async requestCommit(input: { importJobId: string; expectedVersion: number; asyncJobId: string; requestedById: string; correlationId: string | null; at: Date; audit: ImportAuditRecord; idempotencyScope: string; idempotencyKeyHash: string; responseReference: unknown }): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const current = await this.currentForMutation(txDb, input.importJobId, input.expectedVersion, 'DRY_RUN_READY');
      if ('outcome' in current) return current;
      const updatedCount = await txDb.orm.public.ImportJob.where({ id: input.importJobId, version: input.expectedVersion, status: 'DRY_RUN_READY' }).updateAndCount({
        status: 'COMMITTING', commitRequestedById: input.requestedById, correlationId: input.correlationId,
        startedAt: toDbInstant(input.at), updatedAt: toDbInstant(input.at), version: input.expectedVersion + 1,
      });
      if (updatedCount !== 1) return { outcome: 'STALE' } as const;
      await txDb.orm.public.AsyncJob.create({
        id: input.asyncJobId, jobType: 'COMMIT_IMPORT_JOB', idempotencyIdentity: `import:${input.importJobId}`,
        payload: { importJobId: input.importJobId }, status: 'PENDING', attemptCount: 0, maxAttempts: 3,
        availableAt: toDbInstant(input.at), leaseOwner: null, leaseExpiresAt: null, correlationId: input.correlationId,
        lastFailureCategory: null, createdAt: toDbInstant(input.at), updatedAt: toDbInstant(input.at), completedAt: null, version: 1,
      });
      await appendAudit(txDb, input.audit);
      const idem = await txDb.orm.public.IdempotencyRecord.where({ scope: input.idempotencyScope, idempotencyKeyHash: input.idempotencyKeyHash })
        .updateAndCount({ status: 'COMPLETED', responseReference: input.responseReference });
      if (idem !== 1) throw new Error('Import commit idempotency reservation disappeared.');
      const updated = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }

  async commitRow(input: { importJobId: string; rowId: string; expectedDryRunOutcome: ImportRowProps['dryRunOutcome']; normalizedInput: Readonly<Record<string, string | null>> | null; targetId: string | null; at: Date; generatedTargetId: string }): Promise<ImportCommitRowResult> {
    return this.db.transaction(async (txDb: any) => {
      const jobRaw = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      if (!jobRaw || jobRaw.status !== 'COMMITTING') return { outcome: 'FAILED', targetId: null, failureCategory: 'IMPORT_ROW_STATE_CONFLICT' } as const;
      const rowRaw = await txDb.orm.public.ImportRow.first({ id: input.rowId, importJobId: input.importJobId });
      if (!rowRaw) return { outcome: 'FAILED', targetId: null, failureCategory: 'IMPORT_ROW_STATE_CONFLICT' } as const;
      const row = importRow(rowRaw);
      if (row.commitOutcome !== 'PENDING') {
        if (row.commitOutcome === 'CREATED' || row.commitOutcome === 'UPDATED' || row.commitOutcome === 'UNCHANGED') return { outcome: row.commitOutcome, targetId: row.targetId! } as const;
        if (row.commitOutcome === 'REJECTED') return { outcome: 'REJECTED', targetId: null } as const;
        return { outcome: 'FAILED', targetId: row.targetId, failureCategory: 'IMPORT_ROW_PREVIOUSLY_FAILED' } as const;
      }
      if (row.dryRunOutcome !== input.expectedDryRunOutcome || !input.normalizedInput) {
        const outcome = row.dryRunOutcome === 'REJECTED' ? 'REJECTED' : 'FAILED';
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: outcome, updatedAt: toDbInstant(input.at) });
        return outcome === 'REJECTED' ? { outcome: 'REJECTED', targetId: null } as const : { outcome: 'FAILED', targetId: row.targetId, failureCategory: 'IMPORT_ROW_PAYLOAD_INVALID' } as const;
      }
      if (row.dryRunOutcome === 'REJECTED') {
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'REJECTED', updatedAt: toDbInstant(input.at) });
        return { outcome: 'REJECTED', targetId: null } as const;
      }
      const externalReference = input.normalizedInput.externalReference;
      const label = input.normalizedInput.label;
      if (!externalReference || !label) {
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'FAILED', updatedAt: toDbInstant(input.at) });
        return { outcome: 'FAILED', targetId: row.targetId, failureCategory: 'IMPORT_ROW_PAYLOAD_INVALID' } as const;
      }
      const existingRaw = await txDb.orm.public.SyntheticImportReference.first({ externalReference });
      const existing = existingRaw ? targetRow(existingRaw) : null;
      if (row.dryRunOutcome === 'CREATE') {
        if (existing) {
          await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'FAILED', targetId: existing.id, updatedAt: toDbInstant(input.at) });
          return { outcome: 'FAILED', targetId: existing.id, failureCategory: 'IMPORT_TARGET_CONCURRENCY_CONFLICT' } as const;
        }
        await txDb.orm.public.SyntheticImportReference.create({
          id: input.generatedTargetId, externalReference, label, classification: input.normalizedInput.classification ?? null,
          sourceImportJobId: input.importJobId, sourceImportRowId: row.id, version: 1,
          createdAt: toDbInstant(input.at), updatedAt: toDbInstant(input.at),
        });
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'CREATED', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: input.generatedTargetId, updatedAt: toDbInstant(input.at) });
        return { outcome: 'CREATED', targetId: input.generatedTargetId } as const;
      }
      if (!existing || (input.targetId && existing.id !== input.targetId)) {
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'FAILED', targetId: existing?.id ?? null, updatedAt: toDbInstant(input.at) });
        return { outcome: 'FAILED', targetId: existing?.id ?? null, failureCategory: 'IMPORT_TARGET_CONCURRENCY_CONFLICT' } as const;
      }
      const classification = input.normalizedInput.classification ?? null;
      const same = existing.label === label && existing.classification === classification;
      if (row.dryRunOutcome === 'UNCHANGED' && same) {
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'UNCHANGED', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: existing.id, updatedAt: toDbInstant(input.at) });
        return { outcome: 'UNCHANGED', targetId: existing.id } as const;
      }
      const targetUpdateCount = await txDb.orm.public.SyntheticImportReference.where({ id: existing.id, version: existing.version }).updateAndCount({
        label, classification, sourceImportJobId: input.importJobId, sourceImportRowId: row.id,
        version: existing.version + 1, updatedAt: toDbInstant(input.at),
      });
      if (targetUpdateCount !== 1) {
        await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'FAILED', targetId: existing.id, updatedAt: toDbInstant(input.at) });
        return { outcome: 'FAILED', targetId: existing.id, failureCategory: 'IMPORT_TARGET_CONCURRENCY_CONFLICT' } as const;
      }
      await txDb.orm.public.ImportRow.where({ id: row.id }).update({ commitOutcome: 'UPDATED', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: existing.id, updatedAt: toDbInstant(input.at) });
      return { outcome: 'UPDATED', targetId: existing.id } as const;
    });
  }

  async finalizeCommit(input: { importJobId: string; terminalStatus: 'COMPLETED' | 'COMPLETED_WITH_ERRORS'; committedRows: number; rejectedRows: number; failedRows: number; at: Date; audit: ImportAuditRecord }): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const row = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      if (!row) return { outcome: 'NOT_FOUND' } as const;
      const job = jobRow(row);
      if (job.status !== 'COMMITTING') return { outcome: 'STATE_CONFLICT' } as const;
      const count = await txDb.orm.public.ImportJob.where({ id: job.id, version: job.version, status: 'COMMITTING' }).updateAndCount({
        status: input.terminalStatus, committedRows: input.committedRows, rejectedRows: input.rejectedRows, failedRows: input.failedRows,
        completedAt: toDbInstant(input.at), updatedAt: toDbInstant(input.at), version: job.version + 1,
      });
      if (count !== 1) return { outcome: 'STALE' } as const;
      await appendAudit(txDb, input.audit);
      const updated = await txDb.orm.public.ImportJob.first({ id: job.id });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }

  async failCommit(input: { importJobId: string; at: Date; audit: ImportAuditRecord }): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const row = await txDb.orm.public.ImportJob.first({ id: input.importJobId });
      if (!row) return { outcome: 'NOT_FOUND' } as const;
      const job = jobRow(row);
      if (job.status !== 'COMMITTING') return { outcome: 'STATE_CONFLICT' } as const;
      const count = await txDb.orm.public.ImportJob.where({ id: job.id, version: job.version, status: 'COMMITTING' }).updateAndCount({
        status: 'FAILED', failedRows: Math.max(job.failedRows, 1), completedAt: toDbInstant(input.at), updatedAt: toDbInstant(input.at), version: job.version + 1,
      });
      if (count !== 1) return { outcome: 'STALE' } as const;
      await appendAudit(txDb, input.audit);
      const updated = await txDb.orm.public.ImportJob.first({ id: job.id });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }

  private async simpleJobAdvance(importJobId: string, expectedVersion: number, expectedStatus: ImportJobProps['status'], nextStatus: ImportJobProps['status'], patch: Record<string, unknown>, at: Date): Promise<ImportMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const current = await this.currentForMutation(txDb, importJobId, expectedVersion, expectedStatus);
      if ('outcome' in current) return current;
      const count = await txDb.orm.public.ImportJob.where({ id: importJobId, version: expectedVersion, status: expectedStatus }).updateAndCount({
        ...patch, status: nextStatus, updatedAt: toDbInstant(at), version: expectedVersion + 1,
      });
      if (count !== 1) return { outcome: 'STALE' } as const;
      const updated = await txDb.orm.public.ImportJob.first({ id: importJobId });
      return { outcome: 'UPDATED', job: jobRow(updated) } as const;
    });
  }
}
