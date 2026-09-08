# API Contract R3 — Human Review Package

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Baseline main SHA:** `7f5a33631644df5b7ce21aedd7358ac2ae33e197`  
**Requirements R3:** APPROVED + MERGED via PR #35  
**Architecture/Security/Data R3:** APPROVED + MERGED via PR #36  
**Proposed contract revision:** `api-v1-r3`  
**Status:** READY_FOR_REVIEW  
**Evidence IDs:** `EVD-API-R3-CONTRACT-001`, `EVD-API-R3-IMPACT-001`  
**Date:** 2026-09-08

## 1. Review authority

This file is the compact human-review index for Blueprint phase `api_contract_design`.

Authoritative R3 detail is in:

1. `documentation/api/r3/API_CONTRACT_R3.md`
2. `documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json`
3. `.blueprint/api-impact/API-IMPACT-002.json`

Historical r1/r2 contracts remain unchanged and are inherited by reference.

## 2. Contract summary

| Property | R3 decision |
|---|---|
| effective revision | `api-v1-r3` |
| previous revision | `api-v1-r2` |
| REST operations | 90 |
| inherited operations | 15 |
| new operations | 75 |
| existing operationIds renamed | 0 |
| existing routes renamed | 0 |
| inherited operations with additive/refined semantics | 7 |
| major URL version | `/api/v1` retained |
| staff auth | separate staff Bearer JWT, 900 s |
| customer auth | separate customer Bearer JWT, 1800 s |
| integration auth | HMAC-SHA256 + timestamp/event replay identity |
| refresh tokens | deferred |
| error family | RFC 9457 retained |
| async acceptance | `202` for Communication/Event/Import Commit/Dead-letter Requeue |
| processing semantics | at-least-once + idempotent handlers |
| API impact | `API-IMPACT-002`, `platform_cross_cutting` |
| unrelated historical evidence | preserved |

## 3. Blueprint `api_contract_design` checks

Canonical Blueprint 0.5.2 requires:

| Check | R3 evidence | Status |
|---|---|---|
| `api.scope_defined` | API Contract R3 §§1–3, 12 | READY_FOR_REVIEW |
| `api.endpoint_inventory` | `API_ENDPOINT_INVENTORY_R3.json` | READY_FOR_REVIEW |
| `api.auth_contract` | API Contract R3 §6 + inventory auth contract | READY_FOR_REVIEW |
| `api.permission_matrix` | API Contract R3 §7 + inventory role/operation permissions | READY_FOR_REVIEW |
| `api.audit_event_mapping` | API Contract R3 §16 + inventory per-operation mapping | READY_FOR_REVIEW |
| `api.idempotency_matrix` | API Contract R3 §8 + inventory matrix | READY_FOR_REVIEW |
| `api.contract_traceability` | per-operation FR/UC links in inventory; every FR-020..FR-052 covered | READY_FOR_REVIEW |
| `api.change_impact_analysis` | `API-IMPACT-002.json` | READY_FOR_REVIEW |

## 4. Compatibility review

R3 preserves every historical `operationId` and route.

The seven inherited operations explicitly impact-classified for additive/refined semantics are:

1. `authenticateOperator`
2. `listClaims`
3. `getClaimDetail`
4. `listTasks`
5. `listClaimTasks`
6. `completeClaimTask`
7. `getClaimTimeline`

Notable compatibility choices:

- `completeClaimTask` keeps historical `expectedStatus`; R3 does not add a new mandatory request field that would break the accepted client;
- `listTasks`/`listClaimTasks` move to the more precise `claims.tasks.read` permission, and the existing `CLAIMS_OPERATOR` grant includes it;
- `authenticateOperator` remains the same route/request intent but may issue one of the approved staff roles;
- public intake/tracking operations do not acquire customer-auth requirements;
- Customer Portal is a separate new route family;
- Claim lifecycle transitions remain separate from operational Pipeline movement.

## 5. Security review

Approval accepts these exact API-level security boundaries:

1. Staff and Customer JWT contexts are non-interchangeable.
2. Staff token target lifetime is 900 seconds; Customer token target lifetime is 1800 seconds.
3. No refresh-token/logout endpoint is introduced.
4. Integration events require `X-Integration-Key`, `X-Event-Id`, `X-Event-Timestamp`, `X-Event-Signature`.
5. HMAC canonical input is `<timestamp>\n<eventId>\n<SHA256(rawBody)>`.
6. Signature is lowercase hex HMAC-SHA256.
7. Accepted timestamp skew is ±300 seconds.
8. Portal ownership denial uses safe `404 RESOURCE_NOT_FOUND`.
9. Admin path names never replace explicit permission checks.
10. Automation/config/import/bulk/integration input cannot introduce executable code, SQL, arbitrary HTTP or security bypasses.

