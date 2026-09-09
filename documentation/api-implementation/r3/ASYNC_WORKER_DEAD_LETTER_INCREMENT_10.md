# API Implementation R3 — Increment 10: Async Worker and Dead-letter Administration

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `fa654cdb0bdac014b977e0154da1ef810658d8be`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-09

> Caso técnico no oficial · No oficial · Sin afiliación. All async jobs, worker identities, automation executions, inbound events, dead-letter records, failure categories and recovery actions used by tests in this increment are synthetic/demo data. No real FAR Seguros production queue, operational incident, integration failure or support action is represented.

## 1. Increment boundary

This increment implements the remaining frozen R3 async foundation after Integration Events and Automation Engine/Admin.

Implemented requirements:

- `FR-051` — durable Worker/scheduler processing foundation;
- `FR-052` — dead-letter administration and explicit recovery;
- the async/dead-letter portion of `UC-R3-006` already traced to the Automation Engine family.

Frozen REST operations implemented:

```text
GET  /api/v1/admin/dead-letters
GET  /api/v1/admin/dead-letters/{deadLetterId}
POST /api/v1/admin/dead-letters/{deadLetterId}/requeue
POST /api/v1/admin/dead-letters/{deadLetterId}/resolve
```

This increment also creates the formal `apps/worker/` runtime required by the approved architecture.

It does not add Guidance, Customer Portal, Imports, Renewals, Collections, Bulk Operations or Custom Fields, and it does not widen any historical Claim/Task/Pipeline authority.

## 2. Formal Worker runtime

The Worker is an independent runtime adapter under:

```text
apps/worker/src/main.ts
apps/worker/src/worker.ts
```

`main.ts` is composition/runtime startup only. It:

- creates the production runtime from existing environment configuration;
- derives a server-owned worker identity when `WORKER_ID` is absent;
- polls using `WORKER_POLL_MS`, bounded to 250 ms through 60 seconds;
- handles `SIGTERM` and `SIGINT` for graceful loop termination;
- emits only bounded technical events (`WORKER_STARTED`, `WORKER_TICK`, `WORKER_TICK_FAILED`, `WORKER_STOPPED`);
- does not log raw job payloads or exception stacks at the normal Worker boundary.

The root package exposes `start:worker` without introducing a separate dependency universe for the Worker.

## 3. Worker identity and least privilege

The Worker is not a staff user, Platform Administrator or Automation actor.

Application receives an explicit internal principal:

```text
context = system
actorId = <server-issued worker id>
capabilities = [async.jobs.execute]
```

`AsyncOperationsApplication` rejects callers that do not carry this exact execution capability.

The Worker cannot derive extra authority from:

- job type;
- job payload;
- Automation configuration;
- inbound integration content;
- REST identity.

The approved architecture rule is preserved: the Worker enters Application and never becomes a business-level database/admin superuser.

## 4. Durable AsyncJob vocabulary and eligibility

This increment reuses the existing `async_jobs` durable foundation created by Integration Events. No competing queue table is introduced.

Approved persisted states remain:

```text
PENDING
LEASED
SUCCEEDED
FAILED_RETRYABLE
DEAD_LETTER
CANCELLED
```

Work is eligible when:

- `PENDING` and `availableAt <= now`;
- `FAILED_RETRYABLE` and `availableAt <= now`;
- a previous `LEASED` job has an expired lease and is recoverable.

Terminal jobs (`SUCCEEDED`, `DEAD_LETTER`, `CANCELLED`) are not leased for normal execution.

Batch polling is bounded to at most 100 jobs by Application; the production Worker uses a default batch of 25.

## 5. Lease, optimistic concurrency and stale-worker safety

Generic job execution uses explicit leasing with:

- optimistic job `version`;
- `leaseOwner`;
- `leaseExpiresAt`;
- bounded lease duration;
- attempt counter and maximum attempt budget.

Lease acquisition increments the attempt count and optimistic version. A job that has already exhausted its attempt budget becomes `DEAD_LETTER` with sanitized category `MAX_ATTEMPTS_EXHAUSTED` instead of being executed again.

Completion requires the same:

- job identity/version;
- `LEASED` state;
- lease owner;
- still-valid lease.

Application additionally treats the exact expiry instant as expired:

```text
leaseExpiresAt <= now  -> stale completion rejected
```

This closes the boundary where a Worker finishing at the exact expiration timestamp could otherwise compete with lease recovery.

No exactly-once claim is made. The approved model remains at-least-once with deterministic/idempotent downstream handling and optimistic concurrency.

## 6. Approved handler dispatch

The Worker uses a fixed server-side handler vocabulary. Job payload cannot select executable code, SQL, provider methods or arbitrary callbacks.

### `PROCESS_INBOUND_EVENT`

This family already had an authoritative lease implementation inside `IntegrationEventsApplication` from Increment 08.

The generic Worker therefore deliberately does **not** acquire a second AsyncOperations lease. It extracts only the required bounded `eventId` and delegates to:

```text
IntegrationEventsApplication.processInboundEvent(eventId, workerId)
```

This preserves the existing transactional `InboundEvent + AsyncJob` lease/retry semantics instead of creating two competing lease owners.

