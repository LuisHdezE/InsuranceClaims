import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const slice = json('.blueprint/functional-slices/claims-backoffice.web.json');
const inventory = json('.blueprint/ui/interface-inventory.json');
const architecture = json('.blueprint/client-architecture/claims-backoffice.web.json');
const pkg = json('apps/web/package.json');

const expectedIds = ['WEB-008', 'WEB-009', 'WEB-010'];
const expectedOps = ['authenticateOperator', 'listClaims', 'getClaimDetail', 'downloadClaimEvidence', 'transitionClaimStatus'];
const expectedRoutes = ['/operator/login', '/operator/claims', '/operator/claims/:claimId'];

assert(slice.id === 'claims-backoffice' && slice.platform === 'web', 'slice identity must be claims-backoffice/web');
assert(JSON.stringify(slice.inventory_ids) === JSON.stringify(expectedIds), 'backoffice inventory ids must exactly match WEB-008/WEB-009/WEB-010');
assert(JSON.stringify(slice.api_binding.operation_ids) === JSON.stringify(expectedOps), 'backoffice operation binding drift');
assert(slice.api_binding.revision === 'api-v1-r1', 'backoffice slice must bind api-v1-r1');
assert(slice.client_architecture.gate_status === 'PASS', 'Client Architecture gate must remain PASS');
assert(['IN_PROGRESS', 'FUNCTIONAL'].includes(slice.lifecycle_status), 'backoffice lifecycle must remain IN_PROGRESS until human gate PASS');
assert(['PENDING', 'PASS'].includes(slice.definition_of_done.status), 'backoffice DoD must be PENDING until evidence closes it, then PASS');
assert(slice.definition_of_done.checks.idempotency === 'N/A', 'backoffice idempotency must be N/A; expectedFromStatus is concurrency control, not an idempotency key');

const inventoryItems = new Map(inventory.items.map((item) => [item.id, item]));
for (const id of expectedIds) {
  const item = inventoryItems.get(id);
  assert(item, `missing inventory item ${id}`);
  assert(item.slice_id === 'claims-backoffice', `${id} must remain in claims-backoffice`);
  assert(item.unresolved_api_needs.length === 0, `${id} cannot have unresolved API needs`);
}

assert(JSON.stringify(architecture.inventory_ids) === JSON.stringify(expectedIds), 'client architecture inventory binding drift');
assert(JSON.stringify(architecture.api_binding.operation_ids) === JSON.stringify(expectedOps), 'client architecture operation binding drift');
assert(JSON.stringify(architecture.routing.routes) === JSON.stringify(expectedRoutes), 'client architecture route binding drift');
assert(JSON.stringify(architecture.api_binding.permissions) === JSON.stringify(['claims.backoffice.read', 'claims.backoffice.transition']), 'backoffice permission intent drift');
for (const state of ['401', '403', '404', '409', '422', '429', 'offline']) {
  assert(architecture.async_states[state] === 'REQUIRED', `backoffice ${state} state must remain required`);
}
assert(architecture.idempotency.required_operations.length === 0, 'backoffice must not invent Idempotency-Key requirements');

const app = read('apps/web/src/App.tsx');
for (const route of expectedRoutes) assert(app.includes(`path=\"${route}\"`), `missing backoffice route ${route}`);
assert(app.includes('RequireOperator'), 'protected routes must use RequireOperator');

const claimsApi = read('apps/web/src/api/claims.ts');
for (const fn of expectedOps) assert(claimsApi.includes(`export async function ${fn}`), `missing API client function ${fn}`);
for (const canonicalPath of ['/api/v1/operator/auth/login', '/api/v1/operator/claims']) assert(claimsApi.includes(canonicalPath), `missing canonical operator path ${canonicalPath}`);
assert(claimsApi.includes('Authorization: `Bearer ${accessToken}`'), 'protected API calls must carry bearer auth');
assert(claimsApi.includes("responseType: 'arraybuffer'"), 'evidence download must use protected binary response handling');
assert(!claimsApi.includes('Idempotency-Key'), 'backoffice operations must not invent Idempotency-Key behavior');
assert(!claimsApi.includes('/mcp') && !claimsApi.includes('/legacy/'), 'web backoffice must not bypass REST API boundary');

const session = read('apps/web/src/flow/OperatorSessionContext.tsx');
for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB']) assert(!session.includes(forbidden), `operator token must remain memory-only: ${forbidden}`);
assert(session.includes('response.expiresIn * 1000'), 'session expiry must derive from canonical login response');
assert(session.includes("queryClient.removeQueries({ queryKey: ['operator'] })"), 'logout/401 lifecycle must clear protected cache');

