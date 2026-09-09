# API Implementation R3 — Increment 14: Renewals

**Repository:** `LuisHdezE/InsuranceClaims`  
**Blueprint baseline:** `0.5.2`  
**Delivery mode:** `GREENFIELD` with legacy coexistence `SIMULATED`  
**Classification:** technical synthetic/demo case only, unofficial and unaffiliated

## 1. Frozen R3 scope

This increment implements only the Renewal behavior explicitly frozen by the approved R3 requirements, architecture, data, security, audit, API contract, and endpoint inventory.

It does not infer insurer-specific renewal rules, timing, eligibility, grace periods, discounts, premiums, coverage changes, cancellation conditions, internal SLAs, real contact data, or real insurer infrastructure.

### 1.1 Contract matrix

| Element | Frozen R3 value |
|---|---|
| Primary FR | `FR-044`, `FR-045` |
| Related Pipeline FR | `FR-026`, `FR-027` |
| Use case | `UC-R3-010` |
| Aggregate | `RenewalCase` |
| Lifecycle states | `OPEN`, `COMPLETED`, `CANCELLED` |
| Lifecycle transitions | `OPEN -> COMPLETED`, `OPEN -> CANCELLED` |
| Read permission | `renewals.read` |
| Mutation permission | `renewals.manage` |
| Allowed operational roles | `CLAIMS_OPERATOR`, `CLAIMS_SUPERVISOR` |
| Platform Admin implicit access | No |
| Concurrency | optimistic, `expectedVersion` on mutations |
| HTTP idempotency | none for the four Renewal operations |
| Staff read rate limit | 120 requests/minute/principal |
| Staff mutation rate limit | 60 requests/minute/principal |
| Lifecycle audit | `RENEWAL_CASE_COMPLETED`, `RENEWAL_CASE_CANCELLED` |
| Pipeline audit | `PIPELINE_STAGE_MOVED` |
| PostgreSQL authority | yes |

### 1.2 Effective Renewal API operations

| operationId | Method | Route | Permission | Request | Response |
|---|---|---|---|---|---|
| `listRenewalCases` | GET | `/api/v1/operator/renewals` | `renewals.read` | page/pageSize query | `RenewalCasesPageResponse` |
| `getRenewalCase` | GET | `/api/v1/operator/renewals/{renewalId}` | `renewals.read` | path parameter | `RenewalCaseResponse` |
| `transitionRenewalCase` | POST | `/api/v1/operator/renewals/{renewalId}/transitions` | `renewals.manage` | `TransitionRenewalCaseRequest` | `RenewalCaseResponse` |
| `moveRenewalOperationalStage` | POST | `/api/v1/operator/renewals/{renewalId}/operational-transitions` | `renewals.manage` | `MoveOperationalStageRequest` | `PipelineWorkItemResponse` |

`TransitionRenewalCaseRequest` is implemented as the frozen terminal target plus optimistic version:

```json
{
  "toStatus": "COMPLETED | CANCELLED",
  "expectedVersion": 1
}
```

`MoveOperationalStageRequest` remains the shared Pipeline contract:

```json
{
  "toStageKey": "approved-stage-key",
  "expectedVersion": 1
}
```

## 2. Domain authority

`RenewalCase` is the authority for its own lifecycle.

Pipeline state is a separate operational projection:

```text
RenewalCase.status != PipelineWorkItem.currentStageId
```

Moving a Renewal Pipeline stage does not mutate `RenewalCase.status` or its version. Completing or cancelling a Renewal does not automatically move a Pipeline stage.

No cross-update is implemented because R3 freezes no rule that authorizes one.

## 3. Data Contract

The canonical Prisma Data Contract now includes `RenewalCase` with:

- UUID identity;
- `customerId` FK;
- `policyId` FK;
- `OPEN | COMPLETED | CANCELLED` status;
- created/updated timestamps;
- terminal completed/cancelled timestamps;
- integer optimistic `version`;
- Customer and Policy relations;
- policy/status and customer/status indexes.

The forward migration also enforces terminal timestamp consistency and a positive version.

The rollback is guarded. It refuses to drop `renewal_cases` when durable Renewal records exist.

R3 allows relevant target/expiry context only when approved and provenance-backed. No concrete Renewal target/expiry contract is frozen, so this increment does not invent such columns or timing rules.

## 4. Concurrency

Authoritative lifecycle mutation uses:

```text
id + expectedVersion
```

The PostgreSQL adapter performs a conditional update and requires:

```text
affected rows == 1
```

Zero affected rows becomes `RESOURCE_VERSION_CONFLICT` when the row still exists, or `RESOURCE_NOT_FOUND` when it does not.

Pipeline movement preserves the existing generic `PipelineWorkItem` optimistic concurrency behavior.

## 5. Audit and transaction boundary

