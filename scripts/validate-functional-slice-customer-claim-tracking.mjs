import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const slice = json('.blueprint/functional-slices/customer-claim-tracking.web.json');
const inventory = json('.blueprint/ui/interface-inventory.json');
const architecture = json('.blueprint/client-architecture/customer-claim-tracking.web.json');
const pkg = json('apps/web/package.json');

const expectedIds = ['WEB-006', 'WEB-007'];
const expectedOps = ['trackClaim'];
const expectedRoutes = ['/claims/track', '/claims/track/status'];

assert(slice.id === 'customer-claim-tracking' && slice.platform === 'web', 'slice identity must be customer-claim-tracking/web');
assert(JSON.stringify(slice.inventory_ids) === JSON.stringify(expectedIds), 'tracking slice inventory ids must exactly match WEB-006/WEB-007');
assert(JSON.stringify(slice.api_binding.operation_ids) === JSON.stringify(expectedOps), 'tracking slice must bind only trackClaim');
assert(slice.api_binding.revision === 'api-v1-r1', 'tracking slice must bind api-v1-r1');
assert(slice.client_architecture.gate_status === 'PASS', 'Client Architecture gate must remain PASS');
assert(['IN_PROGRESS', 'FUNCTIONAL'].includes(slice.lifecycle_status), 'tracking lifecycle must be IN_PROGRESS until human gate PASS, then FUNCTIONAL');

const inventoryItems = new Map(inventory.items.map((item) => [item.id, item]));
for (const id of expectedIds) {
  const item = inventoryItems.get(id);
  assert(item, `missing inventory item ${id}`);
  assert(item.slice_id === 'customer-claim-tracking', `${id} must remain in customer-claim-tracking`);
  assert(item.unresolved_api_needs.length === 0, `${id} cannot have unresolved API needs`);
}

assert(JSON.stringify(architecture.inventory_ids) === JSON.stringify(expectedIds), 'client architecture inventory binding drift');
assert(JSON.stringify(architecture.api_binding.operation_ids) === JSON.stringify(expectedOps), 'client architecture operation binding drift');
assert(JSON.stringify(architecture.routing.routes) === JSON.stringify(expectedRoutes), 'client architecture route binding drift');
assert(architecture.async_states['404'] === 'REQUIRED', 'tracking 404 state must remain required');
assert(architecture.async_states['429'] === 'REQUIRED', 'tracking 429 state must remain required');
assert(architecture.async_states.offline === 'REQUIRED', 'tracking offline state must remain required');

const app = read('apps/web/src/App.tsx');
for (const route of expectedRoutes) assert(app.includes(`path=\"${route}\"`), `missing tracking route ${route}`);

const claimsApi = read('apps/web/src/api/claims.ts');
assert(claimsApi.includes('export async function trackClaim'), 'trackClaim API client function missing');
assert(claimsApi.includes('/api/v1/public/claim-tracking'), 'trackClaim must use canonical REST path');
assert(!claimsApi.includes('/mcp'), 'web client must not call MCP');
assert(!claimsApi.includes('/legacy/'), 'web client must not call simulated legacy directly');

const trackingContext = read('apps/web/src/flow/TrackingFlowContext.tsx');
for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB']) {
  assert(!trackingContext.includes(forbidden), `tracking proof must not use durable browser storage: ${forbidden}`);
}
assert(trackingContext.includes('proof: TrackClaimRequest'), 'tracking proof must be retained only in typed in-memory context for explicit refresh');

const lookup = read('apps/web/src/pages/TrackClaimPage.tsx');
assert(lookup.includes('ApiErrorNotice'), 'tracking lookup must render normalized API failures');
assert(lookup.includes('aria-describedby'), 'tracking form hints/errors must be programmatically associated');
assert(lookup.includes('indicamos cuál de los dos datos'), 'lookup must explain privacy-safe non-disclosure without identifying failed proof element');

const status = read('apps/web/src/pages/ClaimStatusPage.tsx');
assert(status.includes('trackClaim(tracking.state.proof)'), 'explicit refresh must refetch canonical trackClaim state');
assert(status.includes('Historial visible'), 'customer-safe timeline presentation missing');
assert(status.includes('No expone auditoría'), 'status page must state customer-safe projection boundary');
assert(status.includes('empty-state'), 'tracking status must render explicit empty states');
assert(!status.includes('auditEvents') && !status.includes('operatorNotes') && !status.includes('internal'), 'tracking page must not render internal/backoffice fields');

const errorNotice = read('apps/web/src/components/ApiErrorNotice.tsx');
assert(errorNotice.includes('case 404:'), 'privacy-safe tracking 404 presentation missing');
assert(errorNotice.includes('case 429:'), 'tracking rate limit presentation missing');
assert(errorNotice.includes('failure.network'), 'tracking offline/network presentation missing');

const home = read('apps/web/src/pages/HomePage.tsx');
assert(home.includes('to="/claims/track"'), 'public landing must expose approved tracking entry');
const receipt = read('apps/web/src/pages/ClaimSubmittedPage.tsx');
assert(receipt.includes("navigate('/claims/track')"), 'claim receipt must expose approved tracking destination');

const trackingStyles = read('apps/web/src/tracking.css');
assert(trackingStyles.includes('@media (max-width: 900px)'), 'tracking tablet/mobile responsive contract missing');
assert(trackingStyles.includes('@media (max-width: 640px)'), 'tracking compact mobile contract missing');
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

const errorTests = read('apps/web/src/components/ApiErrorNotice.test.ts');
assert(errorTests.includes('privacy-safe not-found'), 'tracking 404 unit coverage missing');

const runtimeQa = read('qa/web-customer-claim-tracking-runtime.ts');
assert(runtimeQa.includes('TRACKING_RUNTIME_PASS'), 'tracking runtime QA completion marker missing');
assert(runtimeQa.includes('invalidProofCollapsedTo404'), 'runtime QA must prove invalid proof collapse');
assert(runtimeQa.includes('customerSafeProjection'), 'runtime QA must prove customer-safe projection');

console.log(JSON.stringify({
  event: 'FUNCTIONAL_SLICE_CONTRACT_VALID',
  slice: 'customer-claim-tracking',
  platform: 'web',
  inventory: expectedIds,
  operationIds: expectedOps,
  routes: expectedRoutes,
  sensitiveProofStorage: 'memory-only',
  explicitApiErrorStates: [404, 429, 'network'],
  customerSafeProjection: true,
}));
