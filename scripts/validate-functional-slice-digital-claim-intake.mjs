import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const slicePath = '.blueprint/functional-slices/digital-claim-intake.web.json';
const slice = json(slicePath);
const inventory = json('.blueprint/ui/interface-inventory.json');
const architecture = json('.blueprint/client-architecture/digital-claim-intake.web.json');
const design = json('.blueprint/ui/design-system.json');
const pkg = json('apps/web/package.json');

const expectedIds = ['WEB-002', 'WEB-003', 'WEB-004', 'WEB-005'];
const expectedOps = ['verifyPolicyVehicle', 'createClaim'];
const expectedRoutes = ['/claims/new/verify', '/claims/new', '/claims/new/review', '/claims/new/success'];

assert(slice.id === 'digital-claim-intake' && slice.platform === 'web', 'slice identity must be digital-claim-intake/web');
assert(JSON.stringify(slice.inventory_ids) === JSON.stringify(expectedIds), 'slice inventory ids must exactly match WEB-002..WEB-005');
assert(JSON.stringify(slice.api_binding.operation_ids) === JSON.stringify(expectedOps), 'slice operationIds must exactly match verifyPolicyVehicle/createClaim');
assert(slice.api_binding.revision === 'api-v1-r1', 'slice must bind api-v1-r1');
assert(slice.client_architecture.gate_status === 'PASS', 'Client Architecture gate must be PASS before functional delivery');
assert(['IN_PROGRESS', 'FUNCTIONAL', 'ACCEPTED'].includes(slice.lifecycle_status), 'slice lifecycle must progress only through IN_PROGRESS, FUNCTIONAL or ACCEPTED');

const inventoryItems = new Map(inventory.items.map((item) => [item.id, item]));
for (const id of expectedIds) {
  const item = inventoryItems.get(id);
  assert(item, `missing inventory item ${id}`);
  assert(item.slice_id === 'digital-claim-intake', `${id} must remain in digital-claim-intake`);
  assert(item.unresolved_api_needs.length === 0, `${id} cannot have unresolved API needs`);
}

assert(JSON.stringify(architecture.inventory_ids) === JSON.stringify(expectedIds), 'client architecture inventory binding drift');
assert(JSON.stringify(architecture.api_binding.operation_ids) === JSON.stringify(expectedOps), 'client architecture operation binding drift');
assert(JSON.stringify(architecture.routing.routes) === JSON.stringify(expectedRoutes), 'client architecture route binding drift');
assert(architecture.implementation_guardrails.api_authoritative === true, 'API must remain authoritative');
assert(architecture.implementation_guardrails.no_new_api_behavior === true, 'slice cannot invent API behavior');

const app = read('apps/web/src/App.tsx');
for (const route of expectedRoutes) assert(app.includes(`path=\"${route}\"`), `missing route ${route}`);

const claimsApi = read('apps/web/src/api/claims.ts');
const intakeStart = claimsApi.indexOf('export async function verifyPolicyVehicle');
const trackingStart = claimsApi.indexOf('export async function trackClaim');
assert(intakeStart >= 0 && trackingStart > intakeStart, 'intake API function boundaries must be discoverable');
const intakeApi = claimsApi.slice(intakeStart, trackingStart);
assert(intakeApi.includes('/api/v1/public/policy-verifications'), 'verifyPolicyVehicle must use canonical REST path');
assert(intakeApi.includes('/api/v1/public/claims'), 'createClaim must use canonical REST path');
assert(intakeApi.includes("'Idempotency-Key'"), 'createClaim must emit Idempotency-Key');
assert(intakeApi.includes("formData.append('evidence'"), 'createClaim must send evidence as multipart');
assert(!intakeApi.includes('/legacy/'), 'intake web client must never call simulated legacy directly');
assert(!intakeApi.includes('Authorization'), 'anonymous intake operations must not invent operator authorization');

const client = read('apps/web/src/api/client.ts');
assert(client.includes("'X-Request-Id'"), 'web transport must emit X-Request-Id');
assert(client.includes('network = !error.response'), 'network/offline failures must be classified explicitly');
assert(client.includes("'retry-after'"), 'rate-limit Retry-After must be preserved');

const errorNotice = read('apps/web/src/components/ApiErrorNotice.tsx');
for (const status of ['case 409:', 'case 422:', 'case 429:', 'case 503:']) {
  assert(errorNotice.includes(status), `missing explicit API error state ${status}`);
}
assert(errorNotice.includes('failure.network'), 'missing explicit network/offline state');
assert(errorNotice.includes('aria-live="assertive"'), 'API error notice must announce runtime failures accessibly');

