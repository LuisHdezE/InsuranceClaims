import {
  assertImportJobTransition,
  type ImportCommitOutcome,
  type ImportJobProps,
  type ImportJobStatus,
  type ImportRowProps,
  type SyntheticImportReferenceRecord,
} from '@insurance/domain/import-job';
import type { ActorContext, ClockPort, HashPort, IdGeneratorPort, IdempotencyRecord } from './index.js';

export const SYNTHETIC_IMPORT_TYPE = 'SYNTHETIC_REFERENCE_RECORDS' as const;
export type SupportedImportType = typeof SYNTHETIC_IMPORT_TYPE;

export type GovernedImportErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_VERSION_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IMPORT_STATE_CONFLICT'
  | 'IMPORT_MAPPING_INVALID'
  | 'IMPORT_SOURCE_INVALID'
  | 'IMPORT_SOURCE_UNSUPPORTED'
  | 'IMPORT_SOURCE_TOO_LARGE'
  | 'VALIDATION_ERROR';

export class GovernedImportApplicationError extends Error {
  constructor(readonly code: GovernedImportErrorCode, message: string) {
    super(message);
    this.name = 'GovernedImportApplicationError';
  }
}

export interface ImportSourceFileInput {
  bytes: Uint8Array;
  mediaType: string;
  originalName: string;
}

export interface ParsedImportSource {
  headers: readonly string[];
  rows: readonly Readonly<Record<string, string>>[];
}

export interface ImportSourceParserPort {
  parse(input: { bytes: Uint8Array; mediaType: string }): Promise<ParsedImportSource>;
}

export interface ImportSourceStoragePort {
  stage(input: { importJobId: string; bytes: Uint8Array; mediaType: string; originalName: string }): Promise<{ storageKey: string; displayFilename: string | null }>;
  read(storageKey: string): Promise<Uint8Array>;
  cleanup(storageKey: string): Promise<void>;
}

export interface ImportAuditRecord {
  id: string;
  eventCode:
    | 'IMPORT_JOB_CREATED'
    | 'IMPORT_DRY_RUN_COMPLETED'
    | 'IMPORT_COMMIT_REQUESTED'
    | 'IMPORT_COMMIT_COMPLETED'
    | 'IMPORT_COMMIT_FAILED';
  occurredAt: Date;
  actorType: 'ADMINISTRATOR' | 'SYSTEM';
  actorId: string | null;
  targetType: 'IMPORT_JOB';
  targetId: string;
  outcome: 'SUCCESS' | 'FAILURE';
  requestId: string | null;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export type ImportMutationResult =
  | { outcome: 'UPDATED'; job: ImportJobProps }
  | { outcome: 'STALE' }
  | { outcome: 'STATE_CONFLICT' }
  | { outcome: 'NOT_FOUND' };

export type ImportCommitRowResult =
  | { outcome: 'CREATED' | 'UPDATED' | 'UNCHANGED'; targetId: string }
  | { outcome: 'REJECTED'; targetId: null }
  | { outcome: 'FAILED'; targetId: string | null; failureCategory: string };

export interface GovernedImportRepository {
  listJobs(input: { page: number; pageSize: number }): Promise<{ items: ImportJobProps[]; totalItems: number }>;
  getJob(importJobId: string): Promise<ImportJobProps | null>;
  listRows(input: { importJobId: string; page: number; pageSize: number }): Promise<{ items: ImportRowProps[]; totalItems: number } | null>;

  getIdempotency(scope: string, keyHash: string): Promise<IdempotencyRecord | null>;
  reserveIdempotency(record: IdempotencyRecord): Promise<boolean>;
  markIdempotencyRetryable(scope: string, keyHash: string): Promise<void>;

  createJob(input: {
    job: ImportJobProps;
    audit: ImportAuditRecord;
    idempotencyScope: string;
    idempotencyKeyHash: string;
    responseReference: unknown;
  }): Promise<void>;

  savePreview(input: {
    importJobId: string;
    expectedVersion: number;
    rows: readonly ImportRowProps[];
    at: Date;
  }): Promise<ImportMutationResult>;

  saveMapping(input: {
    importJobId: string;
    expectedVersion: number;
    mapping: Readonly<Record<string, string>>;
    at: Date;
  }): Promise<ImportMutationResult>;

