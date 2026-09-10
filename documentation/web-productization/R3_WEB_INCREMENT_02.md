# R3 Web Productization - Increment 02

**Project:** `LuisHdezE/InsuranceClaims`  
**Blueprint consumer baseline:** `0.5.2`  
**API contract:** `api-v1-r3`  
**Frozen main SHA:** `ebcac0c5363133a47bb387653902bbd4c31d2721`  
**Increment:** Claims Operations Core  
**Status:** `IMPLEMENTED_PENDING_EXACT_HEAD_CI_AND_HUMAN_REVIEW`

> Caso técnico no oficial. No afiliado a FAR Seguros. Datos exclusivamente sintéticos/demo.

## 1. Purpose

This increment turns the existing Claims backoffice into a more truthful R3 operational workspace by wiring the remaining Claims Work capabilities that can be productized without changing the frozen API contract.

It deliberately keeps Claim lifecycle, Pipeline work state, and Claim Tasks as separate authorities.

## 2. Canonical operational metrics

The Dashboard no longer derives aggregate Claims KPIs by issuing repeated `listClaims` calls.

For staff with `claims.analytics.read`, it calls:

`GET /api/v1/operator/analytics/claims?from=...&to=...`

The UI presents:

- open Claims;
- reported Claims in the selected `[from,to)` window;
- open Tasks;
- overdue Tasks;
- Claims pending evidence review;
- closed Claims;
- Claims by operational Pipeline stage.

The selected window is explicit: 7, 30, or 90 days. The response generation timestamp and window semantics are visible in the UI.

Claims Operators do not receive locally reconstructed substitutes for analytics they are not authorized to read. Their Dashboard retains actionable Task and Claim feeds while clearly explaining the permission boundary.

## 3. Claim lifecycle versus Pipeline

The previous detail UI visually derived an “operational stage” from `ClaimStatus`. That presentation is removed.

The Claim detail now separates:

1. **Claim lifecycle** using server `status` and `allowedTransitions`;
2. **Operational Pipeline** using the projection returned by the R3 Claims operational list.

The Pipeline panel shows the current stage key/display name and `operationalWorkItemVersion`.

Stage movement calls:

`POST /api/v1/operator/claims/{claimId}/operational-transitions`

with:

- `toStageKey`;
- `expectedVersion`.

## 4. No invented transition graph

The frozen API exposes current operational stage and work-item version before a move, but does not expose `allowedNextStageKeys` through a dedicated read endpoint.

Therefore this UI does not hardcode configurable stage definitions or infer allowed transitions from Claim status.

Before a move, the user supplies a bounded `stage key`; the pinned Pipeline version remains the authority that accepts or rejects the movement.

After a successful move, `PipelineWorkItemResponse.allowedNextStageKeys` is shown as optional suggestions for the next explicit movement.

A `409` invalidates stale projections and forces the user to review the latest server state.

## 5. Full Claim Task lifecycle

The web Task projection now represents the runtime R3 fields:

- `description`;
- `version`;
- `updatedAt`;
- terminal completion metadata;
- terminal cancellation metadata;
- cancellation reason;
- complete actor type set (`SYSTEM`, `OPERATOR`, `SUPERVISOR`, `ADMINISTRATOR`, `AUTOMATION`).

The web client now implements:

- `createClaimTask`;
- `getClaimTask`;
- `updateClaimTask`;
- existing `completeClaimTask`;
- `cancelClaimTask`.

## 6. Task creation and idempotency

Claim Detail can create a Task when the role has `claims.tasks.manage`.

The form supports only runtime contract fields:

- type;
- title;
- optional description;
- priority;
- `CLAIMS` queue;
- optional `assignedOperatorId`;
- optional due date/time.

The client preserves the same generated `Idempotency-Key` for an identical request fingerprint after an uncertain retry. If form content changes, a new key is generated. Successful completion resets the key.

## 7. Task Detail route

New route:

`/operator/tasks/:taskId`

The route requires `claims.tasks.read` and is included in safe post-login deep-link handling.

For roles with `claims.tasks.manage`, an OPEN Task can be:

- reassigned or unassigned;
- reprioritized;
- rescheduled or cleared of a due date;
- completed;
- cancelled with one canonical reason:
  - `NO_LONGER_REQUIRED`;
  - `DUPLICATE`;
  - `CREATED_IN_ERROR`.

Updates and cancellation use the exact server `version` as `expectedVersion`.

## 8. Visual direction

The increment extends the approved R3 productization language rather than replacing it:

- deep navy operational frame;
- light work surfaces;
- cyan primary interaction;
- controlled yellow accents;
- role/contract provenance badges;
- Pipeline node presentation;
- Task version orbit;
- compact dense forms with strong hierarchy;
- terminal decision cards;
- responsive layouts down to mobile widths.

No fake SLA, fake chart, decorative claim count, or insurer-specific operational assumption is introduced.

## 9. API contract boundary

No API route, permission, Pipeline definition, Task type, cancellation reason, or Claim status is changed for UI convenience.

The `listTasks` OpenAPI/runtime query-name drift recorded in Increment 01 remains a separate conformance observation and is not silently rewritten here.

## 10. Validation expectations

Before merge, exact-head CI must prove applicable repository checks including:

- web typecheck;
- web tests, including new claims-work/task client serialization tests;
- web production build;
- architecture regressions;
- functional slices;
- real API integration;
- browser responsive/accessibility/offline behavior.

Historical VFR/Operations/Release-ready sentinels may remain red by design because this is new product work after prior closure. They must not be bypassed or rewritten.

Human approval remains mandatory before merge.
