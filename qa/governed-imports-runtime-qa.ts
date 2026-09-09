import { createProductionRuntimeFromEnv } from '@insurance/infrastructure';
import { DurableAsyncWorker } from '../apps/worker/src/worker.js';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';
const operatorLogin = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const runtime = await createProductionRuntimeFromEnv();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`GOVERNED_IMPORTS_QA_ASSERTION_FAILED: ${message}`);
}

async function jsonResult(response: Response) {
  const text = await response.text();
  try { return JSON.parse(text) as any; }
  catch { throw new Error(`Expected JSON from ${response.url}, got: ${text.slice(0, 300)}`); }
}

async function jsonRequest(path: string, options: { method?: string; body?: unknown; token?: string; requestId?: string; idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.requestId) headers['x-request-id'] = options.requestId;
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, payload: await jsonResult(response) };
}

function assertProblem(result: Awaited<ReturnType<typeof jsonRequest>>, status: number, code: string) {
  assert(result.response.status === status, `expected HTTP ${status}, got ${result.response.status}`);
  assert((result.response.headers.get('content-type') ?? '').startsWith('application/problem+json'), 'error must use Problem Details');
  assert(result.payload.code === code, `expected ${code}, got ${result.payload.code}`);
  assert(result.payload.status === status, `Problem Details status must be ${status}`);
}

// Prior API-QA suites intentionally exercise the public staff login endpoint and its shared
// 5/minute/IP transport limit. Governed Imports needs authenticated staff contexts, not another
// login-rate-limit test, so issue tokens through the same production AccessTokenPort for the
// already-seeded synthetic QA identities. JWT verification and RBAC still occur at the API boundary.
const operatorToken = await runtime.accessTokens.issue({
  id: '00000000-0000-4000-8000-000000000099',
  login: operatorLogin,
  role: 'CLAIMS_OPERATOR',
}, 900);
const adminToken = await runtime.accessTokens.issue({
  id: '00000000-0000-4000-8000-000000000098',
  login: adminLogin,
  role: 'PLATFORM_ADMIN',
}, 900);

console.log('QA Imports: least privilege');
const forbidden = await jsonRequest('/api/v1/admin/import-jobs', { token: operatorToken, requestId: 'qa-import-forbidden' });
assertProblem(forbidden, 403, 'FORBIDDEN');

console.log('QA Imports: create multipart source');
const csv = [
  'ref,label,class',
  'SYN-QA-IMPORT-A,Synthetic QA Alpha,PRIMARY',
  'SYN-QA-IMPORT-B,,SECONDARY',
].join('\n');
const form = new FormData();
form.set('importType', 'SYNTHETIC_REFERENCE_RECORDS');
form.set('source', new Blob([csv], { type: 'text/csv' }), 'synthetic-qa-import.csv');
const createResponse = await fetch(`${baseUrl}/api/v1/admin/import-jobs`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${adminToken}`,
    'idempotency-key': 'qa-import-create-idempotency-0001',
    'x-request-id': 'qa-import-create',
  },
  body: form,
});
const created = await jsonResult(createResponse);
assert(createResponse.status === 201, `createImportJob must return 201, got ${createResponse.status}`);
assert(created.status === 'UPLOADED' && created.version === 1, 'new ImportJob must be UPLOADED version 1');
const importJobId = created.importJobId as string;
assert(typeof importJobId === 'string', 'ImportJob identity must be returned');

console.log('QA Imports: preview, mapping, validation and dry run');
const preview = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/preview`, {
  method: 'POST', token: adminToken, requestId: 'qa-import-preview', body: { expectedVersion: 1 },
});
assert(preview.response.status === 200 && preview.payload.status === 'PREVIEWED' && preview.payload.version === 2, 'preview must persist PREVIEWED version 2');
assert(preview.payload.counts.total === 2, 'preview must persist two staged rows');

const invalidMapping = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/mapping`, {
  method: 'PUT', token: adminToken, requestId: 'qa-import-invalid-mapping',
  body: { expectedVersion: 2, mapping: { externalReference: 'ref', label: 'label', sql: 'class' } },
});
assertProblem(invalidMapping, 422, 'IMPORT_MAPPING_INVALID');

const mapped = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/mapping`, {
  method: 'PUT', token: adminToken, requestId: 'qa-import-mapping',
  body: { expectedVersion: 2, mapping: { externalReference: 'ref', label: 'label', classification: 'class' } },
});
assert(mapped.response.status === 200 && mapped.payload.status === 'MAPPED' && mapped.payload.version === 3, 'mapping must persist MAPPED version 3');

