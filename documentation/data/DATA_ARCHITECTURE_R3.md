# Data Architecture Revision R3 — Insurance Operations

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `303b09c5746dd545586097412b4f42170bd14664`  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

> This is a synthetic portfolio data model. It does not describe or infer FAR Seguros production databases, schemas, retention rules or customer data.

## 1. Additive authority

Effective R3 data architecture is:

```text
DATA_ARCHITECTURE.md
   +
DATA_ARCHITECTURE_R3.md
   =
effective R3 data contract
```

Existing accepted Claim, history, evidence, idempotency, operator and audit data remain valid. Existing ClaimTask persistence from the Claims Operations increment is incorporated as the starting schema for R3.

## 2. Authoritative ownership matrix

| Data | Authority |
|---|---|
| Claim lifecycle/current state | PostgreSQL modern Claim model |
| Claim status history | PostgreSQL append-oriented history |
| Claim evidence metadata | PostgreSQL; raw bytes remain private storage |
| ClaimTask lifecycle/history | PostgreSQL WorkManagement data |
| Claim operational stage projection | PostgreSQL PipelineWorkItem |
| Customer operational master | PostgreSQL R3 Customer |
| Policy operational master/relationships | PostgreSQL R3 Policy |
| current policy/vehicle eligibility required for historical intake | SIMULATED LEGACY SYSTEM through `PolicyVerificationPort` |
| Pipeline/Automation/Template/Guidance/CustomField active configuration | PostgreSQL immutable version records + active pointers |
| Communications/delivery history | PostgreSQL; providers simulated |
| accepted inbound event/replay identity | PostgreSQL Integration data |
| async/outbox/dead-letter execution state | PostgreSQL Infrastructure persistence |
| ImportJob/row outcomes | PostgreSQL |
| RenewalCase / CollectionCase | PostgreSQL |
| durable audit | PostgreSQL `audit_events` |
| technical logs | log/runtime sink, never audit authority |

A modern Policy record does not replace the legacy eligibility check required by FR-001/FR-002.

## 3. Database principles

Historical rules remain, plus:

- forward-only incremental schema migration;
- no rewrite/reset of accepted historical migrations in shared history;
- UUID internal identifiers;
- `timestamptz` UTC timestamps;
- optimistic concurrency `version` integer on conflict-prone R3 records;
- immutable version rows once activated;
- append-oriented history/attempt/execution rows;
- JSONB only for bounded schemas/projections, not arbitrary business blobs;
- provider/integration raw protocol shapes must not become Domain persistence models;
- physical delete is not a workflow-state mechanism for auditable R3 entities;
- foreign keys and uniqueness enforce structural invariants while Domain/Application enforce business transition legality.

## 4. Existing physical baseline

Current Prisma contract already contains:

- `operators`;
- `claims`;
- `claim_status_history`;
- `claim_evidence`;
- `claim_tasks`;
- `idempotency_records`;
- `audit_events`.

R3 must migrate from this reality rather than the older MVP-only logical schema.

## 5. R3 schema additions and changes

### 5.1 `operators` evolution

Existing table is retained.

Changes:

- role set expands from `CLAIMS_OPERATOR` to:
  - `CLAIMS_OPERATOR`;
  - `CLAIMS_SUPERVISOR`;
  - `PLATFORM_ADMIN`.
- add `version integer NOT NULL DEFAULT 1` if staff account mutation uses optimistic concurrency;
- existing IDs/logins remain valid.

No customer credentials are stored in this table.

### 5.2 `customers`

Purpose: synthetic modern Customer master.

| Column | Intent |
|---|---|
| `id uuid PK` | internal identity |
| `customer_ref varchar(80) UNIQUE` | opaque/synthetic business reference |
| `display_name varchar(160)` | synthetic display value |
| `status varchar(30)` | active/inactive record state |
| `created_at`, `updated_at` | timestamps |
| `version integer` | concurrency |

No real national ID, phone, address or production PII is required by R3.

### 5.3 `customer_accounts`

Purpose: separate Customer Portal authentication identity.

