# API Functional Coverage Gap — R3

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Baseline main SHA reviewed:** `68a097876f0ffd71aa2b7a350dcaf7c0065fdd69`  
**Current effective API revision:** `api-v1-r2`  
**Proposed next revision after approval/contract design:** `api-v1-r3`  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

## 1. Purpose

This document compares the approved/current implementation with `INSURANCE_OPERATIONS_REQUIREMENTS_R3.md` and identifies the authoritative server capabilities that are missing before the broader Insurance Operations scope can be implemented.

It is a requirements/gap artifact, not an API Contract. It intentionally does not invent final endpoint paths, payload schemas or `operationId` values.

## 2. Current effective API baseline

The current API is composed of:

- immutable historical `api-v1-r1`: 10 operations;
- additive Claims Operations `api-v1-r2`: 5 operations;
- effective total: 15 operations.

### Current r1 operations

1. `verifyPolicyVehicle`
2. `createClaim`
3. `trackClaim`
4. `authenticateOperator`
5. `listClaims`
6. `getClaimDetail`
7. `downloadClaimEvidence`
8. `transitionClaimStatus`
9. `getLiveness`
10. `getReadiness`

### Current r2 additions

11. `listTasks`
12. `listClaimTasks`
13. `completeClaimTask`
14. `getClaimTimeline`
15. `getClaimEvidenceAttention`

The implementation confirms these boundaries in the NestJS controllers. The staff Claims query currently supports pagination + Claim `status` only. ClaimTask currently supports list, list-by-Claim and completion only, with task status limited to `OPEN | COMPLETED` at the HTTP boundary.

The current Application permission model contains only:

- `claims.intake.create`;
- `claims.tracking.read`;
- `claims.backoffice.read`;
- `claims.backoffice.transition`;
- `claims.mcp.status.read`.

The only staff role is `CLAIMS_OPERATOR`.

## 3. Coverage matrix

| R3 capability | Current coverage | Gap classification | Required next design work |
|---|---|---|---|
| Historical FR-001..FR-019 | Implemented/accepted baseline | PRESERVE | Regression traceability only |
| Claim operational projection | UI/client projection exists; no reusable authoritative pipeline API | PARTIAL / BLOCKED_BY_API | Domain/Application projection model + API contract |
| Server stage movement | No dedicated operational stage command | MISSING | Stage rules + concurrency + contract |
| Operational Claim search/filter/sort | `listClaims` supports page/pageSize/status | PARTIAL | Query semantics, safe search/sort, contract impact |
| Expanded ClaimTask lifecycle | list/list-by-claim/complete only | PARTIAL | create, assignment/reassignment, due/priority, cancellation, history, concurrency |
| Expanded Timeline | current Claim/Task/evidence timeline projection exists | PARTIAL | communication, pipeline, customer-response, resolution event families |
| Claims dashboard metrics | dashboard UI derives from current data; no dedicated metric contract | PARTIAL | metric semantics + read model/API |
| Pipeline definitions/stages | none | MISSING | Pipeline domain/config boundaries + persistence + contract |
| Pipeline work items | none as reusable server capability | MISSING | projection model + persistence + contract |
| Pipeline administration | none | MISSING | Admin permissions/versioning + contract |
| Communication templates | none | MISSING | Application port/model + persistence + API |
| Outbound communication | none | MISSING | port + simulated adapter + idempotent delivery contract |
| Delivery history/retries | none | MISSING | durable communication state + retry/dead-letter model |
| Inbound webhook/events | none | MISSING | auth/signature/replay/idempotency boundary + contract |
| Automation definitions | none | MISSING | versioned rule model/config API |
| Automation execution | none | MISSING | event/scheduler runtime + idempotency/audit |
| Customer 360 | no master Customer model/API | MISSING | domain/read model + redaction + API |
| Policy 360 | policy data only via legacy verification context | MISSING | modern normalized Policy model/projection + API |
| Insurer guidance | none | MISSING | version/provenance model + API |
| Customer authentication | none; only operator login exists | MISSING / CROSS-CUTTING | separate identity/auth architecture + security/API contract |
| Customer Portal self-service | public tracking only | PARTIAL | authenticated own-resource APIs |
| Post-submission evidence upload | explicitly deferred in historical MVP | MISSING / NEW SCOPE | authorization context, storage/audit rules + contract |
| ImportJob | none | MISSING | job lifecycle/persistence + preview/dry-run/commit API |
| Row-level import outcomes | none | MISSING | import result model + query API |
| Renewals | none | MISSING | synthetic Renewal domain/workflow + configuration + API |
| Collections | none | MISSING | synthetic Collection domain/workflow + API |
| Custom field definitions | none | MISSING | governed metadata model + admin API |
| Bulk actions | none | MISSING | per-item auth/outcome semantics + command contract |
| Expanded RBAC | single `CLAIMS_OPERATOR` role | MISSING / CROSS-CUTTING | Customer/Operator/Supervisor/Admin permission matrix |
| Scheduled work | none as governed reusable engine | MISSING | scheduler/job port + durable execution state |
| Dead-letter visibility | none | MISSING | durable failed-work projection + admin API |
| R2 requirement/use-case traceability | r2 inventory has empty `requirements` and `use_cases` arrays | TRACEABILITY GAP | map r2 operations into R3 requirements/use cases without modifying historical r2 artifact |

