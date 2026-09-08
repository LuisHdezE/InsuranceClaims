# API Implementation R3 — Increment 01: ClaimTask Lifecycle

**Project:** Insurance Claims Legacy Modernization  
**Blueprint consumer baseline:** 0.5.2  
**Contract:** `api-v1-r3`  
**Baseline main SHA:** `560108f9cfdcc7ef2b5c562e70f75e27437a56db`  
**Scope:** FR-023 / UC-R3-002  
**Status:** IMPLEMENTED_PENDING_CI_AND_HUMAN_REVIEW

> Unofficial technical case study. No affiliation with FAR Seguros. All business data is synthetic/demo data.

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

## 7. Verification scope

Tests added/expanded to prove:

1. initial version and updated timestamp;
2. successful assignment/priority/due-date mutation;
3. stale optimistic version rejection;
4. cancellation terminal state;
5. mutation rejection after terminal state;
6. historical completion behavior remains valid;
7. create-task idempotent replay;
8. same key + different request is rejected;
9. REST create/get/update/cancel operations;
10. REST stale-write Problem Details;
11. list filtering including CANCELLED/priority;
12. Claim remains `RECEIVED` when its tasks are completed/cancelled.

Final evidence for this increment depends on exact-head CI results. Machine success does not authorize merge.