## 6. Idempotency/concurrency review

Idempotency-Key is required for:

- historical `createClaim`;
- `createClaimTask`;
- `requestCommunication`;
- `uploadPortalClaimEvidence`;
- `createImportJob`;
- `commitImportJob`;
- `executeBulkOperation`.

Integration ingestion uses signed event identity instead.

Optimistic concurrency is explicit for Pipeline moves, Task mutations, configuration activation/state, Import lifecycle, Renewal/Collection mutations and dead-letter recovery. Historical Claim/Task compatibility guards remain externally stable.

## 7. Technical limits frozen by R3

These are portfolio/demo engineering limits, not insurer business rules:

- page size maximum: 100;
- bulk maximum: 100 selected items;
- import source formats: CSV and XLSX;
- import source file maximum: 10 MiB;
- import parsed row maximum: 5000;
- integration timestamp skew: 300 seconds;
- R3 HTTP idempotency retention target: 24 hours;
- integration replay-record demo target: 30 days.

Portal evidence inherits the already accepted historical evidence safety policy rather than inventing a second set of limits.

## 8. Requirement coverage review

The inventory covers all new functional requirements:

- `FR-020..FR-025`: Claims operational work/tasks/timeline/metrics;
- `FR-026..FR-028`: Pipeline Engine/Admin;
- `FR-029..FR-031`: Communication Hub;
- `FR-032..FR-033`: inbound integration;
- `FR-034..FR-035`: Automation;
- `FR-036..FR-037`: Customer/Policy 360;
- `FR-038`: Guidance;
- `FR-039..FR-041`: Customer Portal;
- `FR-042..FR-043`: Imports;
- `FR-044..FR-045`: Renewals;
- `FR-046..FR-047`: Collections;
- `FR-048`: Custom Fields;
- `FR-049`: Bulk;
- `FR-050`: configuration provenance;
- `FR-051..FR-052`: scheduled/retry/dead-letter operations.

Historical `FR-001..FR-019` remain incorporated through the inherited contract and requirements artifacts.

## 9. API-impact review

`API-IMPACT-002` is `platform_cross_cutting` because the change introduces:

- expanded staff RBAC;
- separate customer identity/security context;
- HMAC integration authentication;
- new stable error codes;
- new data schemas;
- permission refinements on existing Task operations;
- broad new `/api/v1` surfaces.

Revalidation policy is `platform`. Existing `claims-backoffice` is the currently identified affected web slice; platform policy may revalidate the wider web platform while preserving unrelated accepted evidence.

The evidence IDs in the impact artifact identify this contract/impact package. They do **not** claim implementation, QA or API Gate acceptance.

## 10. What human approval means

`Apruebo API Contract Ready R3` means the reviewer accepts:

- the 90-operation scope;
- exact operationId/method/path identities;
- auth contexts;
- permission separation;
- HMAC wire contract;
- error family additions;
- idempotency and concurrency obligations;
- technical caps;
- audit mapping;
- FR/UC traceability;
- `API-IMPACT-002` classification.

It does **not** authorize merge by itself.

## 11. What approval does not authorize

This gate does not authorize:

- Prisma/schema/migrations;
- Domain/Application implementation;
- NestJS controllers;
- Worker implementation;
- OpenAPI generation/formalization;
- Postman;
- frontend changes;
- merge of the PR without a separate explicit human decision.

## 12. Canonical next phase

The live Blueprint 0.5.2 phase catalog orders:

```text
API Contract Design
  -> API Implementation
  -> OpenAPI Formalization & Validation
  -> Postman Operational Contract
  -> API QA & Contract Validation
  -> API Gate
```

Earlier project shorthand sometimes displayed OpenAPI before code. This review package corrects that shorthand and follows the canonical Blueprint order from this point forward.

## 13. Human gate

Machine/document readiness is not approval.

Human semantic approval should explicitly state:

`Apruebo API Contract Ready R3`

Merge remains a separate explicit gate:

`Apruebo merge PR #<number>`
