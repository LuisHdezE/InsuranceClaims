# API Contract Revision R3 — Insurance Operations

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `7f5a33631644df5b7ce21aedd7358ac2ae33e197`  
**Previous effective revision:** `api-v1-r2`  
**Proposed effective revision:** `api-v1-r3`  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

> Unofficial technical case study. No affiliation with FAR Seguros. All customers, policies, claims, communications, rules, imports, financial/payment metadata and operational data are synthetic/demo data.

## 1. Authority and additive model

R3 is an additive API contract. The effective HTTP contract becomes:

```text
API_CONTRACT.md + API_ENDPOINT_INVENTORY.json
        +
post-mvp R2 additions
        +
API_CONTRACT_R3.md + API_ENDPOINT_INVENTORY_R3.json
        =
api-v1-r3
```

R3 does not rewrite `api-v1-r1`, `api-v1-r2`, accepted v0.1.0/v0.2.0 evidence, the published `v0.2.0` tag/release, or Blueprint Master.

The effective R3 surface contains **90 REST operations**:

- 15 inherited operations with stable `operationId` and route identity;
- 75 new operations;
- 7 inherited operations receive additive/cross-cutting semantic refinements explicitly listed in §4;
- the historical MCP `get_claim_status` tool remains read-only and outside OpenAPI REST counting.

`documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json` is the machine-oriented operation inventory for this contract.

## 2. Scope

R3 freezes REST scope for the approved non-deferred Insurance Operations requirements `FR-020..FR-052` while preserving historical `FR-001..FR-019`.

Included API capabilities:

- Claims operational work/pipeline;
- expanded ClaimTask lifecycle;
- Claims operational metrics;
- versioned Pipeline administration;
- versioned Communication Templates and outbound Communication history;
- authenticated inbound Integration Events;
- versioned Automation definitions;
- staff Customer 360 and Policy 360 reads;
- versioned synthetic Insurer Guidance;
- separate Customer Portal authentication/self-service/evidence;
- governed ImportJob lifecycle;
- Renewal operations;
- Collection operations including verified payment-state mutation;
- versioned Custom Field definitions;
- safe Bulk Actions;
- dead-letter operational visibility/recovery.

Still excluded:

- Sales pipeline;
- arbitrary additional pipeline consumer domains;
- full management BI/data warehouse;
- real insurer/core integration;
- real communication providers/credentials;
- real customer/claim/PII datasets;
- refresh tokens, password reset and external IdP/SSO;
- claim reopening;
- general audit-search REST API;
- generic database/table importer;
- arbitrary low-code scripting, `eval`, SQL or arbitrary outbound HTTP;
- destructive deletion of auditable history.

## 3. Route namespaces

| Namespace | Security context | Purpose |
|---|---|---|
| `/api/v1/public/*` | anonymous | historical intake/tracking |
| `/api/v1/operator/*` | staff JWT | operational Claims/Tasks/Customers/Policies/Communications/Renewals/Collections/Bulk |
| `/api/v1/admin/*` | staff JWT + admin permissions | governed configuration/imports/integration diagnostics/dead-letter recovery |
| `/api/v1/portal/*` | customer JWT | own-resource customer self-service |
| `/api/v1/integrations/*` | HMAC integration identity | authenticated inbound events |
| `/health/*` | operational probe | liveness/readiness |

Admin route location never grants authorization by itself. Permission enforcement remains Application/API authoritative.

## 4. Historical compatibility

The following 15 inherited `operationId` values and paths remain stable:

`verifyPolicyVehicle`, `createClaim`, `trackClaim`, `authenticateOperator`, `listClaims`, `getClaimDetail`, `downloadClaimEvidence`, `transitionClaimStatus`, `getLiveness`, `getReadiness`, `listTasks`, `listClaimTasks`, `completeClaimTask`, `getClaimTimeline`, `getClaimEvidenceAttention`.

Seven receive reviewed R3 refinements:

| operationId | R3 refinement | Breaking? |
|---|---|---|
| `authenticateOperator` | staff JWT may represent Operator/Supervisor/Admin; still staff-only | no route/request break |
| `listClaims` | additive `stage`, `search`, `sort` query support | no |
| `getClaimDetail` | additive Customer/Policy/Pipeline references | no |
| `listTasks` | new task permission intent + additive assignment/priority/overdue filters | no for approved Operator role |
| `listClaimTasks` | new task permission intent | no for approved Operator role |
| `completeClaimTask` | new task permission intent; historical `expectedStatus` remains required; persisted optimistic check added internally | no request break |
| `getClaimTimeline` | additive R3 event families | no |

