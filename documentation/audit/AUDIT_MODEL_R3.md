# Durable Audit Model Revision R3 — Insurance Operations

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `303b09c5746dd545586097412b4f42170bd14664`  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

> This audit model is for synthetic/demo data and is not a statement of FAR Seguros audit, compliance or statutory retention requirements.

## 1. Additive authority

Effective R3 audit contract is:

```text
AUDIT_MODEL.md
   +
AUDIT_MODEL_R3.md
   =
effective durable audit contract
```

Historical stable event codes remain valid.

Core invariant remains:

```text
technical logs != durable audit
```

## 2. R3 actor types

Durable audit actor classification expands to:

- `ANONYMOUS`;
- `CUSTOMER_PUBLIC`;
- `CUSTOMER_ACCOUNT`;
- `OPERATOR`;
- `SUPERVISOR`;
- `ADMINISTRATOR`;
- `INTEGRATION`;
- `AUTOMATION`;
- `SYSTEM`.

Actor IDs are minimized references and never credentials/tokens/secrets.

## 3. Audit record shape

Historical minimum fields remain:

- id;
- event code;
- occurred_at;
- actor type/id;
- target type/id;
- outcome;
- request/correlation reference;
- sanitized allowlisted metadata;
- created_at.

R3 metadata may additionally carry safe references such as:

- configuration version ID;
- pipeline/work-item/task/communication/import/automation execution ID;
- from/to lifecycle/stage values;
- per-operation summary counts;
- source classification (`SYNTHETIC_DEMO`, `SYSTEM`, etc.).

Forbidden metadata remains:

- passwords/password hashes;
- JWT/access tokens;
- HMAC secrets/signatures;
- provider API credentials;
- raw evidence/import file bytes;
- full raw webhook bodies;
- arbitrary spreadsheet rows unless explicitly sanitized/minimized;
- filesystem paths;
- environment secrets;
- full provider protocol payloads.

## 4. Historical events preserved

The following remain stable:

- `AUTH_LOGIN_SUCCEEDED`;
- `AUTH_LOGIN_FAILED`;
- `CLAIM_CREATED`;
- `CLAIM_STATE_TRANSITIONED`.

Historical classification rules for noisy tracking/MCP reads remain unchanged unless a later security event policy activates them.

## 5. R3 authentication/security events

### `CUSTOMER_AUTH_LOGIN_SUCCEEDED`

Trigger: authenticated synthetic Customer Portal login succeeds.

Actor: `CUSTOMER_ACCOUNT`.

Target: customer account reference.

Outcome: SUCCESS.

Metadata: auth mechanism label only; no token.

### `CUSTOMER_AUTH_LOGIN_FAILED`

Trigger: customer login fails after credential evaluation.

Actor: `ANONYMOUS` or minimized attempted-login hash/reference if safe.

Outcome: FAILURE.

Must not reveal whether the username or password component was valid.

### `STAFF_ROLE_CHANGED`

Conditional trigger: if R3 exposes staff-role/account administration.

Actor: `ADMINISTRATOR`.

Target: staff account.

Metadata: previous/new role and account-state values only.

If staff-role administration is not exposed in R3 API Contract, this event remains reserved and unused.

## 6. ClaimTask audit catalog

### `CLAIM_TASK_CREATED`

Actor: OPERATOR/SUPERVISOR/AUTOMATION/SYSTEM as applicable.

Target: `CLAIM_TASK`.

Metadata allowlist:

- claim ID reference;
- task type;
- priority;
- queue/assignee reference;
- due-date presence/value when safe;
- source/provenance key classification.

### `CLAIM_TASK_ASSIGNED`

Trigger: initial assignment or reassignment.

Metadata:

- previous assignee/queue;
- new assignee/queue.

### `CLAIM_TASK_UPDATED`

Use only for meaningful priority/due-date changes, not every persistence write.

Metadata: changed field names and previous/new safe values.

### `CLAIM_TASK_COMPLETED`

Actor: authorized staff or approved Automation.

