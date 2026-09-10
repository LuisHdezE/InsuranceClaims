import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const checkMode = process.argv.includes('--check');
const statusPath = '.blueprint/status.yaml';
const projectPath = '.blueprint/project.yaml';
const fixedUpdatedAt = "2026-09-10T01:13:03-03:00";

const [originalStatus, originalProject] = await Promise.all([
  readFile(statusPath, 'utf8'),
  readFile(projectPath, 'utf8'),
]);

function replaceMapEntry(text, key, body) {
  const marker = `  ${key}:\n`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing status entry ${key}`);
  const restStart = start + marker.length;
  const next = text.slice(restStart).search(/^  [a-z0-9_.-]+:\n/m);
  const end = next === -1 ? text.length : restStart + next;
  const normalizedBody = body.endsWith('\n') ? body : `${body}\n`;
  return `${text.slice(0, start)}${marker}${normalizedBody}${text.slice(end)}`;
}

function replacePhaseNote(text, phase, note) {
  const marker = `  ${phase}:\n`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing phase ${phase}`);
  const next = text.slice(start + marker.length).search(/^  [a-z0-9_.-]+:\n/m);
  const end = next === -1 ? text.length : start + marker.length + next;
  const block = text.slice(start, end);
  assert.match(block, /\n    note: .*\n/, `Missing note for phase ${phase}`);
  const updated = block.replace(/\n    note: .*\n/, `\n    note: ${note}\n`);
  return `${text.slice(0, start)}${updated}${text.slice(end)}`;
}

const evidence = {
  contract: '[EVD-API-R3-CONTRACT-001, EVD-API-R3-INVENTORY-001]',
  impact: '[EVD-API-R2-IMPACT-001, EVD-API-R3-IMPACT-001]',
  implementation: '[EVD-API-R3-IMPLEMENTATION-001, EVD-API-R3-CI-QA-001]',
  openapi: '[EVD-API-R3-OPENAPI-001, EVD-API-R3-INVENTORY-001]',
  postman: '[EVD-API-R3-POSTMAN-001, EVD-API-R3-INVENTORY-001]',
  qa: '[EVD-API-R3-CI-QA-001, EVD-INTEGRATION-QA-WEB-SYSTEM-001]',
  closure: '[EVD-API-R3-CLOSURE-001, EVD-API-R3-CI-QA-001]',
};

let status = originalStatus.replace(
  /^updated_at: .*$/m,
  `updated_at: '${fixedUpdatedAt}'`,
);

for (const [phase, note] of Object.entries({
  api_contract_design: 'Historical initial API Contract Ready approval remains preserved; the effective governed contract is now api-v1-r3 with 90 REST operations and recorded R1->R2->R3 impact analysis.',
  api_implementation: 'Historical initial API Implemented approval remains preserved; the effective R3 implementation is reconciled exactly against the frozen 90-operation inventory and retains Clean Architecture/Ports & Adapters boundaries.',
  openapi_validation: 'The effective root OpenAPI 3.1 contract is api-v1-r3 and is deterministically validated at 90/90 operations while historical R1/R2 evidence remains preserved.',
  postman_contract: 'The effective Postman Collection v2.1 operationalizes api-v1-r3 with deterministic 90/90 REST coverage while preserving the historical R1 pack byte-for-byte.',
  api_qa: 'Current API QA revalidates the effective R3 surface against PostgreSQL 18 and the simulated legacy boundary, including security, audit, concurrency and all implemented R3 verticals.',
  api_gate: 'The historical initial project API Gate remains approved; Increment 22 reconciles the completed R3 evolution without rewriting that historical human decision.',
})) {
  status = replacePhaseNote(status, phase, note);
}

