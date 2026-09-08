# API Implementation R3 — Increment 04: Claims Operational Queries & Metrics

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `88a01022c805de551567f323f3a7f3f61f0f5273`  
**Verified functional SHA:** `3413ff2e4a31570746c0edcdcee97ce5283f3fbc`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. Todos los datos, identidades y configuraciones de prueba son sintéticos/demo.

## 1. Increment boundary

This increment closes the remaining read-side Claims Operations capability from the approved R3 `claims-work` family without entering Pipeline Administration.

Implemented scope:

- `FR-022` additive operational refinements for inherited `listClaims`;
- `FR-025` `getClaimsOperationalMetrics`;
- stage/status filtering;
- bounded server-defined search;
- allowlisted deterministic sort with Claim ID tie-breaker;
- R3 default `pageSize = 25`, maximum `100`;
- additive current operational-stage projection on Claim list items;
- supervisor/admin claims analytics permission boundary;
- initial defined operational metrics from persisted Claim/Task/Pipeline projections.

Explicitly outside this increment:

- Pipeline Administration/version authoring/activation;
- SLA, time-to-first-response or mean-resolution-time metrics;
- Customer/Policy 360;
- Communication Hub;
- Automation, Imports, Renewals, Collections or Customer Portal;
- frontend changes;
- changes to `documentation/api/r3/**`;
- Blueprint Master, tag, release or publication changes.

## 2. Operational Claim query semantics

Inherited operation identity remains unchanged:

```text
GET /api/v1/operator/claims
operationId: listClaims
permission: claims.backoffice.read
```

R3 adds only optional query semantics:

- `status`: approved Claim lifecycle status;
- `stage`: bounded exact current Pipeline stage key;
- `search`: 1..120 characters, server-defined case-insensitive matching over `trackingCode`, `policyReference` and `vehicleReference` only;
- `sort`: one of the explicit allowlisted values:
  - `createdAt:desc`;
  - `createdAt:asc`;
  - `occurredAt:desc`;
  - `occurredAt:asc`;
  - `trackingCode:asc`;
  - `trackingCode:desc`.

The server adds Claim ID as a deterministic tie-breaker. No caller-defined field expression, SQL fragment or generic query language is accepted.

List items receive additive operational fields:

- `operationalStage` with stage key/display name/order when a Claim PipelineWorkItem exists;
- `operationalWorkItemVersion` for current read-side concurrency context.

A Claim with no approved operational projection remains queryable and returns `operationalStage: null`.

## 3. Claims operational metrics

Frozen R3 operation implemented:

```text
GET /api/v1/operator/analytics/claims
operationId: getClaimsOperationalMetrics
permission: claims.analytics.read
rate family: protected staff read, 120/min/principal
required query: from, to as RFC 3339 instants
window semantics: [from,to)
```

The initial response is limited to metrics whose semantics are already approved and backed by persisted projections:

- `openClaims`: Claim status is not `CLOSED`;
- `reportedInWindow`: Claim `createdAt` belongs to `[from,to)`;
- `claimsByStatus`: count for each approved Claim lifecycle state;
- `claimsByOperationalStage`: count by current PipelineWorkItem stage;
- `evidencePendingReviewClaims`: Claims with evidence and an OPEN `EVIDENCE_REVIEW` task, reusing the already-approved `PENDING_REVIEW` evidence-attention semantics;
- `openTasks`: OPEN ClaimTasks;
- `overdueTasks`: OPEN ClaimTasks with non-null `dueAt < generatedAt`;
- `closedClaims`: Claim status `CLOSED`.

SLA-derived or response-time metrics are intentionally absent because R3 requirements explicitly defer them until their definitions and required timestamps/rules are approved.

## 4. Authorization

- `CLAIMS_OPERATOR` may use operational `listClaims` but does not receive `claims.analytics.read`.
- `CLAIMS_SUPERVISOR` may use both Claim operational queries and analytics.
- `PLATFORM_ADMIN` may read Claims analytics because R3 grants `claims.analytics.read`, but still has no implicit `claims.backoffice.read` and therefore cannot list Claim records through the operator Claim list.

Route placement never replaces Application permission checks.

## 5. Architecture

The increment introduces a dedicated framework-independent `ClaimsOperationalQueryApplication` in Application.

It composes existing ports:

- `ClaimRepository`;
- `ClaimTaskRepository`;
- `PipelineWorkItemRepository`;
- `ClockPort`.

This avoids adding Pipeline/Task concerns to the Claim aggregate and avoids making Infrastructure joins business authority.

