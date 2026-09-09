# API Implementation R3 — Increment 09: Automation Engine

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `42b22668b8a971b8abaf68128d4f8d03f0cd2f02`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. All automation definitions, triggers, execution identities, action inputs and runtime outcomes used by tests in this increment are synthetic/demo data. No real FAR Seguros rule, workflow, policy, operational automation or production integration is represented.

## 1. Increment boundary

This increment implements the frozen R3 Automation Administration surface immediately after Integration Events and adds the safe internal execution foundation required by the approved Automation architecture.

Implemented requirements:

- `FR-034` — versioned Automation definitions and administration;
- `FR-035` — constrained Automation execution foundation;
- `FR-050` — configuration governance/versioning;
- `UC-R3-012` — administer an Automation definition/version.

Frozen REST operations implemented:

```text
GET   /api/v1/admin/automations
GET   /api/v1/admin/automations/{definitionId}
POST  /api/v1/admin/automations
POST  /api/v1/admin/automations/{definitionId}/versions
POST  /api/v1/admin/automations/{definitionId}/versions/{versionId}/activate
PATCH /api/v1/admin/automations/{definitionId}
```

All six operations require:

- valid staff JWT;
- server-authoritative `automations.admin` permission;
- Platform Administrator role under the current R3 grants.

Claims Operator and Claims Supervisor do not gain Automation administration authority.

This increment does not expose an HTTP endpoint that directly executes arbitrary Automation actions and does not implement the later generic Worker/dead-letter administration surface.

## 2. Constrained rule DSL

Automation configuration is data, not executable source code.

An immutable rule version uses the approved bounded shape:

```text
WHEN <allowlisted event>
IF <bounded conditions>
WAIT <optional bounded delay>
THEN <allowlisted actions>
```

Initial trigger allowlist:

- `CLAIM_CREATED`;
- `CLAIM_STATE_TRANSITIONED`;
- `CLAIM_TASK_COMPLETED`;
- `COMMUNICATION_DELIVERED`;
- `INBOUND_EVENT_PROCESSED`;
- `SCHEDULED_CHECK`.

Condition operators are limited to:

- `EQ`;
- `NEQ`;
- `IN`;
- `NOT_IN`;
- `EXISTS`;
- `NOT_EXISTS`.

Values are bounded scalar data only: string, finite number, boolean or null. Nested executable payloads are not accepted.

Optional `WAIT` is bounded between 60 seconds and 30 days. This is an orchestration safety bound for the synthetic demonstration, not an insurer-specific business deadline.

Each version contains between 1 and 20 actions with unique action keys.

## 3. Approved action vocabulary and unsafe-input rejection

The frozen R3 action vocabulary is exactly:

```text
CREATE_TASK
MOVE_OPERATIONAL_STAGE
REQUEST_COMMUNICATION
ADD_OPERATIONAL_TAG
NOTIFY_OPERATOR
PAUSE_AUTOMATION
UPDATE_APPROVED_FIELD
SCHEDULE_CHECK
```

Rule/action payload validation rejects executable or authority-bearing configuration. In particular:

- no JavaScript/eval/source-code execution;
- no SQL;
- no arbitrary outbound URL/URI;
- no secret/token/password fields;
- no dynamic provider command;
- no unbounded action parameter object;
- no arbitrary nested JSON program.

Action parameter keys containing executable, SQL, credential or outbound-target concepts are rejected. String parameters beginning with `http://`/`https://` or containing a `javascript:` scheme are also rejected.

The approved R3 API Contract intentionally does **not** freeze business-specific request schemas for the eight authoritative action families. This implementation therefore does not invent ClaimTask/Pipeline/Communication/FAR-specific action payload semantics that are absent from the approved contract.

## 4. Versioned administration and concurrency

Automation definitions use the same approved configuration lifecycle pattern as Pipeline and Communication Template administration:

```text
create definition
  -> immutable-content DRAFT v1
create later version
  -> DRAFT
activate eligible DRAFT
  -> ACTIVE
previous ACTIVE
  -> RETIRED
disable definition
  -> active version RETIRED + active pointer cleared
```

Rules:

- definition key is unique;
- behavior-affecting content requires `sourceClassification` provenance;
- activated version content is immutable;
- subsequent content changes require a new version;
- create-version, activate and state changes use `expectedDefinitionVersion`;
- stale writes fail with `RESOURCE_VERSION_CONFLICT`;
- invalid activation/state combinations fail safely;
- no production Automation rule is seeded.

Durable configuration audit codes are:

- `AUTOMATION_VERSION_CREATED`;
- `AUTOMATION_VERSION_ACTIVATED`;
- `AUTOMATION_VERSION_DISABLED`.

Configuration mutations and their durable audit record are transactional in PostgreSQL.

## 5. Non-human Automation authorization

Automation runtime is not a staff user and is not a superuser.

The internal execution principal is explicitly separate from staff identity:

```text
context = automation
automationVersionId
executionId
actionType
capabilities = [exactly one action-scoped capability]
```

Capability mapping is fixed server-side:

- `CREATE_TASK` -> `claims.tasks.manage`;
- `MOVE_OPERATIONAL_STAGE` -> `claims.pipeline.transition`;
- `REQUEST_COMMUNICATION` -> `communications.send`;
- `ADD_OPERATIONAL_TAG` -> `automation.tags.manage`;
- `NOTIFY_OPERATOR` -> `automation.operator.notify`;
- `PAUSE_AUTOMATION` -> `automation.execution.pause`;
- `UPDATE_APPROVED_FIELD` -> `automation.approved_fields.update`;
- `SCHEDULE_CHECK` -> `automation.schedule`.

Rule content, trigger payloads and persisted jobs cannot add capabilities or convert this principal into a staff/Admin actor.

A concrete authoritative action binding must accept this Automation principal explicitly and invoke the normal owning Application command/invariants. The implementation does not impersonate a Claims Operator or Platform Administrator to bypass that boundary.

## 6. Fail-closed action binding policy

A semantic review after the first green candidate matrix identified that a generic simulated executor must not report a successful business effect when no owning Application command was actually invoked.

The production/runtime default is therefore deliberately:

`FailClosedAutomationActionExecutor`

For an allowlisted action that has no explicitly registered authoritative Application binding it returns:

```text
outcome = FAILED
failureCategory = AUTOMATION_ACTION_NOT_BOUND
adapter = FAIL_CLOSED
```

This means:

- configuration can be safely versioned, activated, evaluated and scheduled;
- execution provenance/idempotency can be demonstrated;
- the runtime cannot fabricate a ClaimTask, stage movement, Communication, tag, notification or approved-field mutation;
- no false `SUCCEEDED` result is recorded merely because an action type is allowlisted;
- future concrete bindings must be reviewed capability-by-capability and must preserve the normal owning Application validation and durable business audit.

A test-only explicitly supplied action executor proves that the orchestration layer can complete an action successfully when an authorized binding exists, while observing only the one action-scoped capability.

## 7. Deterministic execution and idempotency

Automation execution is version-pinned and trigger-idempotent.

Logical execution identity is derived deterministically from:

```text
automationVersionId + triggerIdentity
```

Each action execution has a separate deterministic identity derived from the logical execution plus action key.

Semantics:

- the same active version + same trigger identity replays the existing execution;
- replay does not create duplicate action-execution rows;
- replay does not duplicate terminal execution audit;
- a newly activated version receives a distinct execution identity for the same future trigger;
- persisted execution always references the concrete immutable AutomationVersion that created it.

No exactly-once provider/business-effect claim is made. The foundation is durable and retry/idempotency-oriented for later Worker bindings.

## 8. WAIT and scheduled-resume foundation

A matching rule with `WAIT` does not sleep an HTTP request or hold an in-memory timer.

It creates a durable execution in `PENDING` state and schedules the existing async foundation with:

```text
jobType = RESUME_AUTOMATION_EXECUTION
idempotencyIdentity = automation:<executionId>
status = PENDING
```

The PostgreSQL scheduler adapter is race-idempotent around the unique async-job logical identity.

