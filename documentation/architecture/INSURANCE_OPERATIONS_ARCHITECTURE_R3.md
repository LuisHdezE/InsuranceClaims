# Architecture Contract Revision R3 — Insurance Operations

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `303b09c5746dd545586097412b4f42170bd14664`  
**Requirements:** `INSURANCE_OPERATIONS_REQUIREMENTS_R3.md`  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

> Unofficial technical case study. No affiliation with FAR Seguros. All customers, policies, claims, communications, rules, imports, financial/payment metadata and operational data are synthetic/demo data.

## 1. Authority and additive model

This document is an additive architecture revision. The effective architecture for R3 is:

```text
ARCHITECTURE.md (historical approved baseline)
        +
INSURANCE_OPERATIONS_ARCHITECTURE_R3.md
        =
effective R3 architecture contract
```

R3 does not rewrite the accepted MVP architecture, `api-v1-r1`, `api-v1-r2`, the published `v0.2.0` release, or historical evidence.

The following baseline decisions remain authoritative unless explicitly refined here:

- Clean Architecture + Ports & Adapters;
- `packages/domain` and `packages/application` remain framework independent;
- NestJS remains an outer REST Presentation adapter;
- Prisma/PostgreSQL remain Infrastructure concerns;
- PostgreSQL remains authoritative for modern workflow state;
- the SIMULATED LEGACY SYSTEM remains authoritative only for synthetic policy/vehicle eligibility verification;
- MCP remains a separate read-only Presentation boundary;
- RFC 9457 Problem Details remains the REST error family;
- URL major versioning remains `/api/v1`;
- durable audit remains separate from technical logging;
- Domain/Application remain authoritative over business/security behavior.

## 2. R3 architecture goals

R3 extends the claims-modernization core into a governed Insurance Operations API without turning the system into a generic CRUD CRM.

Required qualities:

1. preserve Claim lifecycle authority and existing accepted behavior;
2. introduce reusable operational capabilities only where they have approved consumers;
3. separate Customer Portal identity from staff identity;
4. provide explicit least-privilege RBAC for Operator, Supervisor and Administrator;
5. make async work durable, retryable, idempotent and observable without introducing infrastructure solely for appearance;
6. version runtime configuration that can alter behavior;
7. make Pipeline a projection/work-management capability rather than a replacement for domain aggregates;
8. prevent automation, imports, bulk operations and webhooks from bypassing normal Application/Domain rules;
9. keep all external providers simulated unless separately approved;
10. preserve exact-head architecture implementation conformance as a later REQUIRED Blueprint check.

## 3. Architectural style

### 3.1 Modular monolith for the modern core

The R3 modern core remains a modular monolith deployed primarily through the existing API and new Worker process.

This is deliberate. R3 does **not** justify microservice decomposition for each capability.

Logical bounded modules are enforced inside the existing Clean Architecture packages:

```text
packages/domain/
  Claims
  WorkManagement
  Pipeline
  CustomerPolicy
  Communications
  Automation
  Imports
  Renewals
  Collections
  Configuration
  Identity

packages/application/
  same capability boundaries + use cases + ports

packages/infrastructure/
  persistence / async runtime / provider / security adapters
```

Physical source folders may use kebab-case or another consistent repository convention, but dependency ownership above is authoritative.

### 3.2 Runtime topology

R3 adds one modern runtime:

```text
apps/api/                 REST Presentation + composition
apps/web/                 React client
apps/mcp/                 MCP Presentation + composition
apps/worker/              async/scheduled execution adapter + composition
apps/legacy-simulator/    SIMULATED LEGACY SYSTEM
```

`apps/worker` is not a business-logic layer. It leases durable work, reconstructs Application context and invokes Application handlers/use cases.

It may not contain business transition matrices, insurer rules, direct Prisma business mutations or provider-specific decisions.

## 4. Dependency direction

The baseline dependency direction remains:

```text
REST / MCP / Worker Presentation-Operational Adapters
                    |
                    v
               Application
                    |
                    v
                  Domain

Infrastructure --implements--> Application ports
```

Additional R3 prohibitions:

- Worker -> Prisma business mutation without an Application port/use case;
- Automation evaluation -> arbitrary JavaScript/eval/provider client;
- Pipeline module -> direct mutation of Claim/Renewal/Collection state;
- Customer Portal controller -> staff repository shortcuts;
- Communication Application services -> concrete email/WhatsApp SDK;
- Integration controller -> direct domain/persistence mutation;
- Import parser -> direct repository commit during preview/validation/dry-run;
- Bulk orchestration -> bypass of single-item authorization/business rules;
- configuration JSON -> executable code.

## 5. Context map and authority

| Context | Authority | Depends on / collaborates through |
|---|---|---|
| Claims | Claim lifecycle, evidence association, Claim invariants | Customer/Policy references, WorkManagement, Audit |
| WorkManagement | ClaimTask lifecycle, operational work-item mutation/history | Claims reference, Pipeline definition, Identity |
| Pipeline | versioned pipeline/stage configuration and work-item stage projection | Configuration, domain references only |
| CustomerPolicy | modern Customer/Policy master/projection and relationships | legacy identifiers through adapter-facing data only |
| Communications | template versions, Communication lifecycle, delivery intent/history | Customer/Claim context through Application queries, provider port |
| Integration | authenticated inbound event acceptance/replay/idempotency | Application commands, no domain shortcut |
| Automation | versioned rules and execution provenance | allowlisted Application actions only |
| Imports | ImportJob lifecycle, mapping/validation/dry-run/commit outcomes | approved importer ports/use cases |
| Renewals | synthetic renewal aggregate/invariants | CustomerPolicy, WorkManagement, Pipeline, Communications |
| Collections | synthetic collection aggregate/invariants | CustomerPolicy, WorkManagement, Pipeline, Communications, Integration |
| Configuration | provenance/version activation semantics shared by governed definitions | Audit |
| Identity | staff/customer account context and role/account state | Password/token ports, Customer relation |

Cross-context calls at Application level SHOULD prefer explicit query/command interfaces rather than direct aggregate mutation.

## 6. Domain model revision

### 6.1 Claim

The existing `Claim` aggregate remains authoritative and its lifecycle is unchanged:

```text
RECEIVED -> UNDER_REVIEW
UNDER_REVIEW -> OBSERVED
UNDER_REVIEW -> APPROVED
OBSERVED -> UNDER_REVIEW
APPROVED -> IN_REPAIR
APPROVED -> CLOSED
IN_REPAIR -> CLOSED
```

R3 Pipeline stages, task completion, communication delivery, import processing and automation **cannot directly change this state**.

Any automated or bulk Claim transition must call the same authoritative Claim transition Application use case and Domain transition behavior as a human operation.

### 6.2 ClaimTask aggregate

Existing ClaimTask becomes the first-class WorkManagement aggregate for Claim work.

R3 lifecycle:

```text
OPEN -> COMPLETED
OPEN -> CANCELLED
```

`COMPLETED` and `CANCELLED` are terminal for the same task instance.

Owned behavior:

- create with provenance/correlation;
- assign/reassign to supported operator/queue;
- change approved priority/due date while OPEN;
- complete;
- cancel;
- optimistic concurrency version;
- append durable task history for meaningful changes.

Task lifecycle never mutates Claim lifecycle implicitly.

### 6.3 PipelineDefinition and PipelineVersion

A pipeline definition is a governed configuration identity. Published runtime behavior is represented by immutable versions.

Conceptual model:

```text
PipelineDefinition
  id
  key
  consumerType (CLAIM | RENEWAL | COLLECTION)
  enabled
  activeVersionId

PipelineVersion
  id
  definitionId
  versionNumber
  status (DRAFT | ACTIVE | RETIRED)
  stages[]
  provenance
  createdAt
  activatedAt
```

A version contains ordered stages, stable stage keys, display metadata, reporting flags and allowed stage-move metadata.

Once ACTIVE, a version is immutable. Editing creates a new version.

### 6.4 PipelineWorkItem aggregate/projection

A PipelineWorkItem is an operational projection referencing one authoritative domain item.

Core invariants:

- one current pipeline work item per `(consumerType, consumerId, pipelineDefinition)` where applicable;
- pinned to a concrete `pipelineVersionId`;
- current stage must belong to that version;
- move must be allowed by that pinned version;
- optimistic concurrency version required;
- stage move appends history;
- stage movement never implicitly mutates the referenced domain aggregate.