For the bounded portfolio/demo data set, Application collects paged records through existing repository ports and composes the read projection. PostgreSQL remains authoritative in production because those ports are backed by PostgreSQL adapters. No new schema or migration is required for this read-only increment.

## 6. Compatibility

Historical operation IDs and routes remain unchanged.

The inherited `listClaims` method continues accepting the historical `status` string contract and validates it inside Application, while R3 adds only optional stage/search/sort inputs and additive response fields.

The R3 global pagination default of `25` is applied intentionally; maximum page size remains `100`.

Transport validation remains aligned with the existing RFC 9457 boundary: `VALIDATION_ERROR` maps to HTTP `422`.

## 7. Verification findings and corrections

The first implementation head exposed two test-fixture defects without requiring a production-code relaxation:

1. New tests initially used invented policy/vehicle references that the synthetic eligibility adapter correctly rejected. Fixtures were corrected to the already-approved synthetic pairs `SYN-POL-001/SYN-VEH-001` and `SYN-POL-002/SYN-VEH-002`. Eligibility behavior was not weakened.
2. The REST invalid-sort test initially expected HTTP `400`, while the established Problem Details mapping correctly returns HTTP `422` for `VALIDATION_ERROR`. The test expectation was corrected; transport behavior was not changed.

After these corrections, functional head `3413ff2e4a31570746c0edcdcee97ce5283f3fbc` passed the complete relevant workflow set.

## 8. Exact-head machine evidence

PASS on verified functional SHA `3413ff2e4a31570746c0edcdcee97ce5283f3fbc`:

- API Implementation run **274**, ID `34254754432`;
- API QA run **237**, ID `34254754426`;
- Integration QA - Web Slices run **135**, ID `34254754618`;
- Release Gate Evidence run **127**, ID `34254754475`;
- OpenAPI Validation run **257**, ID `34254754453`;
- OpenAPI Post-MVP R2 run **32**, ID `34254754536`;
- Postman Contract run **244**, ID `34254754602`;
- Interface Inventory run **219**, ID `34254754445`;
- Design System run **214**, ID `34254754537`;
- Operations Observability Evidence run **114**, ID `34254754469`;
- Functional Slice - Claims Backoffice Web run **142**, ID `34254754448`;
- Functional Slice - Customer Claim Tracking Web run **155**, ID `34254754495`;
- Functional Slice - Digital Claim Intake Web run **187**, ID `34254754459`.

Expected historical failures only:

- Visual Functional Review Ready - Web run **115**, ID `34254754549`;
- Operations State run **109**, ID `34254754443`;
- Release Gate Ready State run **120**, ID `34254754444`.

No unexplained red remained.

API Implementation proved:

- locked dependency installation;
- unchanged Prisma 8 contract emission;
- production TypeScript typecheck;
- all backend tests, including the new operational query/analytics tests;
- architecture conformance;
- production build.

API QA proved compatibility against ephemeral PostgreSQL and simulated legacy, including security, runtime contract behavior and durable persistence/audit invariants.

Integration QA additionally passed backend/web tests, architecture/build verification, PostgreSQL bootstrap, runtime security/concurrency/rate-limit checks, web API clients, responsive/accessibility journeys and offline/degraded behavior.

## 9. Verification conclusion

Machine verification proves:

1. Prisma contract emits successfully with no schema drift;
2. production TypeScript typecheck succeeds;
3. backend tests pass;
4. architecture conformance remains green;
5. production build succeeds;
6. API QA remains compatible against ephemeral PostgreSQL and simulated legacy;
7. `listClaims` supports status + stage + bounded search + allowlisted sort;
8. sort ordering is deterministic with a stable Claim ID tie-breaker;
9. unsafe/unapproved sort values are rejected with the existing HTTP 422 validation contract;
10. Claims without a PipelineWorkItem remain readable;
11. Supervisor can read operational metrics;
12. Operator receives `403 FORBIDDEN` for analytics;
13. Platform Admin can read analytics but cannot gain implicit Claim-list access;
14. metrics use `[from,to)` window semantics;
15. metrics include only the approved initial FR-025 set;
16. evidence-pending metric reuses existing evidence-attention semantics;
17. no SLA/response-time semantics are invented;
18. frozen `documentation/api/r3/**` artifacts remain unchanged.

## 10. Governance

No changes are made to:

- `documentation/api/r3/**`;
- `.blueprint/api-impact/API-IMPACT-002.json`;
- historical R1/R2 contracts or accepted evidence;
- Blueprint Master;
- immutable `v0.2.0` tag/release.

The increment is now `IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`.

Machine success does not authorize merge, release, tagging or publication. Merge requires a separate explicit human decision from Luis.