## 4. Existing code evidence relevant to the gap

### 4.1 API Presentation

Current `apps/api/src/controllers.ts` provides:

- public policy verification;
- public Claim creation/evidence upload;
- public Claim tracking;
- operator login;
- operator Claim list/detail/evidence/timeline/evidence-attention;
- Claim lifecycle transition;
- health endpoints.

Current `apps/api/src/task-controller.ts` provides:

- task list;
- tasks by Claim;
- task completion.

There are no controllers for Customer 360, Policy 360, Pipeline definitions/work items/admin, communications, integrations/webhooks, automations, imports, renewals, collections, custom fields or bulk actions.

### 4.2 Application boundary

Current `packages/application/src/index.ts` demonstrates the approved pattern that R3 must preserve:

- application-level ports;
- server-authoritative permissions;
- transactional use cases;
- audit port separated from technical logging;
- policy verification through a port;
- evidence storage through a port;
- JWT/token abstraction through a port;
- idempotency abstraction;
- explicit Claim transition rules from Domain.

R3 modules must extend this pattern rather than placing business rules in NestJS controllers, React, Prisma adapters, schedulers or provider clients.

### 4.3 Claims Operations increment

Existing modules provide useful foundations:

- `ClaimTask` domain/application/infrastructure;
- Claim Timeline projection;
- Evidence Attention projection;
- current Claims Operations read model/UI.

These are foundations to extend, not reasons to create duplicate Task/Timeline implementations.

## 5. Architecture impacts requiring review before API Contract R3

The R3 scope introduces material architecture concerns beyond adding routes.

### A-001 — Identity and RBAC expansion

Current staff identity is a single `CLAIMS_OPERATOR` role. R3 requires:

- Customer Portal identity separate from staff identity;
- Claims Operator;
- Claims Supervisor;
- Platform Administrator;
- non-human Integration and Automation actors.

This is cross-cutting security/API behavior and therefore must be designed before contract implementation.

### A-002 — Reusable operational Pipeline boundary

A new Pipeline capability must remain an operational/configuration boundary and must not absorb Claim lifecycle/domain invariants.

### A-003 — Async execution boundary

Communication delivery, webhook processing, automation, scheduler activity and imports require a durable job/execution model with retry/idempotency/dead-letter semantics.

No specific queue/broker technology is selected at Requirements stage.

### A-004 — Customer/Policy authority

The project must decide how modern Customer/Policy records relate to synthetic legacy eligibility data while preserving PostgreSQL authority for modern workflow and the legacy anti-corruption boundary.

### A-005 — Configuration authority/versioning

Pipeline definitions, Automation Rules, Communication Templates, Insurer Guidance and Custom Field Definitions can alter runtime behavior. Their version/provenance/activation model must be explicit.

### A-006 — Import transaction semantics

Architecture/API Contract must decide the commit policy for mixed-validity rows and define transaction/audit boundaries. Requirements deliberately do not guess atomic-vs-partial commit behavior.