const context = read('apps/web/src/flow/ClaimFlowContext.tsx');
assert(context.includes('crypto.randomUUID()'), 'idempotency key must be generated client-side per explicit intent');
assert(!context.includes('localStorage') && !context.includes('sessionStorage'), 'claim flow must remain in memory');

const verifyPage = read('apps/web/src/pages/VerifyPolicyPage.tsx');
const claimPage = read('apps/web/src/pages/NewClaimPage.tsx');
const reviewPage = read('apps/web/src/pages/ReviewClaimPage.tsx');
assert(verifyPage.includes('ApiErrorNotice'), 'verification page must render normalized API failures');
assert(reviewPage.includes('ApiErrorNotice'), 'review page must render normalized API failures');
assert(verifyPage.includes('aria-describedby'), 'verification form errors/hints must be programmatically associated');
assert(claimPage.includes('aria-describedby'), 'claim form errors/hints must be programmatically associated');
assert(claimPage.includes('aria-invalid'), 'claim form must expose validation state');
assert(claimPage.includes('role="alert"'), 'evidence validation errors must be announced');
assert(claimPage.includes('image/jpeg,image/png,application/pdf'), 'evidence accept list must match approved client guardrail');
assert(claimPage.includes('Texto libre según el contrato API'), 'event type must remain free text rather than an invented authoritative catalog');

const styles = read('apps/web/src/styles.css');
assert(styles.includes('@media (max-width: 900px)'), 'tablet responsive contract missing');
assert(styles.includes('@media (max-width: 640px)'), 'mobile responsive contract missing');
assert(styles.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion accessibility contract missing');
assert(styles.includes(':focus-visible'), 'visible keyboard focus contract missing');
assert(styles.includes('min-height:44px'), 'minimum touch-target contract missing');

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

const requiredDeps = ['react', 'react-router-dom', '@tanstack/react-query', 'axios', 'react-hook-form', 'zod'];
for (const dep of requiredDeps) assert(pkg.dependencies?.[dep], `missing approved client dependency ${dep}`);
assert(pkg.dependencies.axios === '1.20.0', 'Axios security baseline drift');
assert(pkg.dependencies['react-router-dom'] === '7.18.3', 'React Router DOM security baseline drift');
assert(pkg.dependencies.react === '19.2.8' && pkg.dependencies['react-dom'] === '19.2.8', 'React runtime versions must remain aligned');
assert(pkg.dependencies.zod === '4.5.4', 'Zod baseline drift');
assert(pkg.devDependencies?.tailwindcss, 'Tailwind CSS must remain present');

assert(design.identity.logo_required === true, 'approved FAR identity requires logo');
assert(read('apps/web/src/components/PublicShell.tsx').includes('/far-seguros-logo.svg'), 'public shell must use approved logo asset');
assert(styles.includes('#00bed8'), 'web styling must preserve FAR primary cyan token');
assert(styles.includes('#fef200'), 'web styling must preserve FAR yellow accent token');

for (const testFile of [
  'apps/web/src/flow/evidence.test.ts',
  'apps/web/src/pages/HomePage.test.tsx',
  'apps/web/src/components/ApiErrorNotice.test.ts',
]) {
  assert(fs.existsSync(path.join(root, testFile)), `missing web test ${testFile}`);
}

const runtimeQa = read('qa/web-digital-claim-intake-runtime.ts');
assert(runtimeQa.includes('idempotencyReplay'), 'runtime QA must verify createClaim idempotent replay');
assert(runtimeQa.includes('inactiveEligibilityRejected'), 'runtime QA must prove authoritative eligibility rejection');
assert(runtimeQa.includes('verification.requestId'), 'runtime QA must prove correlation id propagation');

console.log(JSON.stringify({
  event: 'FUNCTIONAL_SLICE_CONTRACT_VALID',
  slice: 'digital-claim-intake',
  platform: 'web',
  inventory: expectedIds,
  operationIds: expectedOps,
  routes: expectedRoutes,
  apiAuthoritative: true,
  durableBrowserBusinessStorage: false,
  approvedFARIdentityBound: true,
  explicitApiErrorStates: [409, 422, 429, 503, 'network'],
  responsiveContracts: [900, 640],
  accessibilityContracts: ['focus-visible', 'aria-describedby', 'aria-live', 'reduced-motion'],
  productionDependencySecurityBaseline: {
    axios: pkg.dependencies.axios,
    reactRouterDom: pkg.dependencies['react-router-dom'],
  },
}));
