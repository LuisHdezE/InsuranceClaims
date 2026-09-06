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

const app = read('apps/web/src/App.tsx');
for (const route of expectedRoutes) assert(app.includes(`path=\"${route}\"`), `missing route ${route}`);

const claimsApi = read('apps/web/src/api/claims.ts');
assert(claimsApi.includes('/api/v1/public/policy-verifications'), 'verifyPolicyVehicle must use canonical REST path');
assert(claimsApi.includes('/api/v1/public/claims'), 'createClaim must use canonical REST path');
assert(claimsApi.includes("'Idempotency-Key'"), 'createClaim must emit Idempotency-Key');
assert(claimsApi.includes("formData.append('evidence'"), 'createClaim must send evidence as multipart');
assert(!claimsApi.includes('/legacy/'), 'web client must never call simulated legacy directly');

const context = read('apps/web/src/flow/ClaimFlowContext.tsx');
assert(context.includes('crypto.randomUUID()'), 'idempotency key must be generated client-side per explicit intent');
assert(!context.includes('localStorage') && !context.includes('sessionStorage'), 'claim flow must remain in memory');

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
assert(pkg.devDependencies?.tailwindcss, 'Tailwind CSS must remain present');

assert(design.identity.logo_required === true, 'approved FAR identity requires logo');
assert(read('apps/web/src/components/PublicShell.tsx').includes('/far-seguros-logo.svg'), 'public shell must use approved logo asset');
assert(read('apps/web/src/styles.css').includes('#00bed8'), 'web styling must preserve FAR primary cyan token');
assert(read('apps/web/src/styles.css').includes('#fef200'), 'web styling must preserve FAR yellow accent token');

for (const testFile of ['apps/web/src/flow/evidence.test.ts', 'apps/web/src/pages/HomePage.test.tsx']) {
  assert(fs.existsSync(path.join(root, testFile)), `missing web test ${testFile}`);
}

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
}));
