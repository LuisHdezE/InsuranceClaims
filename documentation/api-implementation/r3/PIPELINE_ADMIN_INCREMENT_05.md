# API Implementation R3 — Increment 05: Pipeline Administration & Versioned Configuration

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `34b197c65d1b8b23fcd7e3bd4f20fa6d61e4d7dd`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. Todos los pipelines, etapas, identidades, provenance values y datos de prueba son sintéticos/demo.

## 1. Increment boundary

This increment implements the approved R3 reusable Pipeline Engine administration boundary after the Claims operational projection/work-item increments.

Implemented scope:

- `FR-026` versioned Pipeline definitions and ordered stages;
- the administration portion of `FR-028`;
- configuration provenance required by `FR-050` for Pipeline versions;
- all six frozen `pipeline-admin` operations:
  - `listPipelines`;
  - `getPipeline`;
  - `createPipeline`;
  - `createPipelineVersion`;
  - `activatePipelineVersion`;
  - `updatePipelineState`;
- Application-level `pipelines.admin` authorization;
- optimistic concurrency through `expectedDefinitionVersion`;
- immutable activated version content through create-new-version semantics;
- DRAFT -> ACTIVE -> RETIRED configuration lifecycle;
- explicit enable/disable runtime availability;
- safe version pinning compatibility with existing PipelineWorkItems;
- durable configuration audit events;
- atomic PostgreSQL configuration writes.

Explicitly outside this increment:

- arbitrary Pipeline consumers beyond approved `CLAIM | RENEWAL | COLLECTION`;
- automatic migration/rebinding of existing work items to newly activated versions;
- insurer-specific stages, deadlines, rules or FAR-internal workflow assumptions;
- Communication Hub (`FR-029..FR-031`);
- Automation, Customer/Policy 360, Portal, Imports, Renewals, Collections and Custom Fields;
- frontend changes;
- changes to frozen `documentation/api/r3/**` artifacts;
- Blueprint Master, tag, release or publication changes.

## 2. Frozen REST operations

All routes require staff JWT and Application permission `pipelines.admin`.

```text
GET   /api/v1/admin/pipelines
GET   /api/v1/admin/pipelines/{definitionId}
POST  /api/v1/admin/pipelines
POST  /api/v1/admin/pipelines/{definitionId}/versions
POST  /api/v1/admin/pipelines/{definitionId}/versions/{versionId}/activate
PATCH /api/v1/admin/pipelines/{definitionId}
```

Read requests use the protected staff read rate family. Administrative writes use the stricter admin-write rate family.

## 3. Configuration lifecycle

Creating a PipelineDefinition also creates immutable-content `DRAFT v1` and leaves the definition disabled with no active pointer.

Subsequent content changes do not edit an existing active version. They create a new DRAFT version using `expectedDefinitionVersion`.

Activation:

1. requires an eligible DRAFT belonging to the requested definition;
2. requires the expected definition concurrency version;
3. promotes that version to ACTIVE;
4. retires the previous ACTIVE version when one exists;
5. updates the definition active pointer;
6. does not automatically enable a disabled definition;
7. never rebinds an existing PipelineWorkItem.

Disabling an enabled definition:

- makes it unavailable for new work-item projection;
- retires its active version;
- clears the active pointer;
- preserves all historical configuration rows and work-item pinning.

Re-enabling therefore requires an eligible ACTIVE version established through a reviewed activation operation.

## 4. Stage content validation

The Application layer validates configuration before persistence:

- 1..50 stages per version;
- bounded stable technical stage keys;
- unique stage keys;
- unique `sortOrder` values;
- bounded display names;
- bounded boolean reporting-flag maps;
- transition target keys must exist inside the same immutable version;
- duplicate allowed transitions are rejected;
- only approved consumers `CLAIM`, `RENEWAL`, `COLLECTION` are accepted.

No stage key or transition has insurer-specific meaning unless separately supplied, provenanced and administered. Repository tests use only explicit synthetic values such as `reported`, `review`, `received` and `assessment`.

## 5. Authorization

- `PLATFORM_ADMIN` owns `pipelines.admin` and can administer Pipeline definitions/versions.
- `CLAIMS_OPERATOR` and `CLAIMS_SUPERVISOR` retain operational `claims.pipeline.read/transition` permissions but do not gain configuration authority.
- route placement under `/admin` is not an authorization mechanism; Application checks the permission again.
- administration authority never bypasses Claim lifecycle rules.

## 6. Persistence and concurrency

The Pipeline tables required by this increment were already introduced by Increment 03:

- `pipeline_definitions`;
- `pipeline_versions`;
- `pipeline_stages`;
- `pipeline_work_items`;
- `pipeline_work_item_history`.