Historical public operations, Claim lifecycle routes and evidence download semantics remain otherwise unchanged.

## 5. Global HTTP conventions

### 5.1 Versioning and media types

Business routes remain `/api/v1`. Health remains unversioned.

Default JSON: `application/json`.  
Errors: `application/problem+json`.  
Evidence/import upload operations use `multipart/form-data`.  
Evidence download keeps historical allowlisted binary media behavior.

### 5.2 Correlation

`X-Request-Id` remains the canonical request/correlation header.

For every `/api/v1` request:

- acceptable caller value may be propagated;
- otherwise the server generates one;
- response includes `X-Request-Id`;
- value propagates into Application context, logs, applicable audit, async/outbox/jobs and integration correlation;
- it is never authentication material.

### 5.3 Pagination/search/sort

R3 paginated operations use the existing `page` / `pageSize` style.

- `page`: default `1`, minimum `1`;
- `pageSize`: default `25`, maximum `100`;
- deterministic ordering is mandatory;
- operation-specific sort fields are allowlisted;
- server adds a stable resource-ID tie breaker;
- generic caller-supplied SQL/field expressions are forbidden;
- `search` uses bounded server-defined semantics and never becomes arbitrary query syntax.

### 5.4 Dates

API timestamps are RFC 3339 UTC instants unless a schema explicitly represents a calendar date. Metrics windows use `[from,to)` semantics.

## 6. Authentication contract

### 6.1 Staff JWT

`POST /api/v1/operator/auth/login` retains `authenticateOperator`.

R3 staff access token:

- Bearer JWT;
- target lifetime 900 seconds;
- allowed roles: `CLAIMS_OPERATOR`, `CLAIMS_SUPERVISOR`, `PLATFORM_ADMIN`;
- dedicated staff issuer/audience/signing configuration;
- minimal subject/role/context/issued/expiry claims;
- no refresh token;
- no server logout endpoint;
- Argon2id password verification remains Infrastructure.

### 6.2 Customer JWT

`POST /api/v1/portal/auth/login` uses `authenticateCustomer`.

Customer token:

- Bearer JWT;
- target lifetime 1800 seconds;
- context `customer`;
- dedicated issuer/audience/signing configuration distinct from staff;
- subject maps to one synthetic CustomerAccount/Customer authorization context;
- no refresh token;
- no server logout endpoint.

A valid staff token on a customer route, or valid customer token on a staff route, fails with `401 AUTHENTICATION_CONTEXT_MISMATCH`.

### 6.3 Integration HMAC

`POST /api/v1/integrations/events` requires:

- `X-Integration-Key`;
- `X-Event-Id`;
- `X-Event-Timestamp` as Unix epoch seconds;
- `X-Event-Signature` as lowercase hexadecimal HMAC-SHA256.

Canonical signing input:

```text
<timestamp>\n<eventId>\n<SHA256(rawBody)>
```

The server resolves the integration secret from runtime secret configuration, never from committed fixtures. Permitted timestamp skew is **±300 seconds**. Replay identity is `(integration key, event id)` and accepted events persist the body digest. Same identity with a different digest is rejected.

## 7. Permission contract

Requirement permission intents remain authoritative. R3 adds only API-level permissions required to separate approved admin/operations responsibilities.

### 7.1 Core permission intents

Historical permissions remain:

- `claims.intake.create`;
- `claims.tracking.read`;
- `claims.backoffice.read`;
- `claims.backoffice.transition`;
- `claims.mcp.status.read`.

R3 requirement permissions:

- `claims.tasks.read`, `claims.tasks.manage`;
- `claims.pipeline.read`, `claims.pipeline.transition`;
- `claims.analytics.read`;
- `communications.read`, `communications.send`;
- `customers.read`, `policies.read`;
- `portal.self.read`, `portal.self.evidence.create`;
- `pipelines.admin`, `custom_fields.admin`, `automations.admin`, `imports.execute`;
- `renewals.read`, `renewals.manage`;
- `collections.read`, `collections.manage`;
- `bulk.execute`;
- `integration.events.ingest`.

Contract-level permissions derived directly from approved admin/operational requirements:

- `communications.admin` for Communication Template administration;
- `guidance.admin` for Insurer Guidance administration;
- `operations.integration.read` for accepted-event diagnostics;
- `operations.dead_letters.read` and `operations.dead_letters.manage` for FR-052 recovery visibility.

### 7.2 Role grants

`CLAIMS_OPERATOR` receives normal Claims/Task/Pipeline/Communication/Customer/Policy/Renewal/Collection operational permissions, but not analytics, bulk or configuration administration.

