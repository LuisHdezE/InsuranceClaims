# API Implementation R3 — Increment 01: ClaimTask Lifecycle

**Project:** Insurance Claims Legacy Modernization  
**Blueprint consumer baseline:** 0.5.2  
**Contract:** `api-v1-r3`  
**Baseline main SHA:** `560108f9cfdcc7ef2b5c562e70f75e27437a56db`  
**Verified implementation SHA:** `52e8f0057ab60de1203d0c95a313df1ea987d433`  
**Scope:** FR-023 / UC-R3-002  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW

> Caso técnico no oficial · No oficial · Sin afiliación. Todos los datos de negocio son sintéticos/demo.

## 1. Increment boundary

This is the first implementation increment under the approved R3 API contract. It is deliberately **not** evidence that all 90 effective REST operations are implemented.

Implemented/refined operationIds in this increment:

- `listTasks` — refined filters/projection;
- `listClaimTasks` — refined projection;
- `completeClaimTask` — historical route/signature preserved with persisted optimistic guard;
- `createClaimTask` — new;
- `getClaimTask` — new;
- `updateClaimTask` — new;
- `cancelClaimTask` — new.

The following approved R3 cross-cutting work remains for subsequent implementation increments:

- expanded staff RBAC roles and canonical R3 task permission names;
- R3 durable AuditEvent catalog integration;
- Pipeline Engine/WorkItem;
- analytics;
- communications, integrations and automation;
- Customer/Policy/Portal;
- imports;
- renewals/collections;
- configuration families;
- bulk/dead-letter operations;
- worker runtime.

## 2. Domain implementation

`ClaimTask` now owns:

- lifecycle `OPEN -> COMPLETED | CANCELLED`;
- priority `NORMAL | HIGH`;
- queue and assignment;
- optional due date and description;
- optimistic `version`;
- completion metadata;
- cancellation metadata with allowlisted reason;
- mutation guards preventing writes after terminal state.

A ClaimTask mutation does not mutate Claim lifecycle. This preserves ADR-016 and the established v0.2.0 invariant.

Optional mutable-field semantics are explicit:

- `undefined` means the field was omitted and must remain unchanged;
- `null` means the caller explicitly clears a nullable field.

This distinction is covered by a Domain regression test and prevents an omitted assignee or due date from being silently cleared during unrelated updates.

## 3. Application implementation

`ClaimTasksApplication` now provides:

- paginated/filterable task listing;
- Claim-scoped listing;
- single task retrieval;
- idempotent task creation;
- mutable-field update with expected version;
- historical completion with expected status plus persisted version guard;
- cancellation with expected version;
- append-oriented task history query for tests/internal use.

`createClaimTask` reuses the existing Idempotency port with a separate `createClaimTask` scope, request fingerprinting, 24-hour expiry and replay response preservation.

## 4. Persistence implementation

Memory and PostgreSQL adapters implement the same Application port.

PostgreSQL mutations use conditional updates keyed by resource id + expected version. Completion additionally checks expected status. The task mutation and its `claim_task_history` append execute in one database transaction.

The R3 migration:

- evolves `claim_tasks` additively;
- backfills `updated_at` and initial history for existing task rows;
- creates `claim_task_history`;
- adds indexes supporting priority/status and history access;
- expands task status/actor checks;
- includes a guarded rollback that refuses to downgrade if rows use R3-only status/actor values.

`qa/bootstrap.sql` mirrors the effective R3 ClaimTask schema for PostgreSQL-backed CI.

## 5. HTTP implementation

New routes:

```text
POST  /api/v1/operator/claims/{claimId}/tasks
GET   /api/v1/operator/tasks/{taskId}
PATCH /api/v1/operator/tasks/{taskId}
POST  /api/v1/operator/tasks/{taskId}/cancel
```

Historical routes are preserved:

```text
GET  /api/v1/operator/tasks
GET  /api/v1/operator/claims/{claimId}/tasks
POST /api/v1/operator/tasks/{taskId}/complete
```

Problem Details mapping now includes:

- `TASK_NOT_FOUND` -> 404;
- `TASK_STATE_CONFLICT` -> 409;
- `RESOURCE_VERSION_CONFLICT` -> 409;
- `INVALID_TASK_STATE` -> 409.

`completeClaimTask` remains constrained to `expectedStatus = OPEN`.

## 6. Security/governance note

This increment intentionally preserves the historical operator authorization adapter while the R3 staff RBAC cross-cutting increment is still pending. Application comments and this evidence make that compatibility bridge explicit. It must not be mistaken for completion of the approved R3 permission matrix.

No UI authorization is used as business authority.

The approved R3 contract, `API-IMPACT-002`, historical r1/r2 contracts, accepted v0.1.0/v0.2.0 evidence, Blueprint Master, and the published `v0.2.0` tag/release remain outside this increment's diff.

## 7. Verification scope

Tests added/expanded prove:

1. initial version and updated timestamp;
2. successful assignment/priority/due-date mutation;
3. omitted optional mutable fields remain unchanged while explicit `null` clears them;
4. stale optimistic version rejection;
5. cancellation terminal state;
6. mutation rejection after terminal state;
7. historical completion behavior remains valid;
8. create-task idempotent replay;
9. same key + different request is rejected;
10. REST create/get/update/cancel operations;
11. REST stale-write Problem Details;
12. list filtering including CANCELLED/priority;
13. Claim remains `RECEIVED` when its tasks are completed/cancelled.

## 8. Exact-head machine verification

The implementation content at SHA `52e8f0057ab60de1203d0c95a313df1ea987d433` was verified by GitHub Actions on 2026-09-08.

### API Implementation — PASS

Run `34240490903` completed successfully. The exact-head job passed:

- locked dependency installation;
- Prisma 8 contract emit;
- TypeScript typecheck;
- backend tests;
- architecture conformance;
- production build.

### API QA — PASS

Run `34240491079` completed successfully against ephemeral PostgreSQL. The job passed:

- Prisma contract emit and production-code typecheck;
- synthetic QA secret preparation;
- PostgreSQL bootstrap and operator seed;
- simulated legacy system and API startup;
- positive, negative, contract and security runtime QA;
- durable audit and persistence invariant verification;
- production dependency vulnerability classification.

### Integration QA - Web Slices — PASS

Run `34240491116` completed successfully. It passed backend/web typecheck and tests, architecture/build verification, PostgreSQL-backed runtime integration, cross-cutting API security/concurrency/rate-limit QA, durable persistence checks, real web API client exercises, browser responsive/accessibility journey, offline/degraded behavior, and scoped Integration QA evidence validation.

### Other exact-head results

PASS:

- Release Gate Evidence;
- OpenAPI Validation;
- OpenAPI Post-MVP R2;
- Postman Contract;
- Interface Inventory;
- Design System;
- Operations Observability Evidence;
- Functional Slice - Claims Backoffice Web;
- Functional Slice - Customer Claim Tracking Web;
- Functional Slice - Digital Claim Intake Web.

Expected historical locks only:

- Release Gate Ready State — expected failure;
- Operations State — expected failure;
- Visual Functional Review Ready - Web — expected failure.

No unexplained exact-head CI failure remained on the verified implementation SHA.

`API Contract R3` was not triggered after implementation evidence was relocated outside `documentation/api/r3/**`; the contract-only guard was not weakened.

## 9. Human gate

Machine verification does not authorize merge. PR #38 remains subject to explicit human approval from Luis. Publishing a release/tag is a separate human gate.