Activation of a new PipelineVersion does **not** silently reinterpret existing work items. Existing items remain pinned until an explicit reviewed migration/rebinding operation exists.

### 6.5 Customer

Customer is a modern synthetic master aggregate/entity for operational relationships.

Core values:

- customerId;
- synthetic display identity fields approved for the demo;
- status/active state;
- timestamps.

The portfolio repository continues to prohibit real PII.

### 6.6 Policy

Policy is a modern normalized operational aggregate/projection related to Customer.

It owns modern metadata and relationships required by R3, but does **not** become authority for current eligibility merely because a record exists.

Core values:

- policyId;
- customerId;
- modern policy reference;
- legacy/synthetic reference(s);
- synthetic insurer reference/context;
- insured asset references;
- approved operational metadata;
- active record state for modern data management.

`PolicyVerificationPort` and the legacy anti-corruption adapter remain authoritative for eligibility checks required by historical FR-001/FR-002.

### 6.7 CommunicationTemplate / Communication

Governed templates use immutable versions after activation.

`Communication` is an aggregate/record of an approved outbound request:

- communicationId;
- channel;
- templateVersionId;
- target context/reference;
- sanitized destination token/reference appropriate to the synthetic demo;
- rendered-variable snapshot limited to approved values;
- status (`QUEUED`, `DELIVERING`, `DELIVERED`, `FAILED`, `CANCELLED` where allowed);
- idempotency/delivery identity;
- correlation;
- timestamps.

Delivery attempts are append-only child records/projections. Provider adapters are simulated for R3.

### 6.8 InboundEvent

InboundEvent represents an accepted external event after boundary authentication and schema validation.

It owns:

- source/integration identity;
- external event identity;
- payload hash;
- accepted sanitized payload/projection;
- ingestion status;
- processing status;
- correlation;
- timestamps.

Unique source + external event identity provides replay/idempotency protection.

### 6.9 AutomationDefinition / AutomationVersion

Automation rules are configuration, not executable source code.

An immutable active version contains a constrained DSL/schema:

```text
WHEN <allowlisted event>
IF <allowlisted field/operator conditions>
WAIT <optional bounded schedule>
THEN <allowlisted Application actions>
```

No `eval`, arbitrary JavaScript, SQL, HTTP URL, provider command or dynamic module import is permitted.

Each action maps to an explicit Application command capability.

### 6.10 AutomationExecution

AutomationExecution records one logical execution against one immutable rule version and triggering identity.

It owns:

- deterministic execution identity/idempotency key;
- rule version;
- trigger reference;
- status;
- started/completed timestamps;
- action execution records;
- sanitized failure classification;
- correlation.

### 6.11 ImportJob

Lifecycle:

```text
UPLOADED
 -> PREVIEWED
 -> MAPPED
 -> VALIDATED
 -> DRY_RUN_READY
 -> COMMITTING
 -> COMPLETED | COMPLETED_WITH_ERRORS | FAILED | CANCELLED
```

No authoritative business mutation is permitted before explicit Commit.

R3 commit policy is **row-partial for independent rows**:

- each eligible row is committed in its own Application transaction;
- invalid/rejected rows do not block valid independent rows;
- every row receives an explicit outcome;
- the job never reports all-success if any row failed;
- import types with cross-row atomicity requirements are not eligible for this R3 generic commit mode and require a later architecture decision.

### 6.12 RenewalCase

A synthetic RenewalCase is a strong domain work aggregate linked to Customer/Policy.

The aggregate does not hardcode insurer expiry/grace/deadline rules from reference material.

Minimal business state is intentionally neutral:

```text
OPEN -> COMPLETED
OPEN -> CANCELLED
```

Operational stage detail belongs to the pinned Renewal pipeline projection and approved configuration.

### 6.13 CollectionCase

A synthetic CollectionCase is a strong work aggregate linked to Customer/Policy with approved payment-state metadata.

Minimal case state:

```text
OPEN -> COMPLETED
OPEN -> CANCELLED
```

Incoming payment-intention events do not directly mark authoritative payment state. They enter Integration and invoke an approved verification/Application flow.

### 6.14 CustomFieldDefinition

Custom fields are governed metadata for explicitly supported operational projections.