On resume, the Application reloads the pinned AutomationVersion. The approved security model requires the Worker/runtime principal to be created from an **ACTIVE immutable rule version**. Therefore a pending execution whose pinned version has since been retired/disabled is closed as:

```text
SKIPPED / AUTOMATION_VERSION_NOT_ACTIVE
```

and no authoritative action is attempted.

This increment does not implement the generic polling/lease Worker loop of `FR-051` and does not expose dead-letter administration from `FR-052`.

## 9. Durable terminal execution audit

The approved Audit Model requires terminal Automation execution accountability.

Implemented terminal events:

- `AUTOMATION_EXECUTION_SUCCEEDED`;
- `AUTOMATION_EXECUTION_FAILED`.

Actor:

`AUTOMATION`

Target:

`AUTOMATION_EXECUTION`

Sanitized metadata includes only bounded references/classification:

- Automation version ID;
- trigger type;
- trigger identity;
- completed action count;
- sanitized failure category.

It does not persist arbitrary rule content, raw trigger payloads, secrets, credentials or provider protocol data in the terminal audit record.

In PostgreSQL, terminal execution-state update and its required audit event are committed atomically in the same transaction. A replay of an already-terminal execution returns existing state without appending another terminal audit event.

An execution intentionally `SKIPPED` because its pinned version is no longer ACTIVE does not manufacture a success/failure audit event; the frozen terminal audit catalog requires success/failure events.

## 10. Persistence

Forward migration:

`prisma/migrations/20260908_07_automation_engine_r3.sql`

adds:

- `automation_definitions`;
- `automation_versions`;
- `automation_executions`;
- `automation_action_executions`.

The schema includes:

- finite version/execution/action status vocabularies;
- unique rule key;
- unique definition/version number;
- unique execution idempotency key;
- unique action idempotency key;
- unique action key within one execution;
- optimistic execution/configuration versions;
- indexes for status/runtime lookup.

The existing `async_jobs` foundation is reused for delayed resume instead of introducing a second scheduler store.

`qa/bootstrap.sql` mirrors the physical Automation schema for runtime QA.

Rollback:

`prisma/migrations/20260908_07_automation_engine_r3.rollback.sql`

is conservative and refuses destructive removal when Automation history/audit evidence would make rollback unsafe.

No production rule, action, execution or credential is seeded.

## 11. Clean Architecture conformance

- Automation vocabulary is framework-independent Domain code.
- rule normalization, version administration, trigger matching, idempotency, action capability selection and execution orchestration live in Application.
- action execution and scheduling are Application ports.
- Memory/PostgreSQL stores and the fail-closed default executor live in Infrastructure.
- NestJS controllers are outer Presentation adapters.
- REST has no business-rule evaluator.
- Prisma has no authority to invent rule/action semantics.
- no Domain/Application code imports NestJS or Prisma.
- no Automation code impersonates staff identity.

The future Worker can call the Application execution boundary without owning rule/business semantics.

## 12. Tests and reviewed failure modes

Application coverage proves:

- only Platform Administrator can administer Automation definitions under current role grants;
- create -> DRAFT, activate -> ACTIVE, replacement activation -> previous version RETIRED;
- stale optimistic configuration writes are rejected;
- invalid trigger/action content is rejected;
- URL/script/credential-shaped configuration is rejected;
- execution is deterministic/idempotent for a repeated trigger;
- default unbound actions fail closed with `AUTOMATION_ACTION_NOT_BOUND`;
- a failed unbound execution produces exactly one `AUTOMATION_EXECUTION_FAILED` durable audit record;
- replay does not duplicate action execution or terminal audit;
- WAIT creates one durable scheduled-resume intent;
- duplicate scheduling is idempotent;
- disabling/retiring a pinned WAIT version causes resume to `SKIPPED` without action execution;
- a test-only explicitly bound executor receives exactly one action-scoped capability and can produce `SUCCEEDED`;
- successful explicitly bound execution creates `AUTOMATION_EXECUTION_SUCCEEDED` audit.

REST coverage proves:

- Claims Operator is denied Automation administration;
- Platform Administrator can create/list/read/version/activate/enable/disable a rule;
- optimistic version conflicts surface safely;
- malformed/executable-shaped DSL input returns bounded validation error;
- no runtime execution endpoint bypasses Application orchestration.

The first full candidate matrix was green but manual architecture review identified two semantic gaps not detectable by generic CI: a generic simulated executor reported `SUCCEEDED` without invoking an authoritative Application command, and terminal Automation execution audit was not yet persisted. Both were corrected before evidence. The final runtime fails closed for unbound effects and persists terminal execution audit transactionally.

A purpose-built hardening verification run (`Automation R3 Hardening Runner`, run `34304237603`) then completed Prisma contract emit, TypeScript checks, the complete backend test suite, architecture conformance and production build successfully before committing the hardened functional changes.

## 13. Explicit exclusions

This increment does not implement:

- real FAR Seguros Automation rules/workflows;
- production Automation definitions or seed data;
- arbitrary executable code, SQL or HTTP callbacks;
- arbitrary runtime capabilities;
- staff impersonation by Automation runtime;
- concrete authoritative bindings for the eight action families where the approved API Contract does not freeze the business parameter contract;
- generic Worker polling/lease orchestration from `FR-051`;
- dead-letter list/detail/requeue/resolve operations from `FR-052`;
- a generic audit-search REST API;
- changes to frozen `documentation/api/r3/**`;
- Blueprint Master changes;
- tag, release or publication changes.

The absence of concrete authoritative action bindings is intentional fail-closed behavior, not a claim that those business effects are complete.

## 14. Machine verification

Verified hardened implementation head before this evidence-only commit:

`48faa6328ed6ed22881e979e55e1a0b765269329`

Successful exact-head workflows:

- `API Implementation #304` — run `34304406998` — SUCCESS;
- `API QA #267` — run `34304406869` — SUCCESS;
- `OpenAPI Validation #287` — run `34304406892` — SUCCESS;
- `OpenAPI Post-MVP R2 #62` — run `34304406898` — SUCCESS;
- `Postman Contract #274` — run `34304406900` — SUCCESS;
- `Integration QA - Web Slices #165` — run `34304406886` — SUCCESS;
- `Release Gate Evidence #157` — run `34304406895` — SUCCESS;
- `Operations Observability Evidence #144` — run `34304406916` — SUCCESS;
- `Design System #244` — run `34304406936` — SUCCESS;
- `Interface Inventory #249` — run `34304406904` — SUCCESS;
- `Functional Slice - Claims Backoffice Web #172` — run `34304406876` — SUCCESS;
- `Functional Slice - Customer Claim Tracking Web #185` — run `34304406937` — SUCCESS;
- `Functional Slice - Digital Claim Intake Web #217` — run `34304406867` — SUCCESS.

`API Implementation #304` completed Prisma contract emit, TypeScript checks, backend tests, architecture conformance and production build successfully.

`API QA #267` completed the ephemeral PostgreSQL/runtime API QA path successfully.

`Integration QA - Web Slices #165` additionally completed Prisma emit, backend/web typecheck and tests, architecture/build verification, ephemeral PostgreSQL bootstrap, runtime services, cross-cutting API security/concurrency/rate-limit QA, durable audit/persistence verification, production dependency classification, real web-client dependency exercise, responsive/accessibility journey and offline/degraded behavior successfully.

Expected historical lock failures at the same implementation head:

- `Release Gate Ready State #150` — run `34304406944` — expected FAILURE because historical human acceptance/release readiness remains intentionally locked;
- `Operations State #139` — run `34304406921` — expected FAILURE because the inherited release snapshot remains frozen;
- `Visual Functional Review Ready - Web #145` — run `34304406956` — expected FAILURE under the frozen historical visual-review readiness policy.

There was no fourth/new failure.

Because adding this evidence file creates a new PR head, the final human merge gate requires a fresh exact-head matrix after this commit. Machine success never authorizes merge, tag, release or publication.

## 15. Human gate

This increment remains:

`IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`

PR #46 may be marked ready for human review only after the evidence-head CI matrix again shows every substantive check successful with exactly the three known historical lock failures.

Merge requires explicit human authorization for **PR #46**. Tagging, releasing or publishing would require separate explicit human authorization.