const entries = {
  'api.auth_strategy': `    status: PASS\n    verification: evidence\n    note: R3 uses separate short-lived staff and customer JWT contexts plus HMAC-SHA256 for inbound integrations; no refresh-token or logout endpoint is introduced.\n    evidence_ids: ${evidence.contract}\n`,
  'api.error_contract': `    status: PASS\n    verification: evidence\n    note: Effective R3 REST errors preserve RFC 9457 Problem Details with safe project extensions and X-Request-Id correlation across the 90-operation contract.\n    evidence_ids: ${evidence.contract}\n`,
  'api.versioning_policy': `    status: PASS\n    verification: evidence\n    note: URL major versioning remains /api/v1 while governed contract revisions progressed additively from api-v1-r1 to api-v1-r2 and api-v1-r3 with historical evidence preserved.\n    evidence_ids: ${evidence.contract}\n`,
  'api.scope_defined': `    status: PASS\n    verification: evidence\n    note: Effective api-v1-r3 scope contains exactly 90 REST operations: 15 inherited and 75 additive; the historical MCP get_claim_status tool remains a separate Presentation contract outside REST counting.\n    evidence_ids: ${evidence.contract}\n`,
  'api.endpoint_inventory': `    status: PASS\n    verification: evidence\n    note: The frozen R3 inventory defines exactly 90 effective REST operations across 76 paths and 16 operation families, including authentication, permissions, audit, idempotency and concurrency metadata.\n    evidence_ids: ${evidence.contract}\n`,
  'api.auth_contract': `    status: PASS\n    verification: evidence\n    note: R3 freezes anonymous/public, staff JWT, customer JWT and HMAC integration authentication contexts and keeps staff/customer tokens non-interchangeable.\n    evidence_ids: ${evidence.contract}\n`,
  'api.permission_matrix': `    status: PASS\n    verification: evidence\n    note: The effective R3 role/permission matrix is frozen for Claims Operator, Claims Supervisor, Platform Admin, Customer Portal User and External Integration with Application/API authority remaining server-side.\n    evidence_ids: ${evidence.contract}\n`,
  'api.audit_event_mapping': `    status: PASS\n    verification: evidence\n    note: R3 operations map to the approved expanded durable audit catalog; authoritative mutations preserve atomic audit behavior where required and sanitized technical logging remains separate.\n    evidence_ids: [EVD-API-R3-CONTRACT-001, EVD-AUDIT-MODEL-001]\n`,
  'api.idempotency_matrix': `    status: PASS\n    verification: evidence\n    note: R3 freezes idempotency and optimistic-concurrency behavior per operation, including required Idempotency-Key flows, expectedVersion guards and preserved historical transition semantics without inventing blanket protocols.\n    evidence_ids: ${evidence.contract}\n`,
  'api.contract_traceability': `    status: PASS\n    verification: evidence\n    note: The effective R3 operation inventory traces the governed Insurance Operations surface through FR-020..FR-052 and UC-R3-001..UC-R3-013 while preserving inherited requirement/use-case links.\n    evidence_ids: ${evidence.contract}\n`,
  'api.change_impact_analysis': `    status: PASS\n    verification: evidence\n    note: Post-baseline API evolution is governed by API-IMPACT-001 (R1->R2) and API-IMPACT-002 (R2->R3), both platform_cross_cutting with required web-platform revalidation and unrelated historical evidence preserved.\n    evidence_ids: ${evidence.impact}\n`,
  'api.endpoints_implemented': `    status: PASS\n    verification: evidence\n    note: Runtime reconciliation proves all 90 frozen R3 REST operations are registered exactly, with no missing, extra or duplicate method/path tuple; MCP and simulated legacy remain separate adapters.\n    evidence_ids: ${evidence.implementation}\n`,
  'api.auth_authorization': `    status: PASS\n    verification: evidence\n    note: R3 staff/customer/integration authentication and least-privilege authorization are implemented through Application-authoritative permission checks with distinct JWT contexts and HMAC verification.\n    evidence_ids: ${evidence.implementation}\n`,
  'api.audit_logging': `    status: PASS\n    verification: evidence\n    note: Required R3 durable audit events, sanitized diagnostics, correlation and fail-closed critical audit behavior are implemented across the expanded operational surface.\n    evidence_ids: ${evidence.implementation}\n`,
  'api.backend_tests': `    status: PASS\n    verification: evidence\n    note: The final R3 backend suite contains 91 tests covering Domain, Application, REST, RBAC, lifecycle, idempotency, concurrency, integrations, worker behavior and configuration governance.\n    evidence_ids: ${evidence.implementation}\n`,
  'api.architecture_implementation_conformance': `    status: PASS\n    verification: evidence\n    note: Executable conformance checks preserve Clean Architecture/Ports & Adapters across Domain, Application, REST Presentation, Worker composition, MCP Presentation, Infrastructure and legacy DTO boundaries.\n    evidence_ids: ${evidence.implementation}\n`,
  'api.openapi': `    status: PASS\n    verification: file\n    note: Effective OpenAPI 3.1 formalizes exactly the 90-operation api-v1-r3 REST surface; generated fragments are deterministic and MCP remains outside REST.\n    evidence_ids: ${evidence.openapi}\n`,
  'api.openapi_validation': `    status: PASS\n    verification: evidence\n    note: R3 OpenAPI zero-drift, Redocly lint, bundle/dereference and semantic validation pass at 90/90 against the frozen endpoint inventory.\n    evidence_ids: ${evidence.openapi}\n`,
  'api.postman_collection': `    status: PASS\n    verification: file\n    note: The effective Postman Collection v2.1 contains exactly one governed request for each of the 90 R3 REST operationIds and no fake MCP REST operation.\n    evidence_ids: ${evidence.postman}\n`,
  'api.postman_environment': `    status: PASS\n    verification: file\n    note: The R3 local Postman environment separates staff, customer and integration contexts, keeps secrets empty and provides only synthetic/configurable variables.\n    evidence_ids: ${evidence.postman}\n`,
  'api.postman_coverage': `    status: PASS\n    verification: evidence\n    note: Deterministic Postman validation proves 90/90 R3 REST request coverage, 16/16 operation families, security-context fidelity, correlation/idempotency wiring and historical R1 body compatibility.\n    evidence_ids: ${evidence.postman}\n`,
  'api.qa_positive': `    status: PASS\n    verification: evidence\n    note: Exact-head runtime QA passes positive paths for the effective R3 API over PostgreSQL 18, simulated legacy dependencies and the implemented Insurance Operations verticals.\n    evidence_ids: ${evidence.qa}\n`,
  'api.qa_negative': `    status: PASS\n    verification: evidence\n    note: Exact-head R3 runtime QA passes negative security, authorization, validation, idempotency, replay, concurrency, rate-limit and resource-isolation assertions.\n    evidence_ids: ${evidence.qa}\n`,
  'api.contract_validation': `    status: PASS\n    verification: evidence\n    note: Runtime route reconciliation, OpenAPI and Postman independently converge on the same frozen api-v1-r3 90-operation REST contract.\n    evidence_ids: [EVD-API-R3-INVENTORY-001, EVD-API-R3-IMPLEMENTATION-001, EVD-API-R3-OPENAPI-001, EVD-API-R3-POSTMAN-001]\n`,
  'api.security_qa': `    status: PASS\n    verification: evidence\n    note: R3 auth, authorization, redaction, HMAC/replay, evidence, rate-limit, Problem Details, idempotency and concurrency assertions pass; governed npm audit --omit=dev reports no production advisories.\n    evidence_ids: ${evidence.qa}\n`,
  'api.audit_qa': `    status: PASS\n    verification: evidence\n    note: PostgreSQL and integration assertions prove required R3 durable audit persistence, transactional coupling where applicable, replay non-duplication and sanitized audit metadata.\n    evidence_ids: ${evidence.qa}\n`,
  'api.affected_consumer_revalidation': `    status: PASS\n    verification: evidence\n    note: API-IMPACT-001 and API-IMPACT-002 required platform web revalidation; accepted web consumers were revalidated through exact-head Integration QA, including real API clients, responsive/accessibility and degraded/offline behavior.\n    evidence_ids: [EVD-API-R2-IMPACT-001, EVD-API-R3-IMPACT-001, EVD-INTEGRATION-QA-WEB-SYSTEM-001, EVD-API-R3-CI-QA-001]\n`,
};