const login = read('apps/web/src/pages/OperatorLoginPage.tsx');
assert(login.includes('authenticateOperator'), 'operator login must call canonical authenticateOperator');
assert(login.includes('900 segundos'), 'operator login must communicate short-lived token lifecycle');
assert(!login.toLowerCase().includes('refresh token'), 'UI must not invent a refresh token flow');

const list = read('apps/web/src/pages/OperatorClaimsPage.tsx');
assert(list.includes('listClaims'), 'claims list must use canonical listClaims');
assert(list.includes('pageSize: 20'), 'claims list must use approved pagination');
assert(list.includes('filtered') || list.includes('filtro'), 'claims list must expose filtered-empty semantics');
assert(list.includes('status-badge'), 'claims list must present textual status badges');

const detail = read('apps/web/src/pages/OperatorClaimDetailPage.tsx');
for (const fn of ['getClaimDetail', 'downloadClaimEvidence', 'transitionClaimStatus']) assert(detail.includes(fn), `claim detail must use ${fn}`);
assert(detail.includes('detail.allowedTransitions.map'), 'transition options must come only from server allowedTransitions');
assert(detail.includes('expectedFromStatus: detail.status'), 'transition must send mandatory expectedFromStatus from authoritative detail');
assert(detail.includes("failure.problem?.status === 409"), '409 conflict recovery missing');
assert(detail.includes('await claimQuery.refetch()'), '409 conflict must refetch authoritative detail before a new decision');
assert(detail.includes('URL.revokeObjectURL'), 'evidence object URL must be released after download');
assert(detail.includes('auditEvents'), 'authorized claim detail must preserve approved audit-event projection');

const errors = read('apps/web/src/components/OperatorApiErrorNotice.tsx');
for (const status of [401, 403, 404, 409, 422, 429]) assert(errors.includes(`case ${status}:`), `operator error state ${status} missing`);
assert(errors.includes('failure.network'), 'operator offline/network presentation missing');

const publicShell = read('apps/web/src/components/PublicShell.tsx');
assert(publicShell.includes('to="/operator/login"'), 'public entry must expose approved operator login journey');
const styles = read('apps/web/src/backoffice.css');
assert(styles.includes('@media (max-width: 900px)'), 'backoffice tablet/mobile responsive contract missing');
assert(styles.includes('@media (max-width: 720px)'), 'claims table mobile card transformation missing');
assert(read('apps/web/src/styles.css').includes(':focus-visible'), 'visible keyboard focus contract missing');

const sourceRoot = path.join(root, 'apps/web/src');
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(sourceRoot);
const allSource = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const forbidden of ['@insurance/infrastructure', '@prisma', 'PrismaClient', '/legacy/v1/', 'indexedDB', 'localStorage', 'sessionStorage']) {
  assert(!allSource.includes(forbidden), `forbidden client dependency/persistence marker: ${forbidden}`);
}

assert(pkg.dependencies.axios === '1.20.0', 'Axios security baseline drift');
assert(pkg.dependencies['react-router-dom'] === '7.18.3', 'React Router DOM security baseline drift');
assert(pkg.dependencies.react === '19.2.8' && pkg.dependencies['react-dom'] === '19.2.8', 'React runtime versions must remain aligned');

const errorTests = read('apps/web/src/components/OperatorApiErrorNotice.test.ts');
assert(errorTests.includes('authoritative refresh conflict'), 'backoffice 409 unit coverage missing');
assert(errorTests.includes('authorization server-authoritative'), 'backoffice 403 unit coverage missing');
const runtimeQa = read('qa/web-claims-backoffice-runtime.ts');
for (const marker of ['BACKOFFICE_RUNTIME_PASS', 'protectedReadRejectedWithoutValidToken', 'evidenceDownloadProtected', 'staleTransitionConflict', 'transitionCommitted']) {
  assert(runtimeQa.includes(marker), `runtime QA marker missing: ${marker}`);
}

console.log(JSON.stringify({
  event: 'FUNCTIONAL_SLICE_CONTRACT_VALID',
  slice: 'claims-backoffice',
  platform: 'web',
  inventory: expectedIds,
  operationIds: expectedOps,
  routes: expectedRoutes,
  tokenStorage: 'memory-only',
  idempotency: 'N/A',
  concurrencyGuard: 'expectedFromStatus',
  explicitApiErrorStates: [401, 403, 404, 409, 422, 429, 'network'],
}));
