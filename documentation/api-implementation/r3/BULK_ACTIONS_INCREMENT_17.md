# API Implementation R3 — Increment 17: Bulk Actions

**Status:** IMPLEMENTATION_IN_PROGRESS  
**Requirement:** `FR-049`  
**Use case:** `UC-R3-013`  
**Base:** API R3 approved contract on Blueprint 0.5.2

## 1. Frozen contract

R3 freezes one operation:

- `POST /api/v1/operator/bulk-actions`
- operationId `executeBulkOperation`
- staff JWT
- permission `bulk.execute`
- Supervisor only
- maximum 100 selected items
- `Idempotency-Key` required
- 24-hour logical replay identity
- synchronous `200` with per-item outcomes
- 10 requests/minute/supervisor
- audits `BULK_OPERATION_REQUESTED` and `BULK_OPERATION_COMPLETED`
- stable request-level error `BULK_ACTION_INVALID`

Each selected item independently executes authorization, domain validation and concurrency equivalent to the corresponding single-item command. A mixed result is valid and must never be represented as global success.

## 2. Narrow action allowlist

The approved R3 contract requires allowlisted action types but does not freeze a nominal list of action strings. Architecture R3 explicitly states that automated or bulk Claim transitions must call the same authoritative Claim transition Application use case.

To reduce scope rather than invent behavior, Increment 17 allows exactly:

```text
transitionClaimStatus
```

The value deliberately reuses the existing frozen single-operation `operationId` rather than creating a new business vocabulary.

All other action types fail at the bulk request boundary with:

```text
422 BULK_ACTION_INVALID
```

No Task bulk mutation, pipeline movement, Renewal mutation, Collection mutation, Custom Field mutation, communication send or arbitrary automation action is introduced by this increment.

## 3. Request shape

The activated implementation shape is:

```json
{
  "actionType": "transitionClaimStatus",
  "action": {
    "toStatus": "UNDER_REVIEW"
  },
  "items": [
    {
      "claimId": "<uuid>",
      "expectedFromStatus": "RECEIVED"
    }
  ]
}
```

The transition target is shared by the operation. Each selected Claim carries its own concurrency guard through the existing Claim status authority.

Duplicate Claim identifiers in the same bulk envelope are rejected to avoid ambiguous sequential mutation of one resource inside a single selection.

## 4. Application boundary

`BulkActionsApplication` is orchestration only.

For every item it invokes the existing `ClaimsOperationsApplication.transitionClaimStatus` command. It does not reimplement Claim lifecycle rules, permission checks or optimistic concurrency.

Consequences:

- Supervisor must first possess `bulk.execute`;
- the delegated single-item command still requires `claims.backoffice.transition`;
- invalid Claim lifecycle movement remains `INVALID_STATE_TRANSITION` per item;
- stale expected status remains `CLAIM_STATE_CONFLICT` per item;
- missing Claim remains `CLAIM_NOT_FOUND` per item;
- every successful item still emits `CLAIM_STATE_TRANSITIONED` through the normal Claim command.

## 5. Partial outcome model

The response reports:

- `bulkOperationId`;
- `actionType`;
- `selectedItemCount`;
- `succeededCount`;
- `failedCount`;
- `skippedCount`;
- `allSucceeded`;
- ordered item results;
- `completedAt`.

The current allowlisted action has no skip semantic, therefore `skippedCount = 0`. Failed items expose only stable safe error codes, not raw infrastructure diagnostics.

## 6. Idempotency and uncertainty policy

The bulk envelope uses the existing `idempotency_records` technical persistence with scope:

```text
executeBulkOperation
```

The request fingerprint covers the normalized action plus ordered selection.

Behavior:

- same key + same fingerprint + completed record => exact logical response replay with `Idempotency-Replayed: true`;
- same key + different fingerprint => `409 IDEMPOTENCY_KEY_REUSED`;
- same key while reservation is in progress => `409 IDEMPOTENCY_IN_PROGRESS`.

Reservation and `BULK_OPERATION_REQUESTED` are committed in one workflow-store transaction. Final response persistence and `BULK_OPERATION_COMPLETED` are also committed in one transaction.

If finalization becomes uncertain after one or more delegated item mutations, the reservation intentionally remains `IN_PROGRESS`. This is fail-closed: a retry is blocked instead of risking duplicate non-idempotent single-item effects.

## 7. Audit

Summary audit metadata is intentionally bounded.

`BULK_OPERATION_REQUESTED` records:

- action type;
- selected item count;
- bulk request identity.

`BULK_OPERATION_COMPLETED` records:

- action type;
- selected item count;
- succeeded count;
- failed count;
- skipped count;
- `allSucceeded`;
- bulk request identity.

Summary audit does not replace item accountability. Successful Claims retain normal `CLAIM_STATE_TRANSITIONED` audit events.

## 8. Persistence

No Bulk domain aggregate or business-state table is added.

Existing technical stores are reused:

- `idempotency_records` for HTTP logical replay identity;
- `audit_events` for summary audit;
- existing `claims` and `claim_status_history` for authoritative Claim state/history.

This matches Data Architecture R3, which does not activate a dedicated Bulk persistence concept.

## 9. REST boundary

`OperatorBulkActionsController` provides exactly one route:

```text
POST /api/v1/operator/bulk-actions
```

Controls:

- JWT guard;
- Application-level Supervisor + `bulk.execute` check;
- `Idempotency-Key` header;
- 10/minute rate limit by authenticated principal;
- Problem Details errors;
- replay response header.

## 10. QA scope

Automated verification covers:

- Supervisor-only access;
- Operator forbidden;
- Platform Admin forbidden;
- delegated Claim transition parity;
- partial success;
- stale per-item concurrency failure;
- no false global success;
- same-key replay;
- changed-fingerprint conflict;
- unsupported action rejection;
- maximum 100 selection enforcement;
- durable PostgreSQL summary audits;
- durable underlying Claim transition audit;
- completed technical idempotency envelope with no false Claim relation;
- authoritative final Claim states.

## 11. Explicit non-scope

Increment 17 does not introduce:

- arbitrary action execution;
- bulk Task operations;
- bulk Pipeline operations;
- bulk Renewal or Collection operations;
- bulk communication dispatch;
- background/async Bulk jobs;
- a Bulk domain aggregate;
- a Bulk business-state table;
- new insurer-specific rules;
- Blueprint mutation;
- tag, release or publication.