### `RESUME_AUTOMATION_EXECUTION`

The Worker:

1. validates the persisted `executionId` shape as a non-empty string;
2. acquires the generic AsyncOperations lease;
3. delegates to `AutomationExecutionApplication.resumeExecution(executionId)`;
4. records durable job success or sanitized retryable failure.

The Automation Application still owns Automation-version validation, action orchestration and fail-closed behavior.

### Unknown or malformed jobs

Unknown job types and malformed required payloads fail closed. They are never dynamically invoked.

Sanitized terminal categories include:

- `UNSUPPORTED_JOB_TYPE`;
- `ASYNC_JOB_PAYLOAD_INVALID`;
- `AUTOMATION_RESUME_FAILED`;
- `WORKER_HANDLER_FAILED` fallback.

Unsupported/malformed job families are terminally failed rather than repeatedly executing untrusted interpretation logic.

## 7. Retry and idempotency semantics

The Worker does not promise exactly-once effects.

Retry safety is composed from the existing capability foundations:

- inbound event identity and `PROCESS_INBOUND_EVENT` logical job identity from Increment 08;
- Automation execution/action deterministic idempotency identities from Increment 09;
- AsyncJob optimistic version + lease owner + bounded attempt count;
- fail-closed unknown/malformed handlers.

A crashed or expired Worker may cause work to become eligible again. A stale Worker cannot successfully complete work after its lease is no longer valid.

## 8. Dead-letter administration surface

The four frozen dead-letter operations require:

- valid staff JWT;
- `operations.dead_letters.read` for list/detail;
- `operations.dead_letters.manage` for requeue/resolve.

Under the current frozen role grants these administrative capabilities belong to Platform Administrator, not Claims Operator.

Read responses are intentionally sanitized. They expose only bounded operational diagnostics such as:

- dead-letter/job ID;
- job type;
- current status;
- attempt/max-attempt counts;
- availability timestamp;
- request correlation reference;
- sanitized failure category;
- completion timestamp;
- optimistic version.

They do **not** expose:

- raw job payload;
- lease owner/internal lease details;
- provider credentials;
- inbound signatures/secrets;
- raw webhook body;
- stack traces;
- SQL/Prisma internals.

List pagination is bounded to 100 records. Read and mutation routes use separate transport rate-limit buckets.

## 9. Requeue and resolution semantics

Both human recovery mutations require positive integer `expectedVersion`.

### Requeue

`requeueDeadLetter` changes the durable AsyncJob from `DEAD_LETTER` to `PENDING` and resets retry execution state:

- attempt count -> `0`;
- `availableAt` -> current time;
- lease owner/expiry -> null;
- failure category -> null;
- completion timestamp -> null;
- optimistic version incremented.

For `PROCESS_INBOUND_EVENT`, the corresponding durable `InboundEvent` is also reset to `PENDING` with cleared failure/completion fields in the same PostgreSQL recovery transaction before the job becomes runnable again.

### Resolve

The frozen AsyncJob vocabulary has no invented `RESOLVED` state. Explicit administrative resolution therefore moves the job to existing terminal state:

```text
CANCELLED
```

The operation does not silently reprocess the work.

Both operations reject stale optimistic versions and reject jobs that are no longer in `DEAD_LETTER`.

## 10. Durable recovery audit

Routine technical lease/retry attempts do not manufacture durable business audit events for every poll.

Human/admin recovery requires the frozen audit codes:

- `DEAD_LETTER_REQUEUED`;
- `DEAD_LETTER_RESOLVED`.

Actor:

`ADMINISTRATOR`

Target:

`ASYNC_JOB`

Sanitized metadata includes bounded operational classification only, including prior failure category/attempt count. Resolution adds the server-owned classification:

```text
resolutionClassification = ADMINISTRATIVE_CLOSURE
```

No arbitrary free-form resolution text or raw payload is accepted from REST.

PostgreSQL requeue/resolution mutation and its durable audit event execute atomically in the same transaction, matching the approved Audit Model transactional obligation.

## 11. Persistence and schema reuse

No new migration is required by this increment.

The existing `async_jobs` schema already provides:

- durable job type and logical idempotency identity;
- bounded state vocabulary;
- attempts/max-attempts;
- availability timestamp;
- lease owner/expiry;
- request correlation;
- sanitized failure category;
- completion timestamp;
- optimistic version;
- `(status, available_at)` polling index.

The existing `inbound_events` schema continues to own inbound processing state.

Memory and PostgreSQL AsyncOperations adapters implement the same Application port. PostgreSQL recovery actions use transactions and optimistic compare/update behavior; no controller writes directly to persistence.

## 12. Clean Architecture conformance

- `AsyncOperationsApplication` owns authorization, concurrency/recovery policy, response sanitization and Worker execution ports.
- `apps/worker/src/worker.ts` is an outer orchestration adapter and imports Application/Domain contracts only.
- `apps/worker/src/main.ts` is the composition root and may compose Infrastructure.
- Memory/PostgreSQL AsyncOperations stores live in Infrastructure.
- NestJS dead-letter controller is Presentation only.
- REST never reads/writes Prisma directly.
- Domain/Application remain free of NestJS/Prisma dependencies.
- Worker does not import Prisma or perform direct business persistence.