`CLAIMS_SUPERVISOR` receives Operator grants plus `claims.analytics.read` and `bulk.execute`.

`PLATFORM_ADMIN` receives approved configuration/import/operational-support grants and `claims.analytics.read`; it does **not** receive an implicit Claim-lifecycle superuser bypass.

Customer and Integration principals receive only their separate context permissions.

The exact operation-to-permission matrix is frozen in `API_ENDPOINT_INVENTORY_R3.json`.

## 8. Idempotency contract

Historical `createClaim` behavior remains unchanged: `Idempotency-Key` length/fingerprint/replay semantics and 24-hour retention remain compatible with r1.

R3 requires `Idempotency-Key` for:

- `createClaimTask`;
- `requestCommunication`;
- `uploadPortalClaimEvidence`;
- `createImportJob`;
- `commitImportJob`;
- `executeBulkOperation`.

R3 uses the same logical response behavior as historical idempotency:

- same key + same fingerprint: replay original logical response and mark replay;
- same key + different fingerprint: `409 IDEMPOTENCY_KEY_REUSED`;
- same key while in progress: `409 IDEMPOTENCY_IN_PROGRESS`.

Retention target for these HTTP keys is 24 hours.

`ingestIntegrationEvent` uses signed external event identity instead of `Idempotency-Key`; replay records target 30 days in the continuous demo environment.

Mutation operations protected by `expectedVersion`, `expectedDefinitionVersion` or historical `expectedFromStatus`/`expectedStatus` do not require a separate idempotency key unless explicitly listed above.

## 9. Concurrency contract

R3 conflict-prone writes expose an explicit caller guard.

- Pipeline work-item movement: `expectedVersion`;
- ClaimTask update/cancel: `expectedVersion`;
- historical `completeClaimTask`: historical `expectedStatus` remains required, with an internal persisted optimistic check;
- Pipeline/Template/Automation/Guidance/CustomField version creation/activation/state changes: `expectedDefinitionVersion` where applicable;
- Import lifecycle mutations: `expectedVersion`;
- Renewal/Collection mutations: `expectedVersion`;
- Collection payment-state change: `expectedVersion` plus approved verification rule;
- dead-letter requeue/resolve: `expectedVersion`;
- historical Claim lifecycle: `expectedFromStatus` remains the public compatibility guard.

A stale R3 integer/version guard returns `409 RESOURCE_VERSION_CONFLICT` unless a more specific stable conflict code below applies.

## 10. RFC 9457 error contract

All non-binary errors remain RFC 9457 Problem Details with historical `type`, `title`, `status`, `detail`, `instance`, `code`, `requestId`, and optional field `errors` behavior.

Historical stable codes remain unchanged. R3 adds:

| HTTP | code | Meaning |
|---:|---|---|
| 401 | `AUTHENTICATION_CONTEXT_MISMATCH` | valid token belongs to wrong staff/customer context |
| 401 | `INTEGRATION_SIGNATURE_INVALID` | HMAC/key authentication failed |
| 401 | `INTEGRATION_TIMESTAMP_INVALID` | signed timestamp malformed/outside allowed skew |
| 404 | `RESOURCE_NOT_FOUND` | R3 resource absent or ownership-safe denial |
| 409 | `RESOURCE_VERSION_CONFLICT` | stale R3 optimistic version |
| 409 | `INVALID_OPERATIONAL_STAGE_TRANSITION` | move not allowed by pinned PipelineVersion |
| 409 | `INVALID_TASK_STATE` | task mutation invalid for current terminal/lifecycle state |
| 409 | `CONFIGURATION_VERSION_IMMUTABLE` | attempted mutation of activated immutable version |
| 409 | `CONFIGURATION_ACTIVATION_CONFLICT` | invalid/stale activation or definition state |
| 409 | `INTEGRATION_REPLAY_DETECTED` | signed event identity replay/body mismatch |
| 409 | `IMPORT_STATE_CONFLICT` | ImportJob lifecycle operation invalid |
| 409 | `DEAD_LETTER_STATE_CONFLICT` | dead-letter recovery action invalid |
| 422 | `INTEGRATION_SCHEMA_INVALID` | authenticated event fails event schema |
| 422 | `AUTOMATION_DEFINITION_INVALID` | automation DSL/version fails allowlist validation |
| 422 | `CUSTOM_FIELD_DEFINITION_INVALID` | custom field targets invalid/protected metadata |
| 422 | `IMPORT_MAPPING_INVALID` | mapping/row schema invalid |
| 422 | `BULK_ACTION_INVALID` | unsupported/oversized bulk request |