### A-007 — Renewals/Collections domain boundaries

Renewal and Collection workflows require synthetic domain models and configuration semantics without importing unverified insurer-specific rules from reference material.

## 6. Data impacts requiring review

Likely new persisted concepts, subject to Data/Architecture design, include:

- Customer;
- Policy;
- Pipeline;
- PipelineStage;
- PipelineWorkItem / domain projection;
- expanded ClaimTask assignment/history fields;
- CommunicationTemplate;
- Communication;
- DeliveryAttempt;
- InboundEvent;
- AutomationDefinition / AutomationVersion;
- AutomationExecution;
- InsurerGuidance / version;
- ImportJob / ImportRowResult;
- Renewal work item/aggregate;
- Collection work item/aggregate;
- CustomFieldDefinition / values constrained to approved projections;
- ScheduledExecution / FailedWorkItem or equivalent durable execution state.

These are candidate concepts only until Data/Architecture approval.

## 7. Security impacts requiring review

R3 must explicitly address:

- separate customer vs staff tokens/sessions;
- role/permission least privilege;
- customer ownership/IDOR protection;
- webhook authentication/signature and replay protection;
- automated actor authorization;
- admin configuration authorization;
- communication destination/variable sanitization;
- synthetic PII-safe seed/projection policy;
- import upload safety;
- custom-field abuse/secret/PII prevention;
- bulk action per-item authorization;
- audit of human and automated administrative actions.

## 8. API Contract implications

After Requirements R3 and Architecture/Security/Data approval, API Contract Design should create a new revision rather than modifying historical r1/r2 artifacts.

Expected direction:

```text
api-v1-r1 (immutable historical baseline)
   + api-v1-r2 additions (immutable Claims Operations increment)
   + api-v1-r3 additions/approved cross-cutting changes
   = effective api-v1-r3
```

The future contract must:

- use stable unique `operationId` values;
- map every operation to R3 requirements/use cases;
- map authentication/permissions;
- define request/response/error contracts;
- define rate limits where applicable;
- define idempotency/concurrency semantics;
- define audit mappings;
- update OpenAPI before endpoint implementation;
- update Postman after OpenAPI validation;
- generate a new API impact artifact identifying every new/changed operation and revalidation scope.

Because R3 expands authentication/RBAC and introduces new cross-cutting error/idempotency/audit behavior, the later API impact is expected to require at least platform-level analysis. The exact Blueprint classification must be chosen from the canonical schema during API Contract Design, not guessed here.

## 9. Recommended implementation slices after contract approval

Implementation should be incremental even though R3 requirements cover the complete non-deferred functional target.

Recommended server sequence:

1. Expanded identity/RBAC foundation;
2. Claims Pipeline projection + expanded ClaimTask + operational query/dashboard;
3. Pipeline Engine + Pipeline Administration;
4. Customer 360 + Policy 360;
5. Communication Hub;
6. inbound integration boundary;
7. Automation/Scheduler/Dead-letter foundation;
8. Insurer Guidance;
9. Customer Portal + post-submission evidence;
10. Governed Imports;
11. Renewals;
12. Collections;
13. Custom Fields;
14. Bulk Actions;
15. final effective API r3 QA/reconciliation.

Each slice must preserve architecture conformance and may create narrower API-impact/revalidation evidence as required by the approved contract plan.

## 10. Gate conclusion

The current 15-operation `api-v1-r2` is a sound baseline, not a complete Insurance Operations API.

R3 requires substantial new Domain/Application/Data/Security/API work. Implementing controllers immediately would violate Blueprint 0.5.2 because the newly activated product-evolution capabilities were planning guidance rather than approved requirements/contracts.

Therefore the next correct gate is:

```text
Requirements R3 human approval
   -> Architecture / Security / Data R3 impact
   -> API Contract R3 Ready
   -> OpenAPI R3
   -> Implementation + Architecture Conformance
   -> OpenAPI Validation
   -> Postman
   -> API QA
   -> API Gate / impact-based revalidation
```

Historical accepted evidence remains preserved throughout.