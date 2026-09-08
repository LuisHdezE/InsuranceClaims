# API Implementation R3 — Increment 03: Claim Pipeline Projection & Operational Stage Movement

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `66e1a96341cd68858d0b8d7440f2a362f7fd04e2`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. Todos los datos, identidades y configuraciones de prueba son sintéticos/demo.

## 1. Increment boundary

This increment implements the first remaining vertical from the approved R3 server sequence after Staff Identity/RBAC and ClaimTask lifecycle:

- `FR-020` Claim operational projection;
- `FR-021` server-authoritative operational stage movement;
- `moveClaimOperationalStage` at `POST /api/v1/operator/claims/{claimId}/operational-transitions`;
- permission `claims.pipeline.transition`;
- optimistic `expectedVersion` guard;
- durable `PIPELINE_STAGE_MOVED` audit;
- PipelineWorkItem history and pinned PipelineVersion behavior.

Explicitly outside this increment:

- Pipeline Administration endpoints/version authoring/activation;
- Claims operational metrics;
- additive `listClaims` stage/search/sort query refinements;
- Customer/Policy 360;
- Communication Hub;
- Automation/Worker behavior;
- expanded Claim Timeline integration of pipeline events;
- Customer Portal identity;
- any real insurer/FAR process or stage matrix.

## 2. Authority and invariants

Claim lifecycle remains authoritative and unchanged.

PipelineWorkItem is an operational projection only. Moving an operational stage:

- does not call Claim transition behavior;
- does not change Claim `status`;
- validates the requested stage against the work item's pinned PipelineVersion;
- requires the current PipelineWorkItem optimistic version;
- appends stage history;
- persists `PIPELINE_STAGE_MOVED` audit with staff provenance and request correlation.

A work item remains pinned to its original immutable PipelineVersion. If that version later becomes `RETIRED`, the existing work item continues to use that pinned version. `DRAFT` versions are never valid runtime movement definitions.

## 3. No invented business workflow

This implementation intentionally ships **no production pipeline definition or stage seed**.

New Claim projection is created only when an enabled Claim PipelineDefinition points to an ACTIVE PipelineVersion with at least one stage. Without such approved configuration, Claim creation remains successful and no PipelineWorkItem is invented.

Tests inject an explicit synthetic configuration (`reported -> review -> resolved`) solely to verify engine behavior. Those names/transitions are test data and are not asserted as FAR, insurer, or production workflow truth.

## 4. Persistence

R3 persistence additions:

- `pipeline_definitions`;
- `pipeline_versions`;
- `pipeline_stages`;
- `pipeline_work_items`;
- `pipeline_work_item_history`.

Structural protections include:

- allowed consumer types `CLAIM | RENEWAL | COLLECTION`;
- version status `DRAFT | ACTIVE | RETIRED`;
- unique definition keys;
- unique version numbers per definition;
- unique stage key/order per version;
- optimistic `version` on work items;
- current work-item association uniqueness per consumer/pipeline definition;
- append-oriented work-item history.

Prisma/PostgreSQL composite index and unique-constraint names are explicitly mapped to bounded physical names. This avoids Prisma 8 wire-name overflow while keeping `contract.prisma`, migration SQL and QA bootstrap names aligned.

The rollback refuses to drop the slice if any pipeline configuration, projection or history row exists, preventing silent destruction of operational provenance.

## 5. Atomic movement/audit persistence

The PostgreSQL adapter commits these three effects in one database transaction:

1. optimistic PipelineWorkItem stage/version update;
2. PipelineWorkItem history append;
3. `PIPELINE_STAGE_MOVED` durable AuditEvent append.

A stale update returns `RESOURCE_VERSION_CONFLICT`; an invalid move under the pinned version returns `INVALID_OPERATIONAL_STAGE_TRANSITION`.

## 6. HTTP behavior

Frozen R3 operation implemented:

```text
POST /api/v1/operator/claims/{claimId}/operational-transitions
Permission: claims.pipeline.transition
Rate family: protected staff mutation, 60/min/principal
Body: { "toStageKey": "<bounded-stage-key>", "expectedVersion": <integer> }
Success: 200 PipelineWorkItem projection
```

Platform Administrator remains denied because R3 does not grant `claims.pipeline.transition` to `PLATFORM_ADMIN`.

## 7. Machine verification

First implementation head `78d735ce12c514d812f195b109038235230401d0` correctly exposed one new failure in `API Implementation`: Prisma 8 rejected an auto-generated pipeline index prefix longer than its 54-byte wire-name prefix limit. The implementation was corrected by assigning bounded explicit physical names consistently across Prisma, migration SQL and QA bootstrap. No gate was weakened.

Corrected verification head `be6e889e9d447b297069b138ec225599ea1d61e5` passed the substantive gates:

- `API Implementation` run 268 / `34251032949`: PASS;
  - Prisma 8 contract emit: PASS;
  - TypeScript: PASS;
  - backend tests: PASS;
  - architecture conformance: PASS;
  - production build: PASS;
- `API QA` run 231 / `34251032862`: PASS;
  - ephemeral PostgreSQL bootstrap: PASS;
  - simulated legacy + API startup: PASS;
  - positive/negative/security runtime QA: PASS;
  - durable audit and persistence invariants: PASS;
- `Integration QA - Web Slices` run 129 / `34251032839`: PASS;
  - Prisma/typecheck/tests/build: PASS;
  - PostgreSQL/security/concurrency/rate-limit QA: PASS;
  - real web API client journeys: PASS;
  - browser responsive/accessibility/offline/degraded checks: PASS.

Additional exact-head PASS results included OpenAPI Validation, Postman Contract, Interface Inventory, Design System, Release Gate Evidence, Operations Observability Evidence and the three accepted web functional slices.

The only exact-head failures were the three pre-existing historical locks:

- `Visual Functional Review Ready - Web` run 109 / `34251032976`: expected historical failure;
- `Operations State` run 103 / `34251032875`: expected historical failure;
- `Release Gate Ready State` run 114 / `34251032890`: expected historical failure.

No new unexplained red workflow remained after the Prisma naming correction.

Verified behavioral targets:

1. Prisma contract emits successfully;
2. production TypeScript typecheck succeeds;
3. backend tests pass;
4. architecture conformance remains green;
5. production build succeeds;
6. API QA remains compatible against ephemeral PostgreSQL and the simulated legacy system;
7. an active synthetic pipeline creates one initial Claim operational projection;
8. no active pipeline configuration does not break Claim submission and does not invent a projection;
9. valid movement increments PipelineWorkItem version and appends history/audit;
10. invalid movement returns `INVALID_OPERATIONAL_STAGE_TRANSITION`;
11. stale optimistic version returns `RESOURCE_VERSION_CONFLICT`;
12. Claim lifecycle remains unchanged by stage movement;
13. a pinned RETIRED version remains valid for existing work items;
14. Platform Administrator receives 403 for the operator movement endpoint;
15. frozen `documentation/api/r3/**` artifacts remain unchanged.

A final exact-head CI pass is required after history cleanup/squash before human merge review.

## 8. Governance

No changes are made to:

- `documentation/api/r3/**`;
- `.blueprint/api-impact/API-IMPACT-002.json`;
- historical R1/R2 contracts or accepted evidence;
- Blueprint Master;
- immutable `v0.2.0` tag/release.

Machine success moves this increment only to `IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`.

It does not authorize merge, release, tagging or publication. Merge requires a separate explicit human decision from Luis.