Portal ownership denial intentionally collapses to `404 RESOURCE_NOT_FOUND` to avoid IDOR disclosure.

R3 errors never expose JWTs, HMAC signatures/secrets, provider credentials, raw webhook bodies, raw import rows, storage paths, SQL/Prisma detail or stack traces.

## 11. Rate-limit families

Historical rate limits remain compatible.

R3 defaults:

| Surface | Limit |
|---|---|
| protected staff reads | 120/min/principal |
| protected staff mutations | 60/min/principal |
| admin configuration writes | 30/min/admin |
| customer login | 5/min/IP + 10/15m/normalized login |
| customer reads | 120/min/customer |
| portal evidence upload | 10/min/customer |
| integration ingestion | 120/min/integration key |
| import upload | 5/min/admin |
| import lifecycle writes | 30/min/admin |
| bulk operation | 10/min/supervisor |
| dead-letter mutation | 20/min/admin |

`429` includes `Retry-After` when meaningful.

## 12. Operation families

Exact methods, paths, success contracts, permissions and traceability are in the inventory. The family count is frozen as follows:

| Family | Effective operations |
|---|---:|
| historical r1/r2 surface | 15 |
| Claims operational/task/metrics additions | 6 |
| Pipeline administration | 6 |
| Communication Template administration | 6 |
| Communication operations | 3 |
| Integration | 2 |
| Automation administration | 6 |
| Customer/Policy 360 | 4 |
| Insurer Guidance administration | 6 |
| Customer Portal | 7 |
| ImportJob | 9 |
| Renewals | 4 |
| Collections | 5 |
| Custom Field administration | 6 |
| Bulk | 1 |
| Dead-letter operations | 4 |
| **Total** | **90** |

## 13. Core request contracts

### 13.1 Operational stage movement

`MoveOperationalStageRequest`:

```json
{"toStageKey":"review","expectedVersion":3}
```

The stage key must belong to the work item's pinned PipelineVersion and the move must be allowed by that same version. The operation never implicitly mutates Claim/Renewal/Collection lifecycle.

### 13.2 ClaimTask

`CreateClaimTaskRequest` carries approved task type/title, optional bounded description, priority, optional assignee/queue and optional due date. Provenance/correlation comes from server context plus approved source input.

`UpdateClaimTaskRequest` carries `expectedVersion` and one or more of assignment/queue/priority/due-date mutable fields. Status is not directly patchable.

`CancelClaimTaskRequest` requires `expectedVersion`; any cancellation classification is bounded/allowlisted.

### 13.3 Versioned configuration

Pipeline, Communication Template, Automation, Guidance and Custom Field families share these semantics:

- create definition also creates initial immutable-content **DRAFT v1**;
- create subsequent version requires `expectedDefinitionVersion` and never edits active content;
- activation requires `expectedDefinitionVersion` and an eligible DRAFT version;
- activation makes runtime version content immutable;
- state/disable operation changes definition runtime availability without arbitrary content edits;
- provenance/source classification is required for behavior-affecting content;
- existing PipelineWorkItems remain pinned to their original PipelineVersion.

Automation payloads are schema-constrained to the approved `WHEN / IF / WAIT / THEN` DSL and allowlisted actions. No executable code/SQL/URL is accepted.

### 13.4 Communication request

`RequestCommunicationRequest` identifies an approved `templateVersionId`, channel, target context/reference and allowlisted variables. Application re-authorizes target context and template/channel compatibility. Response `202` means the logical Communication is accepted/queued, not delivered.

### 13.5 Integration event

The event request contains an allowlisted `eventType` and event-family schema payload. External event identity belongs to the signed header. `202` means authenticated/validated acceptance and durable processing intent, not completed domain processing.

### 13.6 Portal evidence

Portal evidence upload requires:

- authorized own Claim;
- outstanding action/evidence context when required;
- historical allowlisted MIME/size/count safety policy;
- non-public evidence storage;
- generated safe storage references;
- append-only evidence metadata/history;
- `Idempotency-Key`.

The operation cannot replace or delete historical evidence.

### 13.7 ImportJob

R3 import upload accepts only the approved demo technical types:

- CSV (`text/csv`);
- XLSX (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

Technical portfolio caps:

- maximum source file: **10 MiB**;
- maximum parsed rows: **5000**;
- no authoritative mutation before explicit Commit;
- Preview/Mapping/Validation/Dry Run are staging-only;
- Commit uses row-partial semantics only for independent rows;
- `commitImportJob` returns `202`; job/row outcomes are read through normal Import endpoints.

These are demo engineering limits, not insurer rules.

### 13.8 Renewals/Collections

Renewal and Collection aggregate transitions accept only their approved minimal domain terminal transitions and require `expectedVersion`.

Operational stage movement is separate and cannot substitute for aggregate lifecycle.

`updateCollectionPaymentState` requires an approved payment-state value, `expectedVersion`, and server-side verification. An inbound payment-intention event alone cannot mark authoritative payment state.

### 13.9 Bulk

`executeBulkOperation`:

- Supervisor only;
- maximum 100 items;
- `Idempotency-Key` required;
- only allowlisted action types;
- each item executes equivalent single-item authorization, domain validation and concurrency;
- response is synchronous `200` with independent per-item outcomes;
- response may be partial success and must never claim global success if an item failed.

### 13.10 Dead-letter

Admin may list/read sanitized dead-letter records. `requeueDeadLetter` and `resolveDeadLetter` require `expectedVersion`, produce durable audit, and never expose raw secret-bearing payloads.

## 14. Response projection rules

- Public tracking retains historical redaction and never exposes internal Claim UUID.
- Staff Customer/Policy 360 uses staff-safe synthetic projections and does not make modern Policy eligibility authoritative.
- Portal responses enforce Customer ownership server-side and expose customer-safe timeline/guidance/communications only.
- Configuration responses include version/provenance/status metadata but not secrets.
- Integration/async diagnostic responses expose sanitized status/failure categories only.
- Communication responses never expose provider credentials or raw secret destination material.
- Import row responses expose only sanitized demo row projections and validation outcomes.

## 15. Async acceptance semantics

Operations returning `202` represent durable acceptance, not completed downstream work:

- `requestCommunication`;
- `ingestIntegrationEvent`;
- `commitImportJob`;
- `requeueDeadLetter`.

Worker execution is at-least-once; handlers are idempotent. No API contract claims exactly-once processing.

## 16. Audit mapping

Meaningful mutations use the approved R3 audit catalog. Major mappings include:

- task create/assign/update/complete/cancel → `CLAIM_TASK_*`;
- pipeline movement/versioning → `PIPELINE_*`;
- communication request → `COMMUNICATION_REQUESTED`;
- integration acceptance → `INBOUND_EVENT_ACCEPTED`;
- automation versioning → `AUTOMATION_*`;
- customer evidence → `CUSTOMER_EVIDENCE_ADDED`;
- imports → `IMPORT_*`;
- renewal/collection terminal actions → `RENEWAL_CASE_*` / `COLLECTION_CASE_*`;
- collection payment-state mutation → `COLLECTION_PAYMENT_STATE_CHANGED`;
- bulk summary → `BULK_OPERATION_REQUESTED` + `BULK_OPERATION_COMPLETED`;
- dead-letter recovery → `DEAD_LETTER_REQUEUED` / `DEAD_LETTER_RESOLVED`.

Reads do not invent durable audit where the approved audit model does not require it.

## 17. Change impact

R3 is `platform_cross_cutting` because it expands staff RBAC/auth semantics, adds a separate customer security context, extends the error family, introduces new schemas and changes permissions on existing R2 task operations.

The authoritative impact artifact is `.blueprint/api-impact/API-IMPACT-002.json`.

Existing unrelated accepted evidence must be preserved. Existing client revalidation follows Blueprint platform policy rather than rewriting frozen evidence.

## 18. Traceability

Every operation in `API_ENDPOINT_INVENTORY_R3.json` links to approved FR and UC identifiers. The effective contract covers every `FR-020..FR-052` at least once and preserves historical coverage.

The inventory also freezes:

- operationId;
- method/path;
- authentication context;
- permission;
- success response contract;
- idempotency/concurrency obligations;
- durable audit mapping;
- requirement/use-case traceability.

## 19. What this contract does not authorize

API Contract R3 approval does **not** authorize merge by itself and does not skip later Blueprint phases.

No Prisma schema/migration, NestJS controller, Application use case, Worker, OpenAPI, Postman or frontend implementation is changed by this contract PR.

Per canonical Blueprint 0.5.2 phase order, after this contract is approved and merged the next phase is **API Implementation**, followed by **OpenAPI Formalization & Validation**, **Postman**, **API QA**, and the **API Gate**.

## 20. Blueprint readiness mapping

This package is intended to satisfy, for human review:

- `api.scope_defined`;
- `api.endpoint_inventory`;
- `api.auth_contract`;
- `api.permission_matrix`;
- `api.audit_event_mapping`;
- `api.idempotency_matrix`;
- `api.contract_traceability`;
- `api.change_impact_analysis`.

Machine/document readiness is not human approval.