The architecture check was extended so the Worker adapter boundary is executable policy rather than documentation-only intent.

## 13. Tests and reviewed failure modes

The complete backend suite at the verified implementation head is `50/50 PASS`.

Increment-specific Application coverage proves:

- a lease is invalid exactly at `leaseExpiresAt`, not only after it;
- a stale Worker cannot complete expired work;
- attempt exhaustion moves the job to `DEAD_LETTER`;
- Automation resume runs through Application and marks the durable job `SUCCEEDED` when execution succeeds;
- inbound jobs are not double-leased by the generic Worker;
- unknown job types fail closed to dead-letter with `UNSUPPORTED_JOB_TYPE`.

REST coverage proves:

- Claims Operator is denied dead-letter administration;
- Platform Administrator can list/read sanitized dead letters;
- payload and lease-owner internals are absent from responses;
- stale `expectedVersion` returns conflict;
- requeue returns the job to `PENDING` with reset attempt/failure state;
- resolve returns terminal `CANCELLED`;
- `DEAD_LETTER_REQUEUED` records request correlation;
- `DEAD_LETTER_RESOLVED` includes `ADMINISTRATIVE_CLOSURE` classification.

The first candidate implementation head exposed TypeScript discriminated-union/test-double errors in CI. Those were corrected before evidence. A later semantic review then hardened the exact lease-expiry boundary and the required dead-letter resolution classification. The final implementation head below re-ran the complete machine matrix successfully with no new failure.

## 14. Explicit exclusions

This increment does not implement:

- real FAR Seguros queue/workflow data;
- external managed queue infrastructure;
- arbitrary/dynamic job handlers;
- exactly-once delivery claims;
- staff/admin impersonation by the Worker;
- raw dead-letter payload inspection over REST;
- free-form resolution notes;
- a new `RESOLVED` AsyncJob state;
- a generic audit-search REST API;
- Guidance, Portal, Imports, Renewals, Collections, Bulk or Custom Fields;
- changes to frozen `documentation/api/r3/**`;
- Blueprint Master changes;
- tag, release or publication changes.

## 15. Machine verification

Verified implementation head before this evidence-only commit:

`dd68be7887c28f1b7c1fa2fa849ece910f61f24e`

Successful exact-head substantive workflows:

- `API Implementation #313` — run `34316681379` — SUCCESS;
- `API QA #276` — run `34316681389` — SUCCESS;
- `OpenAPI Validation #296` — run `34316681361` — SUCCESS;
- `OpenAPI Post-MVP R2 #71` — run `34316681417` — SUCCESS;
- `Postman Contract #283` — run `34316681291` — SUCCESS;
- `Integration QA - Web Slices #174` — run `34316681394` — SUCCESS;
- `Release Gate Evidence #166` — run `34316681302` — SUCCESS;
- `Operations Observability Evidence #153` — run `34316681342` — SUCCESS;
- `Design System #253` — run `34316681374` — SUCCESS;
- `Interface Inventory #258` — run `34316681348` — SUCCESS;
- `Functional Slice - Claims Backoffice Web #181` — run `34316681320` — SUCCESS;
- `Functional Slice - Customer Claim Tracking Web #194` — run `34316681351` — SUCCESS;
- `Functional Slice - Digital Claim Intake Web #226` — run `34316681343` — SUCCESS.

`Claims Operations Release Formalization 0.2.0 #15` — run `34316681261` — also remained SUCCESS and was not modified by this increment.

`API Implementation #313` completed Prisma contract emit, TypeScript checks, all 50 backend tests, architecture conformance and production build successfully.

`API QA #276` completed ephemeral PostgreSQL bootstrap/runtime API QA, security/contract checks, durable audit/persistence verification and dependency classification successfully.

`Integration QA - Web Slices #174` completed backend/web typechecks and tests, architecture/build verification, ephemeral PostgreSQL/runtime startup, cross-cutting API security/concurrency/rate-limit QA, durable audit/persistence verification, real web API dependency exercise, responsive/accessibility journey and offline/degraded behavior successfully.

Expected historical lock failures at the same implementation head:

- `Release Gate Ready State #159` — run `34316681252` — expected FAILURE because historical human acceptance/release readiness remains intentionally locked;
- `Operations State #148` — run `34316681243` — expected FAILURE because the inherited release snapshot remains frozen;
- `Visual Functional Review Ready - Web #154` — run `34316681270` — expected FAILURE under the frozen historical visual-review readiness policy.

There was no fourth/new failure and no pending workflow at the verified implementation head.

Because adding this evidence file and compacting the branch creates a new PR head, the final human merge gate requires a fresh exact-head matrix after compacting. Machine success never authorizes merge, tag, release or publication.

## 16. Human gate

This increment remains:

`IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`

PR #47 may be marked ready for human review only after the final compact exact-head matrix again shows every substantive check successful with exactly the three known historical lock failures.

Merge requires explicit human authorization for **PR #47**. Tagging, releasing or publishing would require separate explicit human authorization.