A successful terminal Renewal mutation writes its authoritative state and audit event in the same PostgreSQL transaction.

Audit metadata is bounded to operational identifiers and transition/version context. It does not contain secrets, JWTs, passwords, raw PII, provider secrets, raw evidence, or arbitrary request payloads.

The Pipeline movement uses the existing atomic Pipeline transaction and exact audit event `PIPELINE_STAGE_MOVED`.

The R3 audit catalog also contains `RENEWAL_CASE_CREATED`, but the effective Renewal API inventory freezes no Renewal creation operation. This increment therefore does not expose or invent a create command solely to emit that event.

## 6. Security and RBAC

Authorization is enforced in Application, not only at the NestJS guard.

`CLAIMS_OPERATOR` and `CLAIMS_SUPERVISOR` receive the frozen Renewal permissions. `PLATFORM_ADMIN` does not become an implicit Renewal superuser.

All four endpoints use the existing staff JWT context. No customer token is accepted by the staff Renewal routes.

## 7. Existing platform capabilities deliberately reused or left untouched

### Pipeline

Reused. The existing generic Pipeline domain/store already supports `RENEWAL` consumer type. No second Pipeline implementation was created.

### Worker / Scheduler

No concrete Renewal job kind, schedule, deadline, expiry window, or automatic creation rule is frozen in R3. No Renewal-specific Worker or Scheduler behavior is implemented.

### Automation

The existing Automation Engine remains the only engine. R3 freezes no concrete approved Renewal Application capability binding in this increment, so no new automation action is invented.

### Communications

The existing Communication Hub remains authoritative. The frozen Renewal endpoint inventory does not define a Renewal communication request/target contract, so no second messaging module or inferred Renewal communication route is added.

### ClaimTask-style work management

The architecture allows orchestration with existing work-management capabilities, but R3 does not freeze a Renewal-specific task type, task creation command, or task lifecycle binding. None is invented here.

## 8. Error behavior

The implementation reuses approved platform Problem Details codes:

- `AUTHENTICATION_REQUIRED` -> 401;
- `FORBIDDEN` -> 403;
- `RESOURCE_NOT_FOUND` -> 404;
- `RESOURCE_VERSION_CONFLICT` -> 409;
- `INVALID_STATE_TRANSITION` -> 409;
- `INVALID_OPERATIONAL_STAGE_TRANSITION` -> 409;
- `VALIDATION_ERROR` -> 422;
- `RATE_LIMITED` -> 429.

No Renewal-specific error vocabulary is invented where the frozen R3 contract already provides shared codes.

## 9. Verification implemented

### Domain tests

Cover:

- initial `OPEN` lifecycle;
- exact terminal transitions;
- terminal timestamps;
- version increment;
- stale version rejection;
- terminal state immutability.

### Application tests

Cover:

- read/manage permission enforcement;
- Platform Admin least privilege;
- Customer/Policy context;
- terminal lifecycle mutation;
- exact terminal audit event;
- optimistic concurrency;
- Pipeline movement;
- proof that Pipeline movement does not change Renewal lifecycle.

### REST tests

Cover all four frozen routes plus:

- staff JWT enforcement;
- 401/403/404;
- Problem Details conflicts;
- stale lifecycle version;
- invalid terminal transition;
- operational stage movement;
- Pipeline/lifecycle separation.

### PostgreSQL runtime QA

`API QA` now:

1. applies the Renewal forward migration to ephemeral PostgreSQL;
2. seeds a synthetic Customer/Policy/Renewal/Pipeline scenario;
3. runs the real Nest API over PostgreSQL;
4. verifies list/detail;
5. verifies least-privilege RBAC;
6. moves the Renewal operational stage and confirms lifecycle remains `OPEN`;
7. completes the Renewal and confirms durable status/version/timestamps;
8. exercises stale optimistic conflicts;
9. asserts exactly one successful terminal Renewal audit;
10. asserts the Pipeline audit independently;
11. checks that failed/stale requests did not create a false terminal success audit;
12. checks bounded audit metadata for forbidden sensitive keys.

Worker execution is not part of the Renewal runtime scenario because no Renewal Worker job is frozen by R3.

## 10. Explicit non-scope

This increment does not implement:

- real insurer rules or data;
- automatic Renewal creation;
- calendar-based Renewal generation;
- grace periods or regulatory renewal windows;
- premium/discount/eligibility calculations;
- automatic Pipeline-to-lifecycle coupling;
- Renewal-specific Automation actions not frozen by R3;
- Renewal-specific Communication routes not frozen by R3;
- Renewal-specific task types not frozen by R3;
- Collections;
- Custom Fields;
- Bulk Actions;
- final R3 effective API reconciliation;
- release, tag, or version publication.

Those boundaries preserve the approved R3 contract and reduce scope rather than inventing business behavior.