Definitions are versioned and typed. Initial supported value families may include string, number, boolean, date and finite enum values. Exact API representation belongs to API Contract R3.

Custom fields cannot target protected strongly typed fields, permissions, lifecycle status, secrets or authentication/security data.

## 7. Identity and RBAC architecture

### 7.1 Staff identity

Existing `Operator` identity evolves to support:

- `CLAIMS_OPERATOR`;
- `CLAIMS_SUPERVISOR`;
- `PLATFORM_ADMIN`.

Historical operator behavior remains valid.

Role is translated to an explicit Application permission set. Controllers/UI never infer authorization merely from role labels.

### 7.2 Customer identity

Customer Portal uses a separate `CustomerAccount` identity linked to exactly one synthetic Customer for R3.

Staff and customer credentials/tokens are not interchangeable.

### 7.3 Access tokens

R3 keeps access-token-only authentication for the portfolio/demo boundary.

- staff token: short-lived JWT, target 15 minutes;
- customer token: short-lived JWT, target 30 minutes;
- separate issuer/audience and signing configuration for staff vs customer;
- no refresh token/session database in R3;
- logout remains client-side token disposal;
- Argon2id remains preferred password hashing adapter;
- no password reset/account recovery flow is activated by R3 requirements.

### 7.4 External integration authentication

Inbound integration requests use HMAC-SHA256 request signing with a configured integration key identity and secret resolved through an Infrastructure credential port/configuration source.

The database may store the non-secret integration key identifier and enabled state, but committed source/database fixtures do not contain live secrets.

The signature covers a canonical combination of timestamp, external event identity and raw body digest. API Contract R3 freezes exact headers/canonicalization and permitted clock skew.

### 7.5 Automation system principal

Worker-executed automation uses an internal non-human Application actor context with a fixed permission allowlist derived from the action type/rule approval.

It does not use a blanket administrator role.

## 8. Permission policy

Requirement permission intents are authoritative inputs. Architecture groups them into role grants without making UI authoritative.

High-level grants:

| Actor | Architectural grant intent |
|---|---|
| Customer Portal User | own-resource portal read + authorized own evidence create |
| Claims Operator | claim/task/pipeline operational read/write + approved communications |
| Claims Supervisor | operator grants + analytics, reassignment and approved bulk actions |
| Platform Administrator | configuration/import administration + necessary read-only support context, not implicit Claim lifecycle override |
| External Integration | only authenticated event ingestion |
| Automation Runtime | allowlisted action permissions for active rule version |
| MCP Client | historical customer-safe read-only status only |

API Contract R3 must expand this into an operation-level permission matrix.

## 9. Customer/Policy authority model

PostgreSQL becomes authoritative for **modern Customer/Policy operational master data and relationships** introduced by R3.

This does not change legacy eligibility authority:

```text
Modern Customer/Policy record
        !=
current eligibility truth
```

For historical claim intake, Application still calls `PolicyVerificationPort` before mutation.

Claims retain their verified policy/vehicle snapshot/reference so historical evidence does not change if the modern Customer/Policy projection later changes.

Legacy wire DTOs and URLs remain Infrastructure-only.

## 10. Durable async architecture

### 10.1 Decision

R3 uses PostgreSQL-backed durable async execution instead of introducing Redis/Kafka/RabbitMQ.

Reasons:

- current workload is portfolio/demo scale;
- PostgreSQL is already authoritative and operationally proven in the project;
- requirements need durability/idempotency/retry/dead-letter, not broker-specific semantics;
- a queue/broker can be introduced later behind ports if measured need exists.

### 10.2 Durable event outbox

Business transactions that must trigger asynchronous follow-up append an `outbox_event` in the same PostgreSQL transaction as the authoritative change.

The Worker leases unpublished/processable events and invokes Application event handlers.

Outbox does not mean event sourcing. Current-state tables remain authoritative.

### 10.3 Async jobs

Scheduled/retryable work is represented by durable jobs with:

- job type;
- canonical idempotency key;
- sanitized payload/reference;
- status;
- attempt count;
- `available_at`;
- lease owner/expiry;
- max attempts/backoff policy identifier;
- correlation;
- last sanitized failure category.

Infrastructure claims work using PostgreSQL transaction/locking semantics equivalent to `FOR UPDATE SKIP LOCKED` where cleanly supported.

