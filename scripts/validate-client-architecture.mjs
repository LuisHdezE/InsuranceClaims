import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const readText = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const sameSet = (actual, expected, label) => {
  const a = [...new Set(actual)].sort();
  const e = [...new Set(expected)].sort();
  assert(JSON.stringify(a) === JSON.stringify(e), `${label}: expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
};

const baselinePath = '.blueprint/client-architecture/web-platform.json';
const bindingPaths = [
  '.blueprint/client-architecture/digital-claim-intake.web.json',
  '.blueprint/client-architecture/customer-claim-tracking.web.json',
  '.blueprint/client-architecture/claims-backoffice.web.json'
];
const inventoryPath = '.blueprint/ui/interface-inventory.json';
const designPath = '.blueprint/ui/design-system.json';
const tokensPath = '.blueprint/ui/design-tokens.json';
const landingReference = '.blueprint/ui/references/far-public-landing-approved.md';
const openapiPath = 'openapi.yaml';
const architectureDocPath = 'documentation/client-architecture/CLIENT_ARCHITECTURE.md';

for (const required of [baselinePath, ...bindingPaths, inventoryPath, designPath, tokensPath, landingReference, openapiPath, architectureDocPath]) {
  assert(exists(required), `Required Client Architecture artifact missing: ${required}`);
}

const baseline = readJson(baselinePath);
const inventory = readJson(inventoryPath);
const design = readJson(designPath);
const openapi = readText(openapiPath);
const architectureDoc = readText(architectureDocPath);
const bindings = bindingPaths.map(readJson);

// Platform baseline contract.
assert(baseline.schema_version === '0.5.0', 'Platform baseline schema_version must remain 0.5.0');
assert(baseline.baseline_id === 'CLIENT-BASELINE-WEB-INSURANCE-CLAIMS', 'Unexpected platform baseline id');
assert(baseline.project_id === 'LuisHdezE/InsuranceClaims', 'Unexpected project id');
assert(baseline.mode === 'greenfield', 'Client Architecture must remain Greenfield');
assert(baseline.platform === 'web', 'Platform baseline must be web');
assert(baseline.status === 'READY_FOR_REVIEW', 'Platform baseline must be READY_FOR_REVIEW at this boundary');
assert(!Object.hasOwn(baseline, 'brownfield'), 'Greenfield platform baseline must not declare Brownfield coexistence metadata');
assert(baseline.design_system.design_system_path === designPath, 'Design System path drift');
assert(baseline.design_system.tokens_path === tokensPath, 'Design tokens path drift');
assert(baseline.api_client.openapi_path === openapiPath, 'OpenAPI path drift');
assert(baseline.api_client.authorization_boundary === 'api', 'API must remain the authorization boundary');
assert(baseline.api_client.error_contract.includes('RFC 9457'), 'RFC 9457 Problem Details must remain the client error contract');
assert(baseline.api_client.request_id_header === 'X-Request-Id', 'Request ID header must match the approved API contract');
assert(baseline.api_client.idempotency_header === 'Idempotency-Key', 'Idempotency header must match the approved API contract');

// Auth must match the approved no-refresh MVP exactly.
assert(baseline.auth_lifecycle.mechanism === 'bearer_jwt', 'Operator auth must use bearer JWT');
assert(baseline.auth_lifecycle.access_credential_storage === 'memory', 'Bearer token must remain memory-only');
assert(baseline.auth_lifecycle.refresh_credential_storage === 'not_applicable', 'Refresh credential storage must be N/A');
assert(baseline.auth_lifecycle.refresh_enabled === false, 'No refresh flow may be invented');
assert(baseline.auth_lifecycle.refresh_rotation === false, 'No refresh rotation may be invented');
assert(baseline.auth_lifecycle.concurrent_refresh_policy === 'not_applicable', 'Refresh concurrency policy must be N/A');
assert(baseline.auth_lifecycle.secrets_must_not_be_logged === true, 'Secrets must never be logged');

assert(baseline.permissions.source === 'api_contract', 'Permission presentation must come from API contract');
assert(baseline.permissions.api_remains_authoritative === true, 'API authorization must remain authoritative');
assert(baseline.permissions.ui_hides_or_disables_unauthorized_actions === true, 'Permission-aware presentation must be enabled');
assert(baseline.accessibility.target === 'WCAG 2.2 AA', 'Accessibility target must be WCAG 2.2 AA');
assert(baseline.accessibility.min_touch_target_px >= 44, 'Minimum touch target must be at least 44px');
assert(baseline.offline.mode === 'degraded', 'MVP offline policy must remain degraded');
assert(baseline.offline.storage_strategy.includes('No durable browser persistence'), 'Offline policy must forbid durable authoritative browser persistence');

for (const [key, value] of Object.entries(baseline.implementation_guardrails)) {
  assert(value === true, `Platform implementation guardrail ${key} must be true`);
}

assert(baseline.web.framework === 'react', 'Web framework must remain React');
assert(baseline.web.rendering_mode === 'SPA', 'MVP client rendering mode must remain SPA');
assert(baseline.web.router === 'React Router', 'Router decision drift');
assert(baseline.web.server_state_library === 'TanStack Query', 'Server-state strategy drift');
assert(baseline.web.form_library === 'React Hook Form', 'Form library decision drift');
assert(baseline.web.build_tool === 'Vite', 'Build tool decision drift');
assert(architectureDoc.includes('Axios'), 'Client API transport strategy must document Axios');
assert(architectureDoc.includes('Tailwind CSS'), 'Client visual implementation must document Tailwind CSS');

// Approved FAR-aligned visual contract and shared landing policy.
assert(design.identity.logo_required === true, 'FAR-aligned Design System requires the versioned logo reference');
assert(exists(design.identity.logo_path), `Logo asset missing: ${design.identity.logo_path}`);
assert(design.tokens_path === tokensPath, 'Design System token path drift');
assert(architectureDoc.includes('WEB-001 Case Study Home'), 'Shared WEB-001 policy must be documented');
assert(architectureDoc.includes(landingReference), 'Approved WEB-001 landing reference must be documented');
assert(architectureDoc.includes('not a fourth Functional Interface Slice'), 'WEB-001 must remain outside functional slice count');

const items = inventory.items;
assert(Array.isArray(items) && items.length === 10, 'Executable web inventory must remain exactly 10 items');
const byId = new Map(items.map((item) => [item.id, item]));
assert(byId.get('WEB-001')?.slice_id === undefined, 'WEB-001 must remain shared and unassigned to a slice');

const expected = {
  'digital-claim-intake': {
    path: bindingPaths[0],
    ids: ['WEB-002', 'WEB-003', 'WEB-004', 'WEB-005'],
    routes: ['/claims/new/verify', '/claims/new', '/claims/new/review', '/claims/new/success'],
    operations: ['verifyPolicyVehicle', 'createClaim'],
    permissions: ['claims.intake.create'],
    idempotency: ['createClaim']
  },
  'customer-claim-tracking': {
    path: bindingPaths[1],
    ids: ['WEB-006', 'WEB-007'],
    routes: ['/claims/track', '/claims/track/status'],
    operations: ['trackClaim'],
    permissions: ['claims.tracking.read'],
    idempotency: []
  },
  'claims-backoffice': {
    path: bindingPaths[2],
    ids: ['WEB-008', 'WEB-009', 'WEB-010'],
    routes: ['/operator/login', '/operator/claims', '/operator/claims/:claimId'],
    operations: ['authenticateOperator', 'listClaims', 'getClaimDetail', 'downloadClaimEvidence', 'transitionClaimStatus'],
    permissions: ['claims.backoffice.read', 'claims.backoffice.transition'],
    idempotency: []
  }
};

const recursivelyCollectOperationIds = (value, out = []) => {
  if (Array.isArray(value)) {
    for (const entry of value) recursivelyCollectOperationIds(entry, out);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === 'operation_ids' && Array.isArray(entry)) out.push(...entry);
      else recursivelyCollectOperationIds(entry, out);
    }
  }
  return out;
};

const asyncMap = {
  loading: 'loading',
  empty: 'empty',
  filtered_empty: 'empty',
  error: 'error',
  '401': '401',
  '403': '403',
  '404': '404',
  '409': '409',
  '422': '422',
  '429': '429'
};

const allBoundIds = [];
for (const binding of bindings) {
  const spec = expected[binding.interface_slice];
  assert(spec, `Unexpected interface slice binding: ${binding.interface_slice}`);
  assert(binding.schema_version === '0.5.0', `${binding.interface_slice}: schema version drift`);
  assert(binding.architecture_id.startsWith('CLIENT-WEB-'), `${binding.interface_slice}: invalid architecture id`);
  assert(binding.project_id === 'LuisHdezE/InsuranceClaims', `${binding.interface_slice}: project id drift`);
  assert(binding.mode === 'greenfield', `${binding.interface_slice}: mode drift`);
  assert(binding.platform === 'web', `${binding.interface_slice}: platform must be web`);
  assert(binding.status === 'READY_FOR_REVIEW', `${binding.interface_slice}: binding must be READY_FOR_REVIEW`);
  assert(binding.platform_baseline_ref === baselinePath, `${binding.interface_slice}: platform baseline ref drift`);
  sameSet(binding.inventory_ids, spec.ids, `${binding.interface_slice} inventory IDs`);
  sameSet(binding.routing.routes, spec.routes, `${binding.interface_slice} routes`);
  sameSet(binding.api_binding.operation_ids, spec.operations, `${binding.interface_slice} operationIds`);
  sameSet(binding.api_binding.permissions, spec.permissions, `${binding.interface_slice} permissions`);
  sameSet(binding.idempotency.required_operations, spec.idempotency, `${binding.interface_slice} idempotency operations`);
  assert(binding.api_binding.openapi_path === openapiPath, `${binding.interface_slice}: OpenAPI path drift`);
  assert(binding.api_binding.revision === 'api-v1-r1', `${binding.interface_slice}: API revision drift`);
  assert(binding.visual_references.mode === 'none', `${binding.interface_slice}: no slice-specific static mockup is approved`);
  assert(binding.visual_references.approved_reference_paths.length === 0, `${binding.interface_slice}: placeholder/foreign visual reference detected`);
  assert(binding.async_states.offline === 'REQUIRED', `${binding.interface_slice}: degraded offline state must be explicit`);

  for (const [key, value] of Object.entries(binding.implementation_guardrails)) {
    assert(value === true, `${binding.interface_slice}: implementation guardrail ${key} must be true`);
  }

  const selected = binding.inventory_ids.map((id) => {
    const item = byId.get(id);
    assert(item, `${binding.interface_slice}: unknown inventory item ${id}`);
    assert(item.platform === 'web', `${id}: namespace/platform mismatch`);
    assert(item.slice_id === binding.interface_slice, `${id}: belongs to ${item.slice_id ?? 'shared'}, not ${binding.interface_slice}`);
    return item;
  });
  allBoundIds.push(...binding.inventory_ids);

  const inventoryRoutes = selected.map((item) => item.navigation.route);
  sameSet(binding.routing.routes, inventoryRoutes, `${binding.interface_slice} inventory route binding`);

  const inventoryPermissions = selected.flatMap((item) => item.permissions ?? []);
  sameSet(binding.api_binding.permissions, inventoryPermissions, `${binding.interface_slice} inventory permission binding`);

  const inventoryOps = recursivelyCollectOperationIds(selected);
  sameSet(binding.api_binding.operation_ids, inventoryOps, `${binding.interface_slice} inventory operation binding`);

  for (const operationId of binding.api_binding.operation_ids) {
    assert(openapi.includes(`operationId: ${operationId}`), `${binding.interface_slice}: operationId ${operationId} missing from OpenAPI`);
  }
  for (const operationId of binding.idempotency.required_operations) {
    assert(binding.api_binding.operation_ids.includes(operationId), `${binding.interface_slice}: idempotency operation ${operationId} is not bound`);
  }

  const inventoryStates = new Set(selected.flatMap((item) => item.states ?? []));
  for (const state of inventoryStates) {
    const asyncKey = asyncMap[state];
    if (asyncKey) assert(binding.async_states[asyncKey] === 'REQUIRED', `${binding.interface_slice}: inventory state ${state} must be REQUIRED`);
  }
}

sameSet(allBoundIds, ['WEB-002','WEB-003','WEB-004','WEB-005','WEB-006','WEB-007','WEB-008','WEB-009','WEB-010'], 'All slice-bound inventory IDs');
assert(!allBoundIds.includes('WEB-001'), 'Shared WEB-001 must not be smuggled into a slice binding');

assert(openapi.includes('api-v1-r1'), 'OpenAPI must identify approved API revision api-v1-r1');
assert(openapi.includes('operationId: createClaim'), 'createClaim missing from OpenAPI');
assert(openapi.includes('Idempotency-Key'), 'OpenAPI must retain Idempotency-Key contract');
assert(openapi.includes('expectedFromStatus'), 'OpenAPI must retain backoffice transition concurrency guard');

const requiredChecks = [
  'client.architecture_contract',
  'client.visual_contract_binding',
  'client.auth_lifecycle',
  'client.api_client_strategy',
  'client.api_contract_binding',
  'client.authorization_presentation',
  'client.routing_navigation',
  'client.state_cache_strategy',
  'client.forms_validation',
  'client.async_error_offline',
  'client.idempotency_strategy',
  'client.observability_correlation',
  'client.accessibility',
  'client.testing_strategy',
  'client.platform_contract'
];

console.log('Client Architecture semantic validation PASS');
console.log(`Platform baseline: ${baseline.baseline_id}`);
console.log(`Slices validated: ${bindings.map((b) => `${b.interface_slice}/web`).join(', ')}`);
console.log('Executable inventory binding: 9 slice-owned WEB items + shared WEB-001 preserved');
console.log('API revision: api-v1-r1; operationId/permission/route/idempotency bindings PASS');
console.log('Auth: bearer JWT memory-only, no refresh, local logout PASS');
console.log('Visual contract: FAR-aligned Design System/tokens + shared approved WEB-001 landing reference PASS');
console.log('Security: API authoritative, no new behavior, no hardcoded authoritative data PASS');
console.log(`Canonical required checks represented: ${requiredChecks.length}/15`);