Metadata: previous status `OPEN`, terminal `COMPLETED`.

Must not imply Claim state change.

### `CLAIM_TASK_CANCELLED`

Metadata: previous status `OPEN`, terminal `CANCELLED`; no arbitrary unbounded cancellation note in audit metadata.

## 7. Pipeline audit catalog

### `PIPELINE_STAGE_MOVED`

Target: `PIPELINE_WORK_ITEM`.

Metadata:

- consumer type/id reference;
- pinned pipeline version ID;
- from stage key;
- to stage key;
- expected/current concurrency version where useful.

The event does not claim a Claim lifecycle transition occurred.

### `PIPELINE_VERSION_CREATED`

Actor: ADMINISTRATOR.

Metadata: pipeline definition/version and provenance classification.

### `PIPELINE_VERSION_ACTIVATED`

Actor: ADMINISTRATOR.

Metadata: previous/new active version; consumer type.

### `PIPELINE_VERSION_RETIRED`

Actor: ADMINISTRATOR.

Activated/retired versions remain queryable; event does not delete history.

## 8. Communication audit catalog

### `COMMUNICATION_REQUESTED`

Actor: OPERATOR/SUPERVISOR/AUTOMATION.

Target: `COMMUNICATION`.

Metadata:

- channel;
- template version;
- target context type/id;
- no raw destination credential or full message body.

### `COMMUNICATION_DELIVERED`

Actor: SYSTEM/AUTOMATION runtime.

Metadata:

- channel;
- attempt count;
- simulated provider classification/reference if safe.

### `COMMUNICATION_FAILED_TERMINAL`

Trigger: delivery reaches terminal failure/dead-letter outcome.

Metadata: sanitized failure category, attempts, provider classification.

Individual transient retry attempts remain primarily in `communication_attempts`/technical logs and need not create a durable audit row each time unless security review later requires it.

## 9. Integration audit catalog

### `INBOUND_EVENT_ACCEPTED`

Actor: INTEGRATION.

Target: `INBOUND_EVENT`.

Metadata:

- integration ID/key ID reference;
- external event ID;
- event family/type;
- payload hash;
- no raw signature/secret/body.

Transaction rule: persisted with replay reservation/event acceptance and processing intent.

### `INBOUND_EVENT_PROCESSED`

Actor: SYSTEM/AUTOMATION.

Metadata: processing outcome and target context references.

### `INBOUND_EVENT_PROCESSING_FAILED`

Trigger: accepted event reaches terminal failed/dead-letter state.

Metadata: sanitized failure category.

### Rejected unauthenticated events

Unknown-key, invalid-HMAC and malformed high-volume hostile input is **security log/metric by default**, not necessarily a durable audit row per request, to avoid audit amplification.

However, AC-R3-005 requires diagnosable sanitized rejection evidence. Implementation must preserve correlation/security logging and may elevate repeated/known-integration failures to a bounded durable security event policy.

## 10. Automation audit catalog

### `AUTOMATION_VERSION_CREATED`

Actor: ADMINISTRATOR.

Metadata: rule identity/version/provenance.

### `AUTOMATION_VERSION_ACTIVATED`

Actor: ADMINISTRATOR.

Metadata: previous/new active version.

### `AUTOMATION_VERSION_DISABLED`

Actor: ADMINISTRATOR.

### `AUTOMATION_EXECUTION_SUCCEEDED`

Actor: AUTOMATION.

Target: `AUTOMATION_EXECUTION`.

Metadata:

- rule version;
- trigger type/reference;
- action count;
- no raw unbounded rule/payload copy.

### `AUTOMATION_EXECUTION_FAILED`

Trigger: execution terminal failure/dead-letter.

Metadata: rule version, sanitized failure category, completed action count.

### `AUTOMATION_ACTION_EXECUTED`

Required only when the underlying authoritative command does not already create a sufficiently specific business audit event.

Do not duplicate equivalent audit facts gratuitously. For example, an automated Claim transition still creates the normal `CLAIM_STATE_TRANSITIONED` event with actor `AUTOMATION`.

