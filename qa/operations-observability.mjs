import { mkdir, writeFile } from 'node:fs/promises';

const baseUrl = process.env.QA_BASE_URL ?? 'http://127.0.0.1:3000';

function assert(condition, message) {
  if (!condition) throw new Error(`OPERATIONS_OBSERVABILITY_ASSERTION_FAILED: ${message}`);
}

async function request(path, { method = 'GET', body, requestId } = {}) {
  const headers = {};
  if (requestId) headers['x-request-id'] = requestId;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${path}, got ${text.slice(0, 300)}`);
  }
  return { response, payload };
}

const checks = [];

const liveRequestId = 'ops-live-001';
const live = await request('/health/live', { requestId: liveRequestId });
assert(live.response.status === 200, `liveness returned ${live.response.status}`);
assert(live.payload.status === 'ok', 'liveness payload must be ok');
assert(live.response.headers.get('x-request-id') === liveRequestId, 'liveness must preserve valid X-Request-Id');
checks.push('liveness');

const readyRequestId = 'ops-ready-001';
const ready = await request('/health/ready', { requestId: readyRequestId });
assert(ready.response.status === 200, `readiness returned ${ready.response.status}`);
assert(ready.payload.status === 'ok', 'readiness payload must be ok');
assert(ready.payload.components?.process === 'ready', 'readiness process component must be ready');
assert(ready.response.headers.get('x-request-id') === readyRequestId, 'readiness must preserve valid X-Request-Id');
checks.push('readiness');

const problemRequestId = 'ops-problem-001';
const problem = await request('/api/v1/public/claim-tracking', {
  method: 'POST',
  requestId: problemRequestId,
  body: { trackingCode: 'OPS-NOT-FOUND', policyReference: 'SYN-POL-001' },
});
assert(problem.response.status === 404, `synthetic missing claim must return 404, got ${problem.response.status}`);
assert((problem.response.headers.get('content-type') ?? '').startsWith('application/problem+json'), 'error must use Problem Details media type');
assert(problem.payload.code === 'CLAIM_NOT_FOUND', `unexpected problem code ${problem.payload.code}`);
assert(problem.payload.requestId === problemRequestId, 'Problem Details must preserve correlation id');
assert(problem.response.headers.get('x-request-id') === problemRequestId, 'error response header must preserve correlation id');
assert(!JSON.stringify(problem.payload).includes('/home/runner'), 'Problem Details must not leak runner paths');
assert(!JSON.stringify(problem.payload).includes('SELECT '), 'Problem Details must not leak SQL');
checks.push('problem_details_correlation');

const invalid = await request('/health/live', { requestId: 'invalid request id with spaces' });
const generated = invalid.response.headers.get('x-request-id') ?? '';
assert(invalid.response.status === 200, 'liveness with invalid caller id must still succeed');
assert(generated !== 'invalid request id with spaces', 'invalid caller request id must not be trusted');
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generated), `replacement request id must be UUIDv4, got ${generated}`);
checks.push('request_id_hardening');

await mkdir('.runtime', { recursive: true });
const evidence = {
  event: 'OPERATIONS_OBSERVABILITY_RUNTIME_PASS',
  reviewedCommit: process.env.GITHUB_SHA ?? null,
  checks,
  endpoints: ['/health/live', '/health/ready'],
  correlation: {
    acceptedRequestId: liveRequestId,
    problemRequestId,
    invalidCallerIdReplaced: true,
  },
  scope: 'repository-local MVP operational evidence; no FAR production infrastructure claim',
};
await writeFile('.runtime/operations-observability.json', `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence));