Lease expiry permits recovery after worker crash. Every handler must still be idempotent because at-least-once execution is assumed.

### 10.4 Dead-letter

Jobs/events that exceed bounded retry policy or are classified non-retryable move to durable dead-letter visibility.

Requeue/resolution requires an authorized admin/support Application operation and durable audit.

## 11. Communication architecture

Application creates Communication intent and delegates delivery through `CommunicationDeliveryPort`.

R3 adapters are explicitly SIMULATED/DEMO adapters for email/WhatsApp-like channels. They may record safe delivery outcomes and demonstrate retries without contacting real customers/providers.

Provider-specific DTOs, credentials and failure codes remain Infrastructure concerns.

Communication request idempotency and delivery idempotency are distinct:

- request identity prevents duplicate logical Communication creation;
- delivery attempt identity prevents uncontrolled repeated provider effects under retry.

## 12. Inbound integration architecture

Flow:

```text
HTTP Integration Adapter
  -> authenticate HMAC / timestamp / key identity
  -> validate body size/schema
  -> reserve replay/idempotency identity
  -> persist accepted InboundEvent + audit/outbox
  -> return accepted processing identity
  -> Worker/Application processing
  -> domain use case(s)
```

Rejected unauthenticated input cannot mutate domain state.

No inbound payload may provide an arbitrary callback URL, SQL fragment, workflow action name or provider command that is executed directly.

## 13. Automation architecture

Automation is event/schedule driven and evaluates immutable rule versions.

Action allowlist for R3 architecture:

- `CreateTask`;
- `MoveOperationalStage`;
- `RequestCommunication`;
- `AddOperationalTag` where the target projection supports tags;
- `NotifyOperator` through an approved internal communication/task mechanism;
- `PauseAutomation`;
- `UpdateApprovedField` restricted to explicit configuration-approved operational fields;
- `ScheduleCheck`;
- request a Claim lifecycle transition only through the existing authoritative Claim transition use case when the rule version explicitly permits that action and actor permission.

No rule can create a new permission.

## 14. Pipeline architecture

Pipeline is reusable operational infrastructure with only three approved consumer types in R3:

- Claim;
- RenewalCase;
- CollectionCase.

Additional arbitrary domains remain deferred.

Daily work-item movement and pipeline administration use distinct permissions and Application use cases.

A PipelineVersion activation affects **new/rebound** work items only. Existing version-pinned items are not silently remapped.

## 15. Claims metrics semantics

R3 initial metrics are defined to avoid ambiguous BI:

| Metric | Authoritative semantics |
|---|---|
| open claims | current Claims where `status != CLOSED` |
| claims reported in window | Claims with `createdAt` in `[from, to)` |
| claims by Claim state | current Claim count grouped by Domain status |
| claims by operational stage | current Claim PipelineWorkItems grouped by pinned current stage |
| evidence pending review | Claim Evidence Attention projection indicating pending review, derived from authoritative evidence/task state |
| open tasks | ClaimTasks in `OPEN` |
| overdue tasks | ClaimTasks in `OPEN` with non-null `dueAt < now` |
| closed in window | status-history transitions whose `toStatus = CLOSED` and occurrence is in `[from, to)` |

Time-to-first-response, mean-resolution-time and SLA metrics remain inactive until separately defined timestamps/rules exist, as required by FR-025.

## 16. Import architecture

Preview, mapping, validation and dry run operate against parsed staging data only.

Commit invokes approved importer Application handlers per row.

The generic Import module does not know how to mutate arbitrary tables. Every import type requires an explicit importer contract that maps a validated row to an approved Application command.

R3 does not authorize a generic table/column database importer.

## 17. Configuration architecture

The following behavior-affecting configurations use immutable versions and explicit activation:

- Pipeline definitions/stages;
- Automation rules;
- Communication templates;
- Insurer Guidance;
- Custom Field Definitions.

Every activation records:

- definition/version;
- actor;
- timestamp;
- correlation/request ID where available;
- provenance/source classification;
- durable audit event.

External reference material cannot be activated as runtime truth without explicit synthetic/demo provenance and human/admin activation.

## 18. Error strategy refinement

RFC 9457 Problem Details remains the REST family.

R3 introduces new Application error categories without freezing HTTP mapping yet:

- authentication-context mismatch;
- permission denied;
- resource ownership/not-found safe denial;
- workflow concurrency conflict;
- invalid pipeline stage transition;
- immutable/retired configuration version;
- idempotency/replay conflict;
- webhook authentication/replay/schema rejection;
- async work unavailable/dead-letter state;
- import lifecycle conflict;
- bulk per-item failure;
- provider dependency failure.

API Contract R3 owns stable error codes/status mapping.

## 19. API versioning refinement

R3 remains within `/api/v1` because the intended scope is additive except for reviewed cross-cutting auth/RBAC behavior.

Historical r1/r2 operations remain stable.

API Contract R3 must:

- create new stable `operationId` values for new operations;
- explicitly identify any changed semantics of existing operations;
- produce an API impact artifact;
- escalate revalidation for auth/error/security/permission cross-cutting changes;
- preserve unrelated accepted evidence.

## 20. Transaction boundaries

### Claim lifecycle transition

Historical atomic boundary remains Claim + status history + durable audit.

### Pipeline stage move

One transaction persists:

- optimistic concurrency check;
- work-item current stage/version counter;
- stage-history append;
- required durable audit;
- outbox event if downstream async work is required.

No Claim lifecycle mutation is included automatically.

### ClaimTask mutation

One transaction persists:

- concurrency check;
- task mutation;
- task-history append;
- required durable audit for meaningful mutation;
- outbox event where required.

### Configuration activation

One transaction persists:

- current expected definition/version state check;
- activation/retirement pointer changes;
- audit;
- outbox/configuration-changed event.

Activated version content is immutable.

### Communication request

One transaction persists:

- logical request idempotency reservation;
- Communication record;
- durable request audit where applicable;
- delivery async job/outbox intent.

Provider I/O happens outside the transaction.

### Inbound event acceptance

One transaction persists:

- replay/idempotency reservation;
- InboundEvent;
- acceptance audit;
- processing outbox/job.

### Automation action

Each authoritative action executes through its normal Application transaction. AutomationExecution/ActionExecution retains idempotent outcome so retry does not duplicate effects.

### Import commit

Job transition to COMMITTING is transactional. Each independent eligible row then commits through its importer-specific Application transaction and records its row outcome. Job summary finalizes only after all rows have a terminal outcome.

### Bulk action

Bulk request is orchestration, not a global business transaction. Each item executes its normal single-item Application command with independent authorization/concurrency and returns its own outcome.

## 21. Concurrency policy

R3 standardizes optimistic concurrency for conflict-prone mutable records using a monotonically increasing integer `version` (or an equivalent repository abstraction proven to have the same semantics).

Required for:

- Claim operational PipelineWorkItem;
- ClaimTask mutations;
- Pipeline/configuration activation pointers;
- RenewalCase/CollectionCase mutations;
- ImportJob lifecycle;
- dead-letter resolution/requeue.

Claim lifecycle may retain its already proven stale-state guard; later implementation may migrate to a shared version field only if behavior remains compatible and impact is reviewed.

## 22. Deployment topology

R3 Docker Compose/Kubernetes proof adds:

- `worker` Deployment/process;
- no Redis/message broker by default;
- same PostgreSQL service/store;
- same private evidence storage adapter for demo;
- simulated communication provider behavior can run in-process Infrastructure adapters unless a separate simulator provides demonstrable value later.

Worker readiness indicates process/config/database access readiness, not that every external provider is healthy.

## 23. Architecture implementation conformance R3

Later executable checks must preserve all historical rules and additionally prove:

1. new Domain modules import no NestJS, Prisma, HTTP provider SDK, filesystem, worker or Infrastructure code;
2. Application modules import no concrete Prisma/provider/scheduler implementation;
3. `apps/worker` invokes Application contracts and contains no direct business-table Prisma mutation;
4. Pipeline module cannot import Claim aggregate implementation to mutate lifecycle;
5. Communications depends on a delivery port, not provider SDKs;
6. Integration protocol/signature DTOs remain Presentation/Infrastructure boundaries;
7. Automation definitions cannot execute arbitrary code/eval and actions map to an allowlist;
8. importer implementations enter domain changes only through approved Application commands;
9. customer Presentation cannot use staff authorization context and vice versa;
10. configuration activation is versioned and immutable-after-activation;
11. async handlers expose deterministic idempotency identity and are safe under at-least-once execution;
12. bulk actions delegate to normal single-item commands;
13. simulated legacy/provider protocol types do not leak into Domain/Application.

