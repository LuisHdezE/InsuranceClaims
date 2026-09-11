import type { AxiosInstance, AxiosResponse } from 'axios';
import { createApiClient, toApiFailure } from './client';
import type { ApiResult } from './types';

const browserClient = createApiClient();

export type ImportJobStatus =
  | 'UPLOADED'
  | 'PREVIEWED'
  | 'MAPPED'
  | 'VALIDATED'
  | 'DRY_RUN_READY'
  | 'COMMITTING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'CANCELLED';

export type ImportJobResponse = {
  importJobId: string;
  importType: 'SYNTHETIC_REFERENCE_RECORDS';
  status: ImportJobStatus;
  source: { mediaType: string; sizeBytes: number };
  sourceHeaders?: string[];
  mapping: Record<string, string> | null;
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
};

export type ImportJobsPageResponse = {
  items: ImportJobResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type ImportRowResponse = {
  importRowId: string;
  rowNumber: number;
  normalizedInput: Record<string, string | null> | null;
  validationStatus: 'PENDING' | 'VALID' | 'INVALID';
  validationErrors: string[];
  dryRunOutcome: 'PENDING' | 'CREATE' | 'UPDATE' | 'UNCHANGED' | 'REJECTED';
  commitOutcome: 'PENDING' | 'CREATED' | 'UPDATED' | 'UNCHANGED' | 'REJECTED' | 'FAILED';
  targetType: string | null;
  targetId: string | null;
};

export type ImportJobRowsPageResponse = {
  items: ImportRowResponse[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export async function listImportJobs(page: number, pageSize: number, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobsPageResponse>> {
  return request(() => client.get<ImportJobsPageResponse>('/api/v1/admin/import-jobs', { params: { page, pageSize }, headers: bearer(accessToken) }));
}

export async function getImportJob(importJobId: string, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  return request(() => client.get<ImportJobResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}`, { headers: bearer(accessToken) }));
}

export async function createImportJob(file: File, idempotencyKey: string, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  const body = new FormData();
  body.append('importType', 'SYNTHETIC_REFERENCE_RECORDS');
  body.append('source', file);
  return request(() => client.post<ImportJobResponse>('/api/v1/admin/import-jobs', body, { headers: { ...bearer(accessToken), 'Idempotency-Key': idempotencyKey } }));
}

export async function previewImportJob(importJobId: string, expectedVersion: number, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  return request(() => client.post<ImportJobResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}/preview`, { expectedVersion }, { headers: bearer(accessToken) }));
}

export async function updateImportMapping(importJobId: string, expectedVersion: number, mapping: Record<string, string>, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  return request(() => client.put<ImportJobResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}/mapping`, { expectedVersion, mapping }, { headers: bearer(accessToken) }));
}

export async function validateImportJob(importJobId: string, expectedVersion: number, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  return request(() => client.post<ImportJobResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}/validate`, { expectedVersion }, { headers: bearer(accessToken) }));
}

export async function dryRunImportJob(importJobId: string, expectedVersion: number, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  return request(() => client.post<ImportJobResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}/dry-run`, { expectedVersion }, { headers: bearer(accessToken) }));
}

export async function commitImportJob(importJobId: string, expectedVersion: number, idempotencyKey: string, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobResponse>> {
  return request(() => client.post<ImportJobResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}/commit`, { expectedVersion }, { headers: { ...bearer(accessToken), 'Idempotency-Key': idempotencyKey } }));
}

export async function listImportRows(importJobId: string, page: number, pageSize: number, accessToken: string, client: AxiosInstance = browserClient): Promise<ApiResult<ImportJobRowsPageResponse>> {
  return request(() => client.get<ImportJobRowsPageResponse>(`/api/v1/admin/import-jobs/${encodeURIComponent(importJobId)}/rows`, { params: { page, pageSize }, headers: bearer(accessToken) }));
}

function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function request<T>(call: () => Promise<AxiosResponse<T>>): Promise<ApiResult<T>> {
  try {
    const response = await call();
    return {
      data: response.data,
      requestId: readHeader(response.headers['x-request-id']),
      idempotencyReplayed: readHeader(response.headers['idempotency-replayed']) === 'true',
    };
  } catch (error) {
    throw toApiFailure(error);
  }
}

function readHeader(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function newImportIdempotencyKey(scope: 'create' | 'commit') {
  return `${scope}-${crypto.randomUUID()}-${Date.now()}`;
}