const stale = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/validate`, {
  method: 'POST', token: adminToken, requestId: 'qa-import-stale-validation', body: { expectedVersion: 2 },
});
assertProblem(stale, 409, 'RESOURCE_VERSION_CONFLICT');

const validated = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/validate`, {
  method: 'POST', token: adminToken, requestId: 'qa-import-validation', body: { expectedVersion: 3 },
});
assert(validated.response.status === 200 && validated.payload.status === 'VALIDATED' && validated.payload.version === 4, 'validation must persist VALIDATED version 4');
assert(validated.payload.counts.valid === 1 && validated.payload.counts.invalid === 1, 'validation counts must expose one valid and one invalid row');

const dryRun = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/dry-run`, {
  method: 'POST', token: adminToken, requestId: 'qa-import-dry-run', body: { expectedVersion: 4 },
});
assert(dryRun.response.status === 200 && dryRun.payload.status === 'DRY_RUN_READY' && dryRun.payload.version === 5, 'dry run must persist DRY_RUN_READY version 5');

const dryRows = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/rows?page=1&pageSize=10`, { token: adminToken, requestId: 'qa-import-rows-dry' });
assert(dryRows.response.status === 200 && dryRows.payload.totalItems === 2, 'row listing must return persisted rows');
assert(dryRows.payload.items[0].dryRunOutcome === 'CREATE' && dryRows.payload.items[1].dryRunOutcome === 'REJECTED', 'dry run must classify CREATE and REJECTED without mutation');

console.log('QA Imports: async commit through durable Worker');
const commit = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/commit`, {
  method: 'POST', token: adminToken, requestId: 'qa-import-commit', idempotencyKey: 'qa-import-commit-idempotency-0001',
  body: { expectedVersion: 5 },
});
assert(commit.response.status === 202 && commit.payload.status === 'COMMITTING' && commit.payload.version === 6, 'commit request must return 202 COMMITTING version 6');

const commitReplay = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/commit`, {
  method: 'POST', token: adminToken, requestId: 'qa-import-commit-replay', idempotencyKey: 'qa-import-commit-idempotency-0001',
  body: { expectedVersion: 5 },
});
assert(commitReplay.response.status === 202, 'same commit idempotency key must replay original logical 202 response');
assert(commitReplay.response.headers.get('idempotency-replayed') === 'true', 'commit replay must advertise Idempotency-Replayed');

const worker = new DurableAsyncWorker(runtime, 'qa-import-worker');
const workerResult = await worker.tick();
assert(workerResult.inspected >= 1, 'Worker must inspect the durable import job');
assert(workerResult.succeeded >= 1, 'Worker must successfully finish the durable import job');

const terminal = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}`, { token: adminToken, requestId: 'qa-import-terminal' });
assert(terminal.response.status === 200, 'terminal ImportJob must remain queryable');
assert(terminal.payload.status === 'COMPLETED_WITH_ERRORS' && terminal.payload.version === 7, 'row-partial import must finish COMPLETED_WITH_ERRORS version 7');
assert(terminal.payload.counts.committed === 1 && terminal.payload.counts.rejected === 1 && terminal.payload.counts.failed === 0, 'terminal counts must preserve row-partial outcomes');

const finalRows = await jsonRequest(`/api/v1/admin/import-jobs/${importJobId}/rows?page=1&pageSize=10`, { token: adminToken, requestId: 'qa-import-rows-final' });
assert(finalRows.payload.items[0].commitOutcome === 'CREATED' && finalRows.payload.items[1].commitOutcome === 'REJECTED', 'row commit outcomes must persist CREATED and REJECTED');

console.log(JSON.stringify({
  event: 'GOVERNED_IMPORTS_RUNTIME_QA_PASS',
  importJobId,
  checks: ['rbac', 'postgresql', 'preview-no-mutation', 'mapping-allowlist', 'validation', 'dry-run-no-mutation', 'optimistic-concurrency', 'idempotency', 'worker', 'row-partial-commit'],
}));