| Column | Intent |
|---|---|
| `id uuid PK` | account identity |
| `customer_id uuid UNIQUE FK -> customers` | one account per synthetic customer for R3 |
| `login varchar(160) UNIQUE` | normalized synthetic login |
| `password_hash text` | Argon2id-compatible hash |
| `is_active boolean` | account state |
| `created_at`, `updated_at` | timestamps |
| `version integer` | concurrency |

Staff and customer account tables remain separate.

### 5.4 `policies`

Purpose: modern Policy operational master/projection.

| Column | Intent |
|---|---|
| `id uuid PK` | internal identity |
| `customer_id uuid FK -> customers` | owner relationship |
| `policy_reference varchar(80) UNIQUE` | modern/synthetic policy reference |
| `legacy_policy_reference varchar(80)` | synthetic legacy lookup reference |
| `insurer_reference varchar(80)` | synthetic/demo insurer context, nullable |
| `record_status varchar(30)` | modern record state |
| `operational_metadata jsonb` | bounded approved metadata only |
| `created_at`, `updated_at` | timestamps |
| `version integer` | concurrency |

`record_status` is not a statement of eligibility/coverage validity.

### 5.5 `policy_assets`

Purpose: normalized insured asset references.

| Column | Intent |
|---|---|
| `id uuid PK` | identity |
| `policy_id uuid FK -> policies` | relation |
| `asset_type varchar(40)` | e.g. synthetic VEHICLE in current demo |
| `asset_reference varchar(80)` | modern reference |
| `legacy_asset_reference varchar(80)` | synthetic legacy reference |
| `metadata jsonb` | bounded approved context |
| `created_at` | timestamp |

Unique constraints should prevent duplicate asset identity within the same Policy.

### 5.6 `claims` R3 link additions

Historical fields remain untouched, including `policy_reference`, `vehicle_reference` and verified snapshot values.

Add nullable migration-safe links:

- `customer_id uuid FK -> customers`;
- `policy_id uuid FK -> policies`.

Migration/backfill policy:

- existing historical/demo Claims remain valid even if these links are initially null;
- repository-owned synthetic data may be backfilled when unambiguous;
- new R3-created Claims SHOULD persist modern Customer/Policy links when the R3 workflow provides them;
- legacy reference snapshot fields remain for historical traceability.

No destructive rewrite of accepted Claim identifiers occurs.

### 5.7 `claim_tasks` R3 evolution

Existing table retains current fields.

Add:

- `version integer NOT NULL DEFAULT 1`;
- `updated_at timestamptz`;
- `cancelled_at timestamptz NULL`;
- `cancelled_by_id uuid NULL`;
- optional `assignment_queue varchar(80)` evolution path if more than the historical `CLAIMS` queue is approved.

Task status expands to `OPEN | COMPLETED | CANCELLED`.

Existing completed rows remain valid.

### 5.8 `claim_task_history`

Append-oriented task history.

Key columns:

- `id uuid PK`;
- `task_id uuid FK -> claim_tasks`;
- `event_type varchar(60)`;
- `from_status`, `to_status` nullable;
- previous/new assignment references when applicable;
- previous/new priority/due date only when needed;
- `actor_type`;
- `actor_id`;
- `correlation_id`;
- `occurred_at`;
- sanitized `metadata jsonb`.

Index: `(task_id, occurred_at)`.

### 5.9 `pipeline_definitions`

- `id uuid PK`;
- `pipeline_key varchar(80) UNIQUE`;
- `consumer_type varchar(30)` restricted to `CLAIM`, `RENEWAL`, `COLLECTION` in R3;
- `display_name varchar(160)`;
- `enabled boolean`;
- `active_version_id uuid NULL`;
- `created_at`, `updated_at`;
- `version integer` for pointer/metadata concurrency.

### 5.10 `pipeline_versions`

- `id uuid PK`;
- `pipeline_definition_id uuid FK`;
- `version_number integer`;
- `status varchar(20)` (`DRAFT`, `ACTIVE`, `RETIRED`);
- provenance fields (`created_by_type`, `created_by_id`, `source_classification`);
- `created_at`, `activated_at`, `retired_at`.

