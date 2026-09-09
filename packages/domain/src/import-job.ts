export const IMPORT_JOB_STATUSES = [
  'UPLOADED',
  'PREVIEWED',
  'MAPPED',
  'VALIDATED',
  'DRY_RUN_READY',
  'COMMITTING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const;

export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export const IMPORT_ROW_VALIDATION_STATUSES = ['PENDING', 'VALID', 'INVALID'] as const;
export type ImportRowValidationStatus = (typeof IMPORT_ROW_VALIDATION_STATUSES)[number];

export const IMPORT_DRY_RUN_OUTCOMES = ['PENDING', 'CREATE', 'UPDATE', 'UNCHANGED', 'REJECTED'] as const;
export type ImportDryRunOutcome = (typeof IMPORT_DRY_RUN_OUTCOMES)[number];

export const IMPORT_COMMIT_OUTCOMES = ['PENDING', 'CREATED', 'UPDATED', 'UNCHANGED', 'REJECTED', 'FAILED'] as const;
export type ImportCommitOutcome = (typeof IMPORT_COMMIT_OUTCOMES)[number];

const ALLOWED_TRANSITIONS: Readonly<Record<ImportJobStatus, readonly ImportJobStatus[]>> = {
  UPLOADED: ['PREVIEWED', 'FAILED', 'CANCELLED'],
  PREVIEWED: ['MAPPED', 'FAILED', 'CANCELLED'],
  MAPPED: ['VALIDATED', 'FAILED', 'CANCELLED'],
  VALIDATED: ['DRY_RUN_READY', 'FAILED', 'CANCELLED'],
  DRY_RUN_READY: ['COMMITTING', 'FAILED', 'CANCELLED'],
  COMMITTING: ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED'],
  COMPLETED: [],
  COMPLETED_WITH_ERRORS: [],
  FAILED: [],
  CANCELLED: [],
};

export class ImportJobStateError extends Error {
  constructor(readonly from: ImportJobStatus, readonly to: ImportJobStatus) {
    super(`ImportJob cannot transition from ${from} to ${to}.`);
    this.name = 'ImportJobStateError';
  }
}

export function canTransitionImportJob(from: ImportJobStatus, to: ImportJobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertImportJobTransition(from: ImportJobStatus, to: ImportJobStatus): void {
  if (!canTransitionImportJob(from, to)) throw new ImportJobStateError(from, to);
}

export interface ImportJobCounts {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  unchangedRows: number;
  committedRows: number;
  rejectedRows: number;
  failedRows: number;
}

export interface ImportJobProps extends ImportJobCounts {
  id: string;
  importType: string;
  sourceStorageKey: string;
  sourceMediaType: string;
  sourceSizeBytes: number;
  sourceDisplayFilename: string | null;
  status: ImportJobStatus;
  mappingConfiguration: Readonly<Record<string, string>> | null;
  createdById: string;
  commitRequestedById: string | null;
  correlationId: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ImportRowProps {
  id: string;
  importJobId: string;
  rowNumber: number;
  stagedInput: Readonly<Record<string, string>>;
  normalizedInput: Readonly<Record<string, string | null>> | null;
  validationStatus: ImportRowValidationStatus;
  validationErrors: readonly string[];
  dryRunOutcome: ImportDryRunOutcome;
  commitOutcome: ImportCommitOutcome;
  targetType: string | null;
  targetId: string | null;
  rowFingerprint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyntheticImportReferenceRecord {
  id: string;
  externalReference: string;
  label: string;
  classification: string | null;
  sourceImportJobId: string;
  sourceImportRowId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