## 11. Configuration audit catalog

The following versioned configuration families require activation accountability:

- Communication Template;
- Insurer Guidance;
- Custom Field Definition.

Stable event pattern:

- `<FAMILY>_VERSION_CREATED`;
- `<FAMILY>_VERSION_ACTIVATED`;
- `<FAMILY>_VERSION_RETIRED`/`DISABLED` when applicable.

Concrete stable codes frozen for R3:

- `COMM_TEMPLATE_VERSION_CREATED`;
- `COMM_TEMPLATE_VERSION_ACTIVATED`;
- `COMM_TEMPLATE_VERSION_RETIRED`;
- `INSURER_GUIDANCE_VERSION_CREATED`;
- `INSURER_GUIDANCE_VERSION_ACTIVATED`;
- `INSURER_GUIDANCE_VERSION_RETIRED`;
- `CUSTOM_FIELD_VERSION_CREATED`;
- `CUSTOM_FIELD_VERSION_ACTIVATED`;
- `CUSTOM_FIELD_VERSION_RETIRED`.

Metadata: definition/version identity, provenance/source classification and approved target/channel context.

## 12. Customer Portal evidence audit

### `CUSTOMER_EVIDENCE_ADDED`

Actor: CUSTOMER_ACCOUNT.

Target: CLAIM/EVIDENCE reference.

Metadata:

- evidence count or evidence ID;
- authorized outstanding-action reference if applicable;
- media type/size only when safe;
- no raw bytes/path/raw filename.

Transaction/compensation policy follows Claim evidence architecture.

## 13. Import audit catalog

### `IMPORT_JOB_CREATED`

Actor: ADMINISTRATOR.

Metadata: import type, source file safe reference, row count if known.

### `IMPORT_DRY_RUN_COMPLETED`

Metadata: valid/invalid/unchanged counts; no full rows.

### `IMPORT_COMMIT_REQUESTED`

Actor: ADMINISTRATOR.

Metadata: job ID and approved commit policy `ROW_PARTIAL_INDEPENDENT`.

### `IMPORT_COMMIT_COMPLETED`

Metadata: success/rejected/failed counts, terminal job status.

### `IMPORT_COMMIT_FAILED`

Used for job-level failure that prevents/interrupts commit orchestration. Per-row outcomes remain in Import rows.

Underlying business commands SHOULD generate their normal domain audit events when they perform meaningful mutations. Import audit is not a substitute for target-domain accountability.

## 14. Renewal audit catalog

### `RENEWAL_CASE_CREATED`

Actor: OPERATOR/SUPERVISOR/AUTOMATION/SYSTEM as applicable.

Metadata: customer/policy references and synthetic provenance only.

### `RENEWAL_CASE_COMPLETED`

### `RENEWAL_CASE_CANCELLED`

No insurer-specific deadline/grace semantics are implied by these generic event codes.

Operational pipeline movements create `PIPELINE_STAGE_MOVED` separately.

## 15. Collection audit catalog

### `COLLECTION_CASE_CREATED`

### `COLLECTION_CASE_COMPLETED`

### `COLLECTION_CASE_CANCELLED`

### `COLLECTION_PAYMENT_STATE_CHANGED`

This last event is required only when an approved Application use case changes authoritative payment-state metadata after required verification. An inbound payment-intention event alone does not create this event.

## 16. Bulk audit policy

### `BULK_OPERATION_REQUESTED`

Actor: SUPERVISOR.

Metadata:

- bulk operation type;
- selected item count;
- correlation/bulk request identity.

### `BULK_OPERATION_COMPLETED`

Metadata:

- succeeded/failed/skipped counts;
- no claim that all items succeeded unless every underlying result succeeded.

Every meaningful successful underlying item action retains its normal single-item audit event. Bulk summary does not replace per-item accountability.

## 17. Async/dead-letter audit policy

Routine job lease/retry is technical operational history, not durable business audit for every attempt.