Unique `(pipeline_definition_id, version_number)`.

Activated content is immutable.

### 5.11 `pipeline_stages`

Stages belong to a PipelineVersion.

- `id uuid PK`;
- `pipeline_version_id uuid FK`;
- `stage_key varchar(80)`;
- `display_name varchar(160)`;
- `sort_order integer`;
- `reporting_flags jsonb` with bounded schema;
- `allowed_next_stage_keys jsonb` or normalized transition table if implementation quality is clearer;
- `created_at`.

Unique `(pipeline_version_id, stage_key)` and `(pipeline_version_id, sort_order)`.

If normalized transitions are used, create `pipeline_stage_transitions(from_stage_id,to_stage_id)` instead of JSON.

### 5.12 `pipeline_work_items`

- `id uuid PK`;
- `consumer_type varchar(30)`;
- `consumer_id uuid`;
- `pipeline_definition_id uuid FK`;
- `pipeline_version_id uuid FK`;
- `current_stage_id uuid FK`;
- optional approved operational tags/metadata;
- `created_at`, `updated_at`;
- `version integer`.

Unique current association by supported consumer/pipeline identity.

Indexes:

- `(consumer_type, current_stage_id)`;
- `(pipeline_definition_id, current_stage_id)`;
- `(consumer_type, consumer_id)`.

The generic reference is deliberately polymorphic at Application level; implementation must enforce supported consumer types and existence through repository/use-case logic.

### 5.13 `pipeline_work_item_history`

Append stage history:

- work item;
- from/to stage;
- pipeline version;
- actor type/id;
- correlation;
- occurred_at.

### 5.14 `communication_template_definitions`

Identity table:

- `id`;
- `template_key UNIQUE`;
- `channel`;
- `enabled`;
- `active_version_id`;
- `created_at`, `updated_at`, `version`.

### 5.15 `communication_template_versions`

Immutable activated versions:

- definition ID;
- version number;
- subject/body/template structure appropriate to channel;
- bounded variable schema;
- status;
- provenance;
- created/activated/retired timestamps.

No secrets or live provider credentials in template data.

### 5.16 `communications`

- `id uuid PK`;
- `channel`;
- `template_version_id`;
- `context_type/context_id`;
- `customer_id` nullable;
- `destination_ref` minimized/synthetic;
- `variable_snapshot jsonb` sanitized;
- `status`;
- `request_idempotency_key_hash`;
- `correlation_id`;
- created/updated/terminal timestamps;
- `version`.

Unique logical request identity per defined scope.

### 5.17 `communication_attempts`

Append attempts:

- `id`;
- `communication_id`;
- `attempt_number`;
- `delivery_identity` unique where required;
- `started_at`, `completed_at`;
- outcome;
- simulated provider reference;
- sanitized provider failure category.

No raw provider secret or full response body.

### 5.18 `inbound_integrations`

Non-secret integration registry:

- `id`;
- `integration_key`;
- `key_id UNIQUE`;
- `enabled`;
- allowed event families/config metadata;
- created/updated/version.

HMAC secret is resolved from runtime secret configuration by key ID, not stored in repository fixtures.

### 5.19 `inbound_events`

- `id`;
- integration ID;
- `external_event_id`;
- `payload_hash`;
- sanitized parsed payload/projection;
- event family/type;
- ingestion status;
- processing status;
- request/correlation ID;
- accepted/processed timestamps;
- sanitized failure category;
- version.

Unique `(integration_id, external_event_id)`.

### 5.20 `automation_definitions`

- `id`;
- `rule_key UNIQUE`;
- enabled;
- active_version_id;
- metadata/version/timestamps.

### 5.21 `automation_versions`

- definition ID/version number;
- status;
- trigger schema JSON;
- condition schema JSON;
- optional schedule/wait schema;
- action list JSON constrained to approved DSL;
- provenance;
- created/activated/retired timestamps.

No arbitrary executable code.

### 5.22 `automation_executions`