  saveValidation(input: {
    importJobId: string;
    expectedVersion: number;
    rows: readonly ImportRowProps[];
    validRows: number;
    invalidRows: number;
    at: Date;
  }): Promise<ImportMutationResult>;

  findSyntheticTarget(externalReference: string): Promise<SyntheticImportReferenceRecord | null>;

  saveDryRun(input: {
    importJobId: string;
    expectedVersion: number;
    rows: readonly ImportRowProps[];
    unchangedRows: number;
    audit: ImportAuditRecord;
    at: Date;
  }): Promise<ImportMutationResult>;

  requestCommit(input: {
    importJobId: string;
    expectedVersion: number;
    asyncJobId: string;
    requestedById: string;
    correlationId: string | null;
    at: Date;
    audit: ImportAuditRecord;
    idempotencyScope: string;
    idempotencyKeyHash: string;
    responseReference: unknown;
  }): Promise<ImportMutationResult>;

  commitRow(input: {
    importJobId: string;
    rowId: string;
    expectedDryRunOutcome: ImportRowProps['dryRunOutcome'];
    normalizedInput: Readonly<Record<string, string | null>> | null;
    targetId: string | null;
    at: Date;
    generatedTargetId: string;
  }): Promise<ImportCommitRowResult>;

  finalizeCommit(input: {
    importJobId: string;
    terminalStatus: 'COMPLETED' | 'COMPLETED_WITH_ERRORS';
    committedRows: number;
    rejectedRows: number;
    failedRows: number;
    at: Date;
    audit: ImportAuditRecord;
  }): Promise<ImportMutationResult>;