for (const [key, body] of Object.entries(entries)) {
  status = replaceMapEntry(status, key, body);
}

const impactsBlock = `api_impacts:\n  - id: API-IMPACT-001\n    artifact: .blueprint/api-impact/API-IMPACT-001.json\n    status: RESOLVED\n  - id: API-IMPACT-002\n    artifact: .blueprint/api-impact/API-IMPACT-002.json\n    status: RESOLVED\n`;
const impactsStart = status.indexOf('api_impacts:');
assert.notEqual(impactsStart, -1, 'Missing api_impacts section');
const artifactsStart = status.indexOf('artifacts:\n', impactsStart);
assert.notEqual(artifactsStart, -1, 'Missing artifacts section after api_impacts');
status = `${status.slice(0, impactsStart)}${impactsBlock}${status.slice(artifactsStart)}`;

const closureArtifacts = [
  ['EVD-API-R2-IMPACT-001', 'api_change_impact', '.blueprint/api-impact/API-IMPACT-001.json'],
  ['EVD-API-R3-CONTRACT-001', 'api_contract_r3', 'documentation/api/r3/API_CONTRACT_R3.md'],
  ['EVD-API-R3-INVENTORY-001', 'api_endpoint_inventory_r3', 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json'],
  ['EVD-API-R3-IMPACT-001', 'api_change_impact', '.blueprint/api-impact/API-IMPACT-002.json'],
  ['EVD-API-R3-IMPLEMENTATION-001', 'api_implementation_reconciliation_r3', 'documentation/api-implementation/r3/API_IMPLEMENTATION_RECONCILIATION_INCREMENT_18.md'],
  ['EVD-API-R3-OPENAPI-001', 'openapi_r3', 'openapi.yaml'],
  ['EVD-API-R3-POSTMAN-001', 'postman_r3', 'postman/InsuranceClaims.postman_collection.json'],
  ['EVD-API-R3-CI-QA-001', 'ci_qa_hardening_r3', 'documentation/api-implementation/r3/CI_QA_HARDENING_INCREMENT_21.md'],
  ['EVD-API-R3-CLOSURE-001', 'api_final_closure_r3', 'documentation/api-implementation/r3/FINAL_CLOSURE_INCREMENT_22.md'],
];
for (const [id, type, value] of closureArtifacts) {
  if (status.includes(`  - id: ${id}\n`)) continue;
  status = status.trimEnd() + `\n  - id: ${id}\n    type: ${type}\n    value: ${value}\n`;
}

let project = originalProject.replace(
  /^  api_impacts_root: .*$/m,
  '  api_impacts_root: .blueprint/api-impact',
);
assert.notEqual(project, originalProject, 'Expected project api_impacts_root correction was not applied');

if (checkMode) {
  assert.equal(originalStatus, status, `${statusPath} is stale; run npm run r3:closure:materialize`);
  assert.equal(originalProject, project, `${projectPath} is stale; run npm run r3:closure:materialize`);
  console.log('R3 final closure materialization check PASS');
} else {
  await Promise.all([
    writeFile(statusPath, status, 'utf8'),
    writeFile(projectPath, project, 'utf8'),
  ]);
  console.log('Materialized R3 final closure state into .blueprint/status.yaml and .blueprint/project.yaml');
}