Therefore no schema migration is required for Increment 05.

PostgreSQL administration is bound through a dedicated `PrismaPipelineAdminStore` Infrastructure adapter. Configuration writes use database transactions. Version creation, activation, state changes and their audit event are committed atomically.

Conflict-prone writes use the definition `version` as an optimistic concurrency guard. Transaction-local conflict sentinels abort the transaction before a stale/activation conflict can expose a partially applied configuration.

The operational `PrismaPipelineStore` remains responsible for PipelineWorkItem projection/movement. Runtime composition keeps these adapter responsibilities explicit while both operate over the same authoritative PostgreSQL tables.

## 7. Version pinning invariant

Activation never silently reinterprets existing work.

Expected behavior proven by focused tests:

```text
Claim A -> PipelineVersion v2 -> stage reported
activate v3
v2 becomes RETIRED
Claim A remains pinned to v2 and may perform moves allowed by v2
Claim B created later pins to v3
```

This preserves the R3 rule that Pipeline is an operational projection and cannot rewrite historical/domain authority by configuration replacement.

## 8. Audit

Configuration mutations append durable audit events with staff administrator provenance and request correlation:

- `PIPELINE_VERSION_CREATED`;
- `PIPELINE_VERSION_ACTIVATED`;
- `PIPELINE_VERSION_RETIRED` when an active definition is disabled.

Activated/retires timestamps remain on immutable version records for reproducibility.

## 9. Verification targets

Machine verification proved:

1. Prisma contract emits with no schema drift;
2. TypeScript typecheck succeeds;
3. backend tests pass;
4. architecture conformance remains green;
5. production build succeeds;
6. API QA passes against ephemeral PostgreSQL and simulated legacy;
7. all six `pipeline-admin` routes are protected;
8. Claims Operator cannot administer pipelines;
9. Platform Admin can create/read/version/activate/enable-disable pipelines;
10. initial create produces disabled definition + DRAFT v1;
11. stale `expectedDefinitionVersion` returns `RESOURCE_VERSION_CONFLICT`;
12. an already ACTIVE/RETIRED version cannot be activated as a DRAFT;
13. invalid stage graphs are rejected;
14. activated content is not edited in place;
15. activating a new version retires the previous runtime version;
16. existing work items remain pinned to their original version;
17. disabled definitions do not create new PipelineWorkItems;
18. PostgreSQL admin writes remain atomic;
19. historical Claim lifecycle, task, tracking, timeline and analytics behavior do not regress;
20. frozen `documentation/api/r3/**` artifacts remain unchanged.

### 9.1 Exact-head machine evidence

Verified implementation head before this evidence-only status update:

- implementation head: `153a267f74e58c22c6d661cf05e2f99c8ac1fb32`;
- API Implementation run `#278`, run ID `34260566332`: SUCCESS;
  - Prisma contract emit: SUCCESS;
  - TypeScript typecheck: SUCCESS;
  - backend tests: SUCCESS;
  - architecture conformance: SUCCESS;
  - build: SUCCESS;
- API QA run `#241`, run ID `34260566280`: SUCCESS;
- OpenAPI Validation run `#261`, run ID `34260566252`: SUCCESS;
- OpenAPI Post-MVP R2 run `#36`, run ID `34260566431`: SUCCESS;
- Postman Contract run `#248`, run ID `34260566266`: SUCCESS;
- Integration QA - Web Slices run `#139`, run ID `34260566269`: SUCCESS;
- Release Gate Evidence run `#131`, run ID `34260566202`: SUCCESS;
- Operations Observability Evidence run `#118`, run ID `34260566265`: SUCCESS;
- Design System run `#218`, Interface Inventory run `#223`, and all three historical web functional slices: SUCCESS.

Expected historical/frozen locks on the same implementation head:

- Release Gate Ready State run `#124`, run ID `34260566435`: expected FAILURE because human acceptance/release readiness remains intentionally not ready;
- Operations State run `#113`, run ID `34260566376`: expected FAILURE because the inherited release snapshot is frozen;
- Visual Functional Review Ready - Web run `#119`, run ID `34260566206`: expected FAILURE because the historical visual-review ready-state gate remains frozen.

These three failures are inherited governance locks and are not implementation regressions. They are not weakened or modified by this increment.

## 10. Governance

No changes are made to:

- `documentation/api/r3/**`;
- `.blueprint/api-impact/API-IMPACT-002.json`;
- historical R1/R2 contracts or accepted evidence;
- Blueprint Master;
- immutable `v0.2.0` tag/release.

Machine verification moves this increment to `IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW` only.

It does not authorize merge, release, tagging or publication. Merge requires a separate explicit human decision from Luis.