Durable audit required for human/admin recovery actions:

### `DEAD_LETTER_REQUEUED`

Actor: ADMINISTRATOR or separately approved support role if later introduced.

Metadata: job/event reference, previous terminal category, no raw payload.

### `DEAD_LETTER_RESOLVED`

Actor: ADMINISTRATOR.

Metadata: resolution classification.

Terminal failures that are themselves business-significant also use their capability-specific event, e.g. `COMMUNICATION_FAILED_TERMINAL`.

## 18. Transactional audit obligations

Audit must be atomic with authoritative mutations for:

- Claim state transition;
- ClaimTask meaningful mutation;
- Pipeline stage move;
- configuration activation/retirement pointer change;
- ImportJob lifecycle state changes controlled by staff;
- Renewal/Collection terminal state changes;
- Customer Portal evidence metadata creation when the modern DB mutation succeeds;
- authoritative Collection payment-state mutation;
- dead-letter requeue/resolution.

For external provider I/O, audit of the request is stored before/outside provider call as appropriate, while terminal delivery outcome is appended after provider result. No DB transaction attempts to encompass remote I/O.

## 19. Read/audit access policy R3

- no public/anonymous raw audit access;
- no Customer Portal raw audit access;
- no MCP audit access;
- Operator may receive only narrowly scoped operational audit projections if API Contract explicitly requires them;
- Supervisor/Admin may receive broader audit search only if API Contract activates it;
- configuration/workflow UIs may display derived history without exposing secret metadata;
- direct audit repository remains Infrastructure/server-side.

R3 requirements do not mandate a general audit-search REST endpoint, so API Contract must not invent one unless justified by an approved interface/use case.

## 20. Retention policy R3

No regulatory retention period is asserted.

Demo defaults:

### Durable audit

- target: 180 days in continuously running hosted/demo environment;
- configurable;
- no normal API delete/update;
- activated configuration/audit evidence may be preserved longer when required for published case-study reproduction;
- cleanup is explicit operations maintenance only.

### Technical logs

- target: 14 days or hosting rotation limit.

### Security diagnostic logs

- target: 30 days when hosting permits.

### Inbound event/replay records

- target: 30 days in continuous demo unless reset.

### Communication attempts

- target: 90 days in continuous demo unless reset.

### Async successful operational rows

- may be compacted after 30 days when no audit/reproduction dependency remains.

### Dead-letter items

- retained until explicit resolution plus target 30-day post-resolution window in continuous demo.

### Import outcome/audit summary

- target 180 days; raw import file may have a shorter configured cleanup period.

These values are portfolio operational defaults only.

## 21. QA obligations R3

Later QA must prove:

1. ClaimTask create/assign/update/complete/cancel produces correct durable events and no secret metadata;
2. stage move audit records pinned pipeline version/from/to stage and does not falsely record Claim state change;
3. customer login success/failure behavior is auditable without credential leakage;
4. Customer Portal evidence creates expected durable event;
5. configuration activation records actor/version/provenance;
6. communication request/terminal outcome audit remains separate from retry technical logs;
7. accepted inbound event produces acceptance audit; forged/rejected events leave sanitized diagnosable evidence without domain mutation;
8. automated authoritative effects carry `AUTOMATION` actor and retain the normal domain audit event;
9. Import commit summary matches row outcomes and target-domain actions retain their own audit events;
10. bulk summary counts match per-item outcomes;
11. dead-letter requeue/resolution requires permission and audit;
12. audit metadata contains no JWT, HMAC secret/signature, password, raw file bytes/body or provider credentials;
13. historical audit tests continue passing.

## 22. Blueprint readiness mapping

This artifact supplies R3 evidence for:

- `audit.event_catalog`;
- `audit.retention_policy`.

It supports later:

- `api.audit_event_mapping`;
- `api.audit_logging`;
- `api.audit_qa`;
- `release.security_accepted`.

The audit package is `READY_FOR_REVIEW` and cannot self-approve Architecture/Security/Data R3.