- `id`;
- automation version ID;
- trigger identity;
- deterministic idempotency key;
- target/context references;
- status;
- correlation;
- started/completed timestamps;
- sanitized failure category;
- version.

Unique logical execution identity.

### 5.23 `automation_action_executions`

- execution ID;
- action index/key;
- action type;
- target reference;
- idempotency key;
- status/outcome;
- attempts;
- timestamps;
- sanitized result metadata.

Unique `(automation_execution_id, action_key)`.

### 5.24 `insurer_guidance_definitions` and `insurer_guidance_versions`

Definition + immutable version pattern.

Version fields include:

- synthetic insurer/context reference;
- guidance category;
- approved document categories/instructions/assistance metadata;
- source classification/provenance;
- version status and timestamps.

No supplied external deadline/phone/coverage rule is activated without explicit provenance and human/admin activation.

### 5.25 `import_jobs`

- `id`;
- import type;
- source file storage key/private reference;
- lifecycle status;
- mapping configuration snapshot;
- row counts;
- created/started/completed by/timestamps;
- commit requested by;
- correlation;
- version.

The uploaded source file is private and subject to import upload controls.

### 5.26 `import_rows`

- `id`;
- import job ID;
- row number;
- normalized staged input JSON;
- validation status/errors sanitized;
- dry-run outcome;
- commit outcome;
- resulting target type/id when created/updated;
- row fingerprint;
- timestamps.

Unique `(import_job_id, row_number)`.

### 5.27 `renewal_cases`

- `id`;
- customer ID;
- policy ID;
- status (`OPEN`, `COMPLETED`, `CANCELLED`);
- relevant synthetic target/expiry context only when approved/provenanced;
- created/updated/completed/cancelled timestamps;
- version.

No universal insurer timing rule is encoded in schema constraints.

### 5.28 `collection_cases`

- `id`;
- customer ID;
- policy ID;
- status (`OPEN`, `COMPLETED`, `CANCELLED`);
- payment-state metadata using synthetic approved values;
- created/updated/completed/cancelled timestamps;
- version.

Incoming payment-intention event references may be stored, but authoritative mutation requires Application verification.

### 5.29 `custom_field_definitions`

Definition identity:

- `id`;
- field key;
- supported projection target type;
- enabled;
- active version ID;
- metadata/version/timestamps.

### 5.30 `custom_field_versions`

- definition ID/version;
- value type;
- display/validation metadata;
- finite enum values where applicable;
- sensitivity classification (`PUBLIC_SAFE`, `STAFF_ONLY`; secrets prohibited);
- provenance;
- status/timestamps.

### 5.31 `custom_field_values`

- definition/version identity;
- target type/id;
- one typed value representation or bounded JSON scalar envelope;
- created/updated by and timestamps;
- version.

Unique current value per target + definition.

Protected domain/security fields are never represented through this table.

### 5.32 `outbox_events`

Durable transactional event outbox:

- `id`;
- event type;
- aggregate/context type/id;
- bounded payload/reference;
- correlation ID;
- occurred_at;
- available_at;
- processing status;
- attempt/lease metadata;
- published/processed timestamp;
- sanitized failure category.

Unique producer event identity when a producer can retry.

### 5.33 `async_jobs`

- `id`;
- job type;
- idempotency key hash/identity;
- bounded payload/reference;
- status (`PENDING`, `LEASED`, `SUCCEEDED`, `FAILED_RETRYABLE`, `DEAD_LETTER`, `CANCELLED`);
- attempt_count/max_attempts;
- available_at;
- lease_owner/lease_expires_at;
- correlation;
- last failure category;
- created/updated/completed timestamps;
- version.

Unique `(job_type, idempotency_identity)` where the logical operation requires it.

### 5.34 `dead_letter_items`

The dead-letter state may be modeled directly in `async_jobs`; if a separate read model is chosen, it contains only a reference to the failed job/event plus sanitized operational metadata.

Architecture does not require duplicate authoritative state. A view/read model is preferred over redundant writable truth.

## 6. Audit actor/event schema evolution

`audit_events.actor_type` must support at least:

