# ClaimTask Vertical Slice

Status: implementation candidate for the approved post-MVP Claims Operations Experience Increment.

## Purpose

Make human operational work a first-class, durable concept without changing the authoritative Claim lifecycle. Claim remains the business authority. ClaimTask represents work that an operator or queue must perform around a Claim.

This capability is part of the synthetic technical case study. The automatic task rules described here are demo rules and must not be presented as FAR production procedures.

## P0 domain contract

### Task types

- `CLAIM_REVIEW`
- `EVIDENCE_REVIEW`
- `MISSING_DOCUMENT_FOLLOWUP`
- `CUSTOMER_FOLLOWUP`
- `CLOSURE_REVIEW`

### Task statuses

- `OPEN`
- `COMPLETED`

### Priority

- `NORMAL`
- `HIGH`

No synthetic SLA or due date is invented. Initial automated tasks are `NORMAL`, queue `CLAIMS`, unassigned and have `dueAt = null`.

### Fields

`id`, `claimId`, `type`, `title`, `status`, `priority`, `queue`, `assignedOperatorId`, `dueAt`, `createdByType`, `createdById`, `sourceKey`, `correlationId`, `createdAt`, `completedAt`, `completedById`.

`sourceKey` is unique when present and exists to make deterministic automated task creation idempotent.

## Business rules

1. Creating a Claim creates one `CLAIM_REVIEW` task.
2. A newly created Claim with evidence also creates one `EVIDENCE_REVIEW` task.
3. Replaying an idempotent Claim submission must not duplicate either task.
4. Failure to project an operational task after the Claim commit must not report the already-committed Claim as failed. The failure is logged and deterministic `sourceKey` creation supports reconciliation/retry.
5. Completing a ClaimTask never changes Claim status.
6. Task completion is concurrency guarded by `expectedStatus`.
7. A stale second completion returns a conflict rather than silently succeeding.
8. In P0, task reads reuse `claims.backoffice.read`; task completion reuses `claims.backoffice.transition`. A finer-grained task permission can be introduced later only with explicit RBAC evolution.

## REST contract for this increment

All routes require the existing operator bearer token.

### GET `/api/v1/operator/tasks`

Optional query:

- `page`: integer >= 1, default 1
- `pageSize`: integer 1..100, default 50
- `status`: `OPEN | COMPLETED`
- `type`: `CLAIM_REVIEW | EVIDENCE_REVIEW | MISSING_DOCUMENT_FOLLOWUP | CUSTOMER_FOLLOWUP | CLOSURE_REVIEW`
- `claimId`: UUID

`status`, `type` and `claimId` are server-side filters. Dashboard counters that need an exact task-family total use `totalItems` from a filtered query rather than counting only the first loaded page.

Response:

```json
{
  "items": [
    {
      "taskId": "uuid",
      "claimId": "uuid",
      "trackingCode": "synthetic tracking code",
      "policyReference": "SYN-POL-001",
      "vehicleReference": "SYN-VEH-001",
      "type": "CLAIM_REVIEW",
      "title": "Revisar siniestro reportado",
      "status": "OPEN",
      "priority": "NORMAL",
      "queue": "CLAIMS",
      "assignedOperatorId": null,
      "dueAt": null,
      "createdByType": "SYSTEM",
      "createdById": null,
      "correlationId": "request-id-or-null",
      "createdAt": "RFC3339",
      "completedAt": null,
      "completedById": null
    }
  ],
  "page": 1,
  "pageSize": 50,
  "totalItems": 1,
  "totalPages": 1
}
```

### GET `/api/v1/operator/claims/{claimId}/tasks`

Returns the ordered task projection for one Claim. Missing Claim returns `CLAIM_NOT_FOUND`.

### POST `/api/v1/operator/tasks/{taskId}/complete`

Body:

```json
{
  "expectedStatus": "OPEN"
}
```

Returns the completed task projection. Missing task returns `TASK_NOT_FOUND`. Stale task state returns `TASK_STATE_CONFLICT` with HTTP 409.

## Persistence

Authoritative task state lives in PostgreSQL table `claim_tasks` with FK to `claims(id)` and cascade delete. Indexes support:

- Claim task workspace: `(claim_id, status, created_at)`
- pending/due work: `(status, due_at)`
- future operator queue: `(assigned_operator_id, status)`

Forward and rollback SQL for this increment are versioned under `prisma/migrations/`.

## Architecture

- Domain: `ClaimTask` owns completion state legality.
- Application: `ClaimTasksApplication` owns queries, completion and deterministic initial-task rules.
- Application composition: `ClaimsOperationsApplication` delegates Claim creation to the existing Claims use case and then projects initial tasks without turning task failure into a false Claim rollback.
- Ports: `ClaimTaskRepository` is defined in Application.
- Adapters: memory and PostgreSQL implementations satisfy the same port.
- Presentation: protected REST routes contain validation/rate limiting only and do not own task rules.

## Acceptance criteria

- [ ] Claim creation produces one durable `CLAIM_REVIEW` task.
- [ ] Claim creation with evidence produces one additional `EVIDENCE_REVIEW` task.
- [ ] Idempotent Claim replay produces no duplicate tasks.
- [ ] Unauthorized task reads/writes are rejected.
- [ ] Task listing returns Claim context needed by the operational UI.
- [ ] Task status/type/claim filters execute server-side and return exact `totalItems`.
- [ ] Completion persists `COMPLETED`, `completedAt` and `completedById`.
- [ ] Stale completion returns HTTP 409.
- [ ] Claim status is unchanged by task completion.
- [ ] Memory tests and PostgreSQL runtime exercise the same Application contract.
- [ ] Architecture checker covers the new REST boundary.
- [ ] Claim Detail and Tasks Workspace remain responsive without horizontal page overflow.

## Explicit non-goals

No generic Pipeline Builder, task creation UI, custom task types, SLA engine, automatic assignment, notifications, real insurer workflow rules or task-driven Claim transition is introduced in this slice.