## 24. ADR additions

### ADR-011 — Modular monolith for R3 core

**Decision:** APPROVED FOR REVIEW.

Keep new Insurance Operations capabilities as bounded modules within the existing modern core rather than decomposing them into microservices.

### ADR-012 — PostgreSQL-backed durable async runtime

**Decision:** APPROVED FOR REVIEW.

Use outbox + durable jobs + leases + retry/dead-letter in PostgreSQL behind Application/Infrastructure ports. Do not add Redis/Kafka/RabbitMQ without measured need and a later decision.

### ADR-013 — Separate staff and customer authentication contexts

**Decision:** APPROVED FOR REVIEW.

Use separate JWT issuer/audience/signing configuration and separate account types. Tokens are not interchangeable.

### ADR-014 — HMAC signed inbound integrations

**Decision:** APPROVED FOR REVIEW.

Authenticate R3 external events with HMAC-SHA256 plus timestamp/event identity replay controls. Exact wire contract belongs to API Contract.

### ADR-015 — Immutable versioned runtime configuration

**Decision:** APPROVED FOR REVIEW.

Pipeline, Automation, Template, Guidance and Custom Field active versions are immutable; edits create new versions.

### ADR-016 — Pipeline is an operational projection

**Decision:** REQUIRED.

Pipeline cannot replace or implicitly mutate Claim/Renewal/Collection domain authority.

### ADR-017 — Version-pinned pipeline work items

**Decision:** APPROVED FOR REVIEW.

Existing work items remain bound to the pipeline version under which they operate until explicit migration/rebinding.

### ADR-018 — Row-partial governed import commit

**Decision:** APPROVED FOR REVIEW.

Independent valid rows may commit while invalid rows remain rejected, with explicit per-row outcomes. Cross-row atomic import types require later architecture.

### ADR-019 — Simulated communication providers first

**Decision:** APPROVED FOR REVIEW.

No real email/WhatsApp credential or delivery is introduced by R3.

### ADR-020 — No event sourcing

**Decision:** APPROVED FOR REVIEW.

Use append-only histories/outbox where required, but current-state aggregates/tables remain authoritative.

## 25. Deferred architecture choices

Still deferred unless a future requirement/measurement activates them:

- Redis;
- Kafka/RabbitMQ or cloud queue;
- generic microservice decomposition;
- refresh tokens/SSO/external IdP;
- arbitrary pipeline consumers;
- real provider communication credentials;
- real insurer integrations;
- generic low-code scripting/eval;
- event sourcing;
- cross-domain enterprise data warehouse/full BI;
- production regulatory retention/HA/DR claims.

## 26. Traceability

| Architecture area | Requirements |
|---|---|
| WorkManagement/Pipeline | FR-020..FR-028, BR-R3-001..005 |
| Communications | FR-029..FR-031, NFR-R3-003 |
| Integration | FR-032..FR-033, BR-R3-008, NFR-R3-004 |
| Automation/async | FR-034..FR-035, FR-051..FR-052, BR-R3-007 |
| Customer/Policy authority | FR-036..FR-037, NFR-R3-002 |
| Guidance/configuration | FR-038, FR-048, FR-050, BR-R3-010..011 |
| Customer Portal identity | FR-039..FR-041, BR-R3-006, NFR-R3-001 |
| Imports | FR-042..FR-043, BR-R3-009 |
| Renewals | FR-044..FR-045 |
| Collections | FR-046..FR-047 |
| Bulk | FR-049, BR-R3-005 |
| Architecture conformance | NFR-R3-007, AC-R3-013 |
| API evolution | NFR-R3-008, BR-R3-012, AC-R3-014 |

## 27. Blueprint readiness mapping

This artifact supplies R3 evidence for:

- `architecture.domain_model`;
- `architecture.decision_records`;
- `api.auth_strategy`;
- `api.error_contract`;
- `api.versioning_policy`.

Companion R3 Security, Data and Audit artifacts supply the remaining `architecture_security_data` checks.

The package is `READY_FOR_REVIEW`; it does not self-approve `architecture_ready`.