  failCommit(input: {
    importJobId: string;
    at: Date;
    audit: ImportAuditRecord;
  }): Promise<ImportMutationResult>;
}

export interface ImportJobResponse {
  importJobId: string;
  importType: string;
  status: ImportJobStatus;
  source: { mediaType: string; sizeBytes: number };
  sourceHeaders?: readonly string[];
  mapping: Readonly<Record<string, string>> | null;
  counts: {
    total: number;
    valid: number;
    invalid: number;
    unchanged: number;
    committed: number;
    rejected: number;
    failed: number;
  };
  correlationId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ImportJobsPageResponse {
  items: ImportJobResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ImportRowResponse {
  importRowId: string;
  rowNumber: number;
  normalizedInput: Readonly<Record<string, string | null>> | null;
  validationStatus: ImportRowProps['validationStatus'];
  validationErrors: readonly string[];
  dryRunOutcome: ImportRowProps['dryRunOutcome'];
  commitOutcome: ImportCommitOutcome;
  targetType: string | null;
  targetId: string | null;
}

export interface ImportJobRowsPageResponse {
  items: ImportRowResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ImportWorkerPrincipal {
  context: 'system';
  actorId: string;
  capabilities: readonly string[];
}

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 5000;
const IDEMPOTENCY_MS = 24 * 60 * 60 * 1000;
const ALLOWED_SOURCE_TYPES = new Set(['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const FIXTURE_TARGET_FIELDS = new Set(['externalReference', 'label', 'classification']);

function requireAdmin(actor: ActorContext | undefined): ActorContext {
  if (!actor) throw new GovernedImportApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes('imports.execute')) throw new GovernedImportApplicationError('FORBIDDEN', 'The caller is not authorized to execute imports.');
  return actor;
}

function requireWorker(principal: ImportWorkerPrincipal | undefined): ImportWorkerPrincipal {
  if (!principal || principal.context !== 'system' || !principal.actorId || !principal.capabilities.includes('imports.commit.execute')) {
    throw new GovernedImportApplicationError('AUTHENTICATION_REQUIRED', 'A valid import Worker principal is required.');
  }
  return principal;
}

function validatePage(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new GovernedImportApplicationError('VALIDATION_ERROR', 'Pagination values are invalid.');
  }
}

function validateExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new GovernedImportApplicationError('VALIDATION_ERROR', 'expectedVersion must be a positive integer.');
  }
}

function validateIdempotencyKey(value: string): void {
  if (!value || value.length < 16 || value.length > 128) {
    throw new GovernedImportApplicationError('VALIDATION_ERROR', 'Idempotency-Key must contain 16 to 128 characters.');
  }
}

function validateImportType(value: string): SupportedImportType {
  if (value !== SYNTHETIC_IMPORT_TYPE) {
    throw new GovernedImportApplicationError(
      'VALIDATION_ERROR',
      'This R3 increment exposes only the synthetic reference-record import fixture; real business import types require separately approved mappings.',
    );
  }
  return value;
}

function validateSource(file: ImportSourceFileInput): void {
  if (!ALLOWED_SOURCE_TYPES.has(file.mediaType)) {
    throw new GovernedImportApplicationError('IMPORT_SOURCE_UNSUPPORTED', 'Import source must be CSV or XLSX.');
  }
  if (file.bytes.byteLength < 1) throw new GovernedImportApplicationError('IMPORT_SOURCE_INVALID', 'Import source must not be empty.');
  if (file.bytes.byteLength > MAX_SOURCE_BYTES) throw new GovernedImportApplicationError('IMPORT_SOURCE_TOO_LARGE', 'Import source exceeds the 10 MiB demo engineering limit.');
  const lowered = file.originalName.toLowerCase();
  if (file.mediaType === 'text/csv' && !lowered.endsWith('.csv')) {
    throw new GovernedImportApplicationError('IMPORT_SOURCE_UNSUPPORTED', 'CSV media type requires a .csv source name.');
  }
  if (file.mediaType !== 'text/csv' && !lowered.endsWith('.xlsx')) {
    throw new GovernedImportApplicationError('IMPORT_SOURCE_UNSUPPORTED', 'XLSX media type requires a .xlsx source name.');
  }
}

function jobResponse(job: ImportJobProps, sourceHeaders?: readonly string[]): ImportJobResponse {
  return {
    importJobId: job.id,
    importType: job.importType,
    status: job.status,
    source: { mediaType: job.sourceMediaType, sizeBytes: job.sourceSizeBytes },
    ...(sourceHeaders ? { sourceHeaders: [...sourceHeaders] } : {}),
    mapping: job.mappingConfiguration ? { ...job.mappingConfiguration } : null,
    counts: {
      total: job.totalRows,
      valid: job.validRows,
      invalid: job.invalidRows,
      unchanged: job.unchangedRows,
      committed: job.committedRows,
      rejected: job.rejectedRows,
      failed: job.failedRows,
    },
    correlationId: job.correlationId,
    version: job.version,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  };
}

function sourceHeadersFromRows(rows: readonly ImportRowProps[]): string[] {
  return rows.length ? Object.keys(rows[0]!.stagedInput) : [];
}

function rowResponse(row: ImportRowProps): ImportRowResponse {
  return {
    importRowId: row.id,
    rowNumber: row.rowNumber,
    normalizedInput: row.normalizedInput ? { ...row.normalizedInput } : null,
    validationStatus: row.validationStatus,
    validationErrors: [...row.validationErrors],
    dryRunOutcome: row.dryRunOutcome,
    commitOutcome: row.commitOutcome,
    targetType: row.targetType,
    targetId: row.targetId,
  };
}

function mutationOrThrow(result: ImportMutationResult): ImportJobProps {
  if (result.outcome === 'NOT_FOUND') throw new GovernedImportApplicationError('RESOURCE_NOT_FOUND', 'The import job was not found.');
  if (result.outcome === 'STALE') throw new GovernedImportApplicationError('RESOURCE_VERSION_CONFLICT', 'The import job changed concurrently.');
  if (result.outcome === 'STATE_CONFLICT') throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'The import job is not in the required lifecycle state.');
  return result.job;
}

function canonicalRecord(value: Readonly<Record<string, string | null>>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

function cleanHeader(value: string): string {
  return value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
}

function cleanCell(value: string, max = 1000): string {
  return value.replace(/\u0000/g, '').trim().slice(0, max);
}

function mappingFrom(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'mapping must be an object of approved target fields to source headers.');
  }
  const result: Record<string, string> = {};
  for (const [target, rawSource] of Object.entries(input as Record<string, unknown>)) {
    if (!FIXTURE_TARGET_FIELDS.has(target) || typeof rawSource !== 'string') {
      throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'Mapping contains a target field outside the approved synthetic importer allowlist.');
    }
    const source = cleanHeader(rawSource);
    if (!source) throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'Mapped source headers must be non-empty.');
    result[target] = source;
  }
  if (!result.externalReference || !result.label) {
    throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'externalReference and label mappings are required by the synthetic importer fixture.');
  }
  if (new Set(Object.values(result)).size !== Object.values(result).length) {
    throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'One source header cannot map to multiple approved target fields.');
  }
  return result;
}

function normalizeFixtureRow(row: ImportRowProps, mapping: Readonly<Record<string, string>>): { normalized: Record<string, string | null>; errors: string[] } {
  const errors: string[] = [];
  const externalReference = cleanCell(row.stagedInput[mapping.externalReference!] ?? '', 80);
  const label = cleanCell(row.stagedInput[mapping.label!] ?? '', 160);
  const classification = mapping.classification ? cleanCell(row.stagedInput[mapping.classification] ?? '', 80) || null : null;
  if (!externalReference) errors.push('EXTERNAL_REFERENCE_REQUIRED');
  else if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(externalReference)) errors.push('EXTERNAL_REFERENCE_INVALID');
  if (!label) errors.push('LABEL_REQUIRED');
  return { normalized: { externalReference, label, classification }, errors };
}

export class GovernedImportsApplication {
  constructor(private readonly deps: {
    repository: GovernedImportRepository;
    parser: ImportSourceParserPort;
    sourceStorage: ImportSourceStoragePort;
    clock: ClockPort;
    ids: IdGeneratorPort;
    hash: HashPort;
  }) {}

  async listJobs(input: { page?: number; pageSize?: number }, actorInput: ActorContext | undefined): Promise<ImportJobsPageResponse> {
    requireAdmin(actorInput);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    validatePage(page, pageSize);
    const result = await this.deps.repository.listJobs({ page, pageSize });
    return {
      items: result.items.map(jobResponse), page, pageSize, totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / pageSize),
    };
  }

  async getJob(importJobId: string, actorInput: ActorContext | undefined): Promise<ImportJobResponse> {
    requireAdmin(actorInput);
    const job = await this.deps.repository.getJob(importJobId);
    if (!job) throw new GovernedImportApplicationError('RESOURCE_NOT_FOUND', 'The import job was not found.');
    if (job.status === 'UPLOADED' || job.totalRows === 0) return jobResponse(job, []);
    const rows = await this.allRows(importJobId);
    return jobResponse(job, sourceHeadersFromRows(rows));
  }

  async listRows(importJobId: string, input: { page?: number; pageSize?: number }, actorInput: ActorContext | undefined): Promise<ImportJobRowsPageResponse> {
    requireAdmin(actorInput);
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 50;
    validatePage(page, pageSize);
    const result = await this.deps.repository.listRows({ importJobId, page, pageSize });
    if (!result) throw new GovernedImportApplicationError('RESOURCE_NOT_FOUND', 'The import job was not found.');
    return {
      items: result.items.map(rowResponse), page, pageSize, totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / pageSize),
    };
  }

  async createJob(input: {
    idempotencyKey: string;
    importType: string;
    sourceFile: ImportSourceFileInput;
  }, actorInput: ActorContext | undefined, context: { requestId?: string } = {}): Promise<{ response: ImportJobResponse; replayed: boolean }> {
    const actor = requireAdmin(actorInput);
    validateIdempotencyKey(input.idempotencyKey);
    const importType = validateImportType(input.importType);
    validateSource(input.sourceFile);

    const keyHash = await this.deps.hash.sha256(input.idempotencyKey);
    const contentHash = await this.deps.hash.sha256(input.sourceFile.bytes);
    const requestFingerprint = await this.deps.hash.sha256(JSON.stringify({ importType, mediaType: input.sourceFile.mediaType, contentHash }));
    const scope = 'createImportJob';
    const replay = await this.replay(scope, keyHash, requestFingerprint);
    if (replay) return { response: replay as ImportJobResponse, replayed: true };

    const now = this.deps.clock.now();
    const reserved = await this.deps.repository.reserveIdempotency({
      scope, keyHash, requestFingerprint, status: 'IN_PROGRESS', claimId: null, responseReference: null,
      createdAt: now, expiresAt: new Date(now.getTime() + IDEMPOTENCY_MS),
    });
    if (!reserved) {
      const raced = await this.replay(scope, keyHash, requestFingerprint);
      if (raced) return { response: raced as ImportJobResponse, replayed: true };
      throw new GovernedImportApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original import creation request is still being processed.');
    }

    const importJobId = this.deps.ids.uuid();
    let staged: { storageKey: string; displayFilename: string | null } | null = null;
    try {
      staged = await this.deps.sourceStorage.stage({
        importJobId,
        bytes: input.sourceFile.bytes,
        mediaType: input.sourceFile.mediaType,
        originalName: input.sourceFile.originalName,
      });
      const job: ImportJobProps = {
        id: importJobId,
        importType,
        sourceStorageKey: staged.storageKey,
        sourceMediaType: input.sourceFile.mediaType,
        sourceSizeBytes: input.sourceFile.bytes.byteLength,
        sourceDisplayFilename: staged.displayFilename,
        status: 'UPLOADED',
        mappingConfiguration: null,
        totalRows: 0, validRows: 0, invalidRows: 0, unchangedRows: 0, committedRows: 0, rejectedRows: 0, failedRows: 0,
        createdById: actor.operatorId,
        commitRequestedById: null,
        correlationId: context.requestId ?? importJobId,
        version: 1,
        createdAt: now, updatedAt: now, startedAt: null, completedAt: null,
      };
      const response = jobResponse(job);
      await this.deps.repository.createJob({
        job,
        audit: {
          id: this.deps.ids.uuid(), eventCode: 'IMPORT_JOB_CREATED', occurredAt: now,
          actorType: 'ADMINISTRATOR', actorId: actor.operatorId, targetType: 'IMPORT_JOB', targetId: importJobId,
          outcome: 'SUCCESS', requestId: context.requestId ?? null,
          metadata: { importType, sourceMediaType: input.sourceFile.mediaType, sourceSizeBytes: input.sourceFile.bytes.byteLength, rowCount: 0 },
        },
        idempotencyScope: scope, idempotencyKeyHash: keyHash, responseReference: response,
      });
      return { response, replayed: false };
    } catch (error) {
      if (staged) await this.deps.sourceStorage.cleanup(staged.storageKey).catch(() => undefined);
      await this.deps.repository.markIdempotencyRetryable(scope, keyHash).catch(() => undefined);
      throw error;
    }
  }

  async previewJob(importJobId: string, expectedVersion: number, actorInput: ActorContext | undefined): Promise<ImportJobResponse> {
    requireAdmin(actorInput);
    validateExpectedVersion(expectedVersion);
    const job = await this.requireJob(importJobId);
    if (job.status !== 'UPLOADED') throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'Only an uploaded import may be previewed.');
    if (job.version !== expectedVersion) throw new GovernedImportApplicationError('RESOURCE_VERSION_CONFLICT', 'The import job changed concurrently.');
    const bytes = await this.deps.sourceStorage.read(job.sourceStorageKey);
    const parsed = await this.deps.parser.parse({ bytes, mediaType: job.sourceMediaType });
    if (parsed.rows.length > MAX_ROWS) throw new GovernedImportApplicationError('IMPORT_SOURCE_INVALID', 'Import source exceeds the 5000-row demo engineering limit.');
    const headers = parsed.headers.map(cleanHeader);
    if (!headers.length || headers.some((item) => !item) || new Set(headers).size !== headers.length) {
      throw new GovernedImportApplicationError('IMPORT_SOURCE_INVALID', 'Import source headers must be unique, non-empty data labels.');
    }
    const now = this.deps.clock.now();
    const rows: ImportRowProps[] = [];
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const stagedInput = Object.fromEntries(headers.map((header) => [header, cleanCell(parsed.rows[index]![header] ?? '')]));
      rows.push({
        id: this.deps.ids.uuid(), importJobId, rowNumber: index + 2, stagedInput,
        normalizedInput: null, validationStatus: 'PENDING', validationErrors: [], dryRunOutcome: 'PENDING', commitOutcome: 'PENDING',
        targetType: null, targetId: null, rowFingerprint: await this.deps.hash.sha256(canonicalRecord(stagedInput)),
        createdAt: now, updatedAt: now,
      });
    }
    assertImportJobTransition(job.status, 'PREVIEWED');
    const saved = mutationOrThrow(await this.deps.repository.savePreview({ importJobId, expectedVersion, rows, at: now }));
    return jobResponse(saved, headers);
  }

  async updateMapping(importJobId: string, expectedVersion: number, mappingInput: unknown, actorInput: ActorContext | undefined): Promise<ImportJobResponse> {
    requireAdmin(actorInput);
    validateExpectedVersion(expectedVersion);
    const job = await this.requireJob(importJobId);
    if (job.status !== 'PREVIEWED') throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'Only a previewed import may receive mapping configuration.');
    if (job.version !== expectedVersion) throw new GovernedImportApplicationError('RESOURCE_VERSION_CONFLICT', 'The import job changed concurrently.');
    const rows = await this.allRows(importJobId);
    if (!rows.length) throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'An import with no data rows cannot be mapped.');
    const mapping = mappingFrom(mappingInput);
    const availableHeaders = new Set(Object.keys(rows[0]!.stagedInput));
    for (const sourceHeader of Object.values(mapping)) {
      if (!availableHeaders.has(sourceHeader)) throw new GovernedImportApplicationError('IMPORT_MAPPING_INVALID', 'Mapping references a source header that is not present in the preview.');
    }
    assertImportJobTransition(job.status, 'MAPPED');
    const saved = mutationOrThrow(await this.deps.repository.saveMapping({ importJobId, expectedVersion, mapping, at: this.deps.clock.now() }));
    return jobResponse(saved, sourceHeadersFromRows(rows));
  }

  async validateJob(importJobId: string, expectedVersion: number, actorInput: ActorContext | undefined): Promise<ImportJobResponse> {
    requireAdmin(actorInput);
    validateExpectedVersion(expectedVersion);
    const job = await this.requireJob(importJobId);
    if (job.status !== 'MAPPED' || !job.mappingConfiguration) throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'Only a mapped import may be validated.');
    if (job.version !== expectedVersion) throw new GovernedImportApplicationError('RESOURCE_VERSION_CONFLICT', 'The import job changed concurrently.');
    const rows = await this.allRows(importJobId);
    const seen = new Set<string>();
    const at = this.deps.clock.now();
    let validRows = 0;
    let invalidRows = 0;
    const validated: ImportRowProps[] = [];
    for (const row of rows) {
      const { normalized, errors } = normalizeFixtureRow(row, job.mappingConfiguration);
      const externalReference = normalized.externalReference ?? '';
      if (externalReference && seen.has(externalReference)) errors.push('DUPLICATE_EXTERNAL_REFERENCE_IN_IMPORT');
      if (externalReference) seen.add(externalReference);
      const valid = errors.length === 0;
      if (valid) validRows += 1; else invalidRows += 1;
      validated.push({ ...row, normalizedInput: normalized, validationStatus: valid ? 'VALID' : 'INVALID', validationErrors: errors, dryRunOutcome: 'PENDING', commitOutcome: 'PENDING', targetType: null, targetId: null, updatedAt: at });
    }
    assertImportJobTransition(job.status, 'VALIDATED');
    const saved = mutationOrThrow(await this.deps.repository.saveValidation({ importJobId, expectedVersion, rows: validated, validRows, invalidRows, at }));
    return jobResponse(saved, sourceHeadersFromRows(rows));
  }

  async dryRunJob(importJobId: string, expectedVersion: number, actorInput: ActorContext | undefined, context: { requestId?: string } = {}): Promise<ImportJobResponse> {
    const actor = requireAdmin(actorInput);
    validateExpectedVersion(expectedVersion);
    const job = await this.requireJob(importJobId);
    if (job.status !== 'VALIDATED') throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'Only a validated import may run a dry run.');
    if (job.version !== expectedVersion) throw new GovernedImportApplicationError('RESOURCE_VERSION_CONFLICT', 'The import job changed concurrently.');
    const rows = await this.allRows(importJobId);
    const at = this.deps.clock.now();
    let unchangedRows = 0;
    const dryRows: ImportRowProps[] = [];
    for (const row of rows) {
      if (row.validationStatus !== 'VALID' || !row.normalizedInput) {
        dryRows.push({ ...row, dryRunOutcome: 'REJECTED', targetType: null, targetId: null, updatedAt: at });
        continue;
      }
      const externalReference = row.normalizedInput.externalReference!;
      const existing = await this.deps.repository.findSyntheticTarget(externalReference);
      if (!existing) {
        dryRows.push({ ...row, dryRunOutcome: 'CREATE', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: null, updatedAt: at });
        continue;
      }
      const same = existing.label === row.normalizedInput.label && existing.classification === row.normalizedInput.classification;
      if (same) unchangedRows += 1;
      dryRows.push({ ...row, dryRunOutcome: same ? 'UNCHANGED' : 'UPDATE', targetType: 'SYNTHETIC_IMPORT_REFERENCE', targetId: existing.id, updatedAt: at });
    }
    assertImportJobTransition(job.status, 'DRY_RUN_READY');
    const result = await this.deps.repository.saveDryRun({
      importJobId, expectedVersion, rows: dryRows, unchangedRows, at,
      audit: {
        id: this.deps.ids.uuid(), eventCode: 'IMPORT_DRY_RUN_COMPLETED', occurredAt: at,
        actorType: 'ADMINISTRATOR', actorId: actor.operatorId, targetType: 'IMPORT_JOB', targetId: importJobId,
        outcome: 'SUCCESS', requestId: context.requestId ?? null,
        metadata: { validRows: job.validRows, invalidRows: job.invalidRows, unchangedRows },
      },
    });
    return jobResponse(mutationOrThrow(result), sourceHeadersFromRows(rows));
  }

  async commitJob(input: { importJobId: string; expectedVersion: number; idempotencyKey: string }, actorInput: ActorContext | undefined, context: { requestId?: string } = {}): Promise<{ response: ImportJobResponse; replayed: boolean }> {
    const actor = requireAdmin(actorInput);
    validateExpectedVersion(input.expectedVersion);
    validateIdempotencyKey(input.idempotencyKey);
    const scope = `commitImportJob:${input.importJobId}`;
    const keyHash = await this.deps.hash.sha256(input.idempotencyKey);
    const requestFingerprint = await this.deps.hash.sha256(JSON.stringify({ importJobId: input.importJobId, expectedVersion: input.expectedVersion, policy: 'ROW_PARTIAL_INDEPENDENT' }));
    const replay = await this.replay(scope, keyHash, requestFingerprint);
    if (replay) return { response: replay as ImportJobResponse, replayed: true };

    const job = await this.requireJob(input.importJobId);
    if (job.status !== 'DRY_RUN_READY') throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'Only a dry-run-ready import may be committed.');
    if (job.version !== input.expectedVersion) throw new GovernedImportApplicationError('RESOURCE_VERSION_CONFLICT', 'The import job changed concurrently.');
    const at = this.deps.clock.now();
    const reserved = await this.deps.repository.reserveIdempotency({
      scope, keyHash, requestFingerprint, status: 'IN_PROGRESS', claimId: null, responseReference: null,
      createdAt: at, expiresAt: new Date(at.getTime() + IDEMPOTENCY_MS),
    });
    if (!reserved) {
      const raced = await this.replay(scope, keyHash, requestFingerprint);
      if (raced) return { response: raced as ImportJobResponse, replayed: true };
      throw new GovernedImportApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original import commit request is still being processed.');
    }
    assertImportJobTransition(job.status, 'COMMITTING');
    const predicted: ImportJobProps = { ...job, status: 'COMMITTING', commitRequestedById: actor.operatorId, startedAt: job.startedAt ?? at, updatedAt: at, version: job.version + 1 };
    const response = jobResponse(predicted);
    try {
      const result = await this.deps.repository.requestCommit({
        importJobId: input.importJobId,
        expectedVersion: input.expectedVersion,
        asyncJobId: this.deps.ids.uuid(),
        requestedById: actor.operatorId,
        correlationId: context.requestId ?? job.correlationId,
        at,
        audit: {
          id: this.deps.ids.uuid(), eventCode: 'IMPORT_COMMIT_REQUESTED', occurredAt: at,
          actorType: 'ADMINISTRATOR', actorId: actor.operatorId, targetType: 'IMPORT_JOB', targetId: input.importJobId,
          outcome: 'SUCCESS', requestId: context.requestId ?? null,
          metadata: { importType: job.importType, commitPolicy: 'ROW_PARTIAL_INDEPENDENT' },
        },
        idempotencyScope: scope, idempotencyKeyHash: keyHash, responseReference: response,
      });
      return { response: jobResponse(mutationOrThrow(result)), replayed: false };
    } catch (error) {
      await this.deps.repository.markIdempotencyRetryable(scope, keyHash).catch(() => undefined);
      throw error;
    }
  }

  async executeCommittedImport(importJobId: string, principalInput: ImportWorkerPrincipal | undefined): Promise<ImportJobResponse> {
    const principal = requireWorker(principalInput);
    const job = await this.requireJob(importJobId);
    if (job.status === 'COMPLETED' || job.status === 'COMPLETED_WITH_ERRORS') return jobResponse(job);
    if (job.status !== 'COMMITTING') throw new GovernedImportApplicationError('IMPORT_STATE_CONFLICT', 'The import job is not awaiting Worker commit execution.');
    const rows = await this.allRows(importJobId);
    let committedRows = 0;
    let rejectedRows = 0;
    let failedRows = 0;
    try {
      for (const row of rows) {
        const result = await this.deps.repository.commitRow({
          importJobId,
          rowId: row.id,
          expectedDryRunOutcome: row.dryRunOutcome,
          normalizedInput: row.normalizedInput,
          targetId: row.targetId,
          at: this.deps.clock.now(),
          generatedTargetId: this.deps.ids.uuid(),
        });
        if (result.outcome === 'CREATED' || result.outcome === 'UPDATED') committedRows += 1;
        else if (result.outcome === 'REJECTED') rejectedRows += 1;
        else if (result.outcome === 'FAILED') failedRows += 1;
      }
      const terminalStatus = failedRows > 0 || rejectedRows > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED';
      assertImportJobTransition('COMMITTING', terminalStatus);
      const at = this.deps.clock.now();
      const finalized = mutationOrThrow(await this.deps.repository.finalizeCommit({
        importJobId, terminalStatus, committedRows, rejectedRows, failedRows, at,
        audit: {
          id: this.deps.ids.uuid(), eventCode: 'IMPORT_COMMIT_COMPLETED', occurredAt: at,
          actorType: 'SYSTEM', actorId: principal.actorId, targetType: 'IMPORT_JOB', targetId: importJobId,
          outcome: 'SUCCESS', requestId: job.correlationId,
          metadata: { commitPolicy: 'ROW_PARTIAL_INDEPENDENT', committedRows, rejectedRows, failedRows, terminalStatus },
        },
      }));
      return jobResponse(finalized, sourceHeadersFromRows(rows));
    } catch (error) {
      const at = this.deps.clock.now();
      await this.deps.repository.failCommit({
        importJobId, at,
        audit: {
          id: this.deps.ids.uuid(), eventCode: 'IMPORT_COMMIT_FAILED', occurredAt: at,
          actorType: 'SYSTEM', actorId: principal.actorId, targetType: 'IMPORT_JOB', targetId: importJobId,
          outcome: 'FAILURE', requestId: job.correlationId,
          metadata: { failureCategory: 'IMPORT_COMMIT_ORCHESTRATION_FAILED', commitPolicy: 'ROW_PARTIAL_INDEPENDENT' },
        },
      }).catch(() => undefined);
      throw error;
    }
  }

  private async replay(scope: string, keyHash: string, requestFingerprint: string): Promise<unknown | null> {
    const existing = await this.deps.repository.getIdempotency(scope, keyHash);
    if (!existing) return null;
    if (existing.requestFingerprint !== requestFingerprint) throw new GovernedImportApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different request.');
    if (existing.status === 'COMPLETED' && existing.responseReference) return existing.responseReference;
    if (existing.status === 'IN_PROGRESS') throw new GovernedImportApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
    return null;
  }

  private async requireJob(importJobId: string): Promise<ImportJobProps> {
    const job = await this.deps.repository.getJob(importJobId);
    if (!job) throw new GovernedImportApplicationError('RESOURCE_NOT_FOUND', 'The import job was not found.');
    return job;
  }

  private async allRows(importJobId: string): Promise<ImportRowProps[]> {
    const rows: ImportRowProps[] = [];
    let page = 1;
    while (true) {
      const batch = await this.deps.repository.listRows({ importJobId, page, pageSize: 100 });
      if (!batch) throw new GovernedImportApplicationError('RESOURCE_NOT_FOUND', 'The import job was not found.');
      rows.push(...batch.items);
      if (page * 100 >= batch.totalItems) break;
      page += 1;
    }
    return rows.sort((a, b) => a.rowNumber - b.rowNumber || a.id.localeCompare(b.id));
  }
}