- `ANONYMOUS`;
- `CUSTOMER_PUBLIC`;
- `CUSTOMER_ACCOUNT`;
- `OPERATOR`;
- `SUPERVISOR`;
- `ADMINISTRATOR`;
- `INTEGRATION`;
- `AUTOMATION`;
- `SYSTEM`.

Existing rows remain valid.

Audit event codes remain strings so new stable codes do not require a destructive enum migration.

## 7. Configuration immutability

For definition/version pairs:

- DRAFT versions may be edited only through approved Application behavior;
- activation makes content immutable;
- a new edit creates a new version;
- active pointer change uses concurrency protection;
- RETIRED versions remain queryable for reproduction/history;
- work items/executions/communications store the exact version they used.

This applies to Pipeline, Automation, Communication Template, Guidance and Custom Field configurations.

## 8. Async consistency model

R3 assumes at-least-once Worker execution.

Therefore:

- every job/action must have deterministic idempotency identity;
- DB transaction creates authoritative state + outbox/job intent when both are required;
- Worker lease is not itself proof that an effect did not happen;
- handlers must check/replay prior logical outcome;
- dead-letter is terminal operational state until explicit authorized requeue/resolution.

No exactly-once distributed delivery claim is made.

## 9. Import transaction policy

R3 default commit semantics for eligible import types:

```text
explicit Commit
  -> job = COMMITTING
  -> each valid independent row executes own Application transaction
  -> row outcome persisted
  -> job terminal summary
```

Consequences:

- invalid rows remain rejected;
- valid independent rows may succeed;
- partial results are explicit;
- no misleading all-success response;
- retry skips/replays already terminal row identities safely;
- import types with cross-row atomicity/dependency requirements are not supported by the generic R3 importer until separately designed.

## 10. Index strategy

Minimum R3 index intentions:

- customers: unique customer reference;
- customer_accounts: unique login/customer relation;
- policies: customer, policy reference, legacy reference;
- policy_assets: policy + asset reference;
- claims: existing indexes + customer/policy links;
- claim_tasks: claim/status, assignee/status, due/status;
- task history: task/time;
- pipeline work items: consumer identity, stage, pipeline/stage;
- pipeline history: work item/time;
- communications: context, customer/time, status/time, idempotency identity;
- communication attempts: communication/attempt;
- inbound events: unique source/external ID, status/time;
- automation executions: rule version/status/time, target context;
- import rows: job/row, job/validation status, job/commit outcome;
- renewal/collection cases: policy/status, customer/status;
- async jobs: status/available_at, lease expiry, type/status;
- outbox: status/available_at;
- audit: preserve existing event/target/request indexes.

Search/filter indexes must be driven by approved API query semantics; speculative broad indexes are not architecture requirements.

## 11. Migration plan

R3 migration sequence is forward-only and additive from the real current schema.

Logical order:

```text
R3-001 expand staff roles / audit actor values
R3-002 create customers + customer_accounts
R3-003 create policies + policy_assets
R3-004 add nullable customer/policy links to claims + safe synthetic backfill
R3-005 expand claim_tasks + create claim_task_history
R3-006 create pipeline definitions/versions/stages/transitions
R3-007 create pipeline work items/history
R3-008 create communication template definitions/versions
R3-009 create communications/attempts
R3-010 create inbound integrations/events
R3-011 create automation definitions/versions/executions/actions
R3-012 create insurer guidance definitions/versions
R3-013 create import jobs/rows
R3-014 create renewal_cases + collection_cases
R3-015 create custom field definitions/versions/values
R3-016 create outbox/async-job durable runtime
R3-017 add indexes/check constraints/foreign keys not safely added earlier
```

Actual repository migration filenames may use timestamped Prisma/manual SQL conventions already in use. Logical ordering and invariants above are the contract.

No historical migration file is edited to simulate R3.

## 12. Migration compatibility and backfill

- new FK links on historical Claims start nullable;
- no Claim tracking code/status/history is regenerated;
- existing `CLAIM_TASK` completed rows remain completed;
- task version defaults to 1;
- new Customer/Policy seed records use synthetic references;
- backfill only occurs when mapping is deterministic in repository-controlled demo data;
- ambiguous historical mapping remains null rather than guessed;
- APIs must tolerate historical rows according to explicit projection rules until backfill is complete.

## 13. Seed strategy R3

Repository-controlled synthetic seeds may add:

- multiple customers with separate customer accounts;
- staff Operator/Supervisor/Administrator identities;
- normalized policies/assets linked to customers;
- claims across states with linked/unlinked historical examples;
- pipeline definitions + immutable active versions for Claims/Renewals/Collections;
- tasks including assignment/due/priority/cancelled examples;
- simulated communication templates/history;
- one or more disabled/active synthetic inbound integration definitions without committed secret values;
- approved synthetic automation definitions;
- insurer guidance explicitly labeled synthetic;
- renewal/collection cases;
- import fixtures designed for valid/invalid/duplicate rows;
- async/dead-letter examples only when useful for tests/demo.

No real PII or production-like secret is seeded.

## 14. Retention/data cleanup posture

No insurer statutory retention period is asserted.

R3 architecture defaults:

- business workflow/current/history data persists until explicit demo reset;
- activated configuration versions persist for reproducibility;
- audit retention follows R3 Audit Model;
- technical logs remain separately bounded;
- idempotency records: target 24h unless API Contract changes the window;
- inbound replay identities/events: target 30 days in continuously running demo, configurable;
- communication attempts: target 90 days in demo unless reset;
- successful async jobs/outbox operational rows: may be compacted after 30 days when no audit/reproduction obligation requires them;
- dead-letter items remain until explicit resolution plus operational retention window;
- import source files may be cleaned after a bounded demo period, while row outcome/audit summary remains longer.

These are demo defaults, not regulatory guidance.

## 15. Backup/restore and schema validation

Existing PostgreSQL backup/restore evidence remains applicable.

R3 implementation QA must additionally prove:

- migrations apply cleanly from the current accepted schema;
- a fresh database can migrate/seed to R3;
- backup/restore preserves R3 configuration versions, jobs, imports and histories where applicable;
- worker leases do not remain permanently stuck after restore/restart (expired leases recover);
- no migration depends on hidden manual SQL outside repository-owned artifacts.

## 16. Data access boundaries

Allowed:

- Infrastructure repositories/adapters -> PostgreSQL;
- Worker Infrastructure queue adapter -> async/outbox tables;
- Application -> repository/queue/configuration ports;
- Infrastructure legacy adapter -> simulator HTTP;
- Infrastructure communication adapter -> simulated provider behavior.

Forbidden:

- API/worker/MCP Presentation -> direct business Prisma mutation;
- Automation rule -> SQL;
- Import mapping -> arbitrary table/column target;
- React -> database;
- Pipeline stage move -> update Claim status column directly;
- inbound webhook -> write domain tables directly;
- provider DTO -> stored as unvalidated domain JSON.

## 17. Schema-to-requirement traceability

| Schema group | Requirements |
|---|---|
| customer/accounts/policies/assets | FR-036..FR-041, NFR-R3-001..002 |
| task/history | FR-023..FR-024 |
| pipeline/config/work item/history | FR-020..FR-028, FR-050 |
| communication/template/attempt | FR-029..FR-031, FR-050 |
| integrations/events | FR-032..FR-033 |
| automation definitions/executions | FR-034..FR-035, FR-050..FR-052 |
| guidance | FR-038, FR-050 |
| imports | FR-042..FR-043 |
| renewals | FR-044..FR-045 |
| collections | FR-046..FR-047 |
| custom fields | FR-048, FR-050 |
| async/outbox | FR-051..FR-052, NFR-R3-003 |
| audit actor expansion | NFR-R3-001, audit requirements |

## 18. Blueprint readiness mapping

This artifact supplies R3 evidence for:

- `data.architecture`;
- `data.schema_migrations`;
- `data.authoritative_database`.

Actual Prisma/model/migration implementation remains blocked until Architecture/Security/Data R3 and later API Contract gates are approved.