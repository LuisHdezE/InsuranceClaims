# Security and Threat Model Revision R3 — Insurance Operations

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `303b09c5746dd545586097412b4f42170bd14664`  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

> This security model applies only to the synthetic public technical case study. It does not claim FAR Seguros security controls, identity architecture, retention policy or provider integrations.

## 1. Additive authority

Effective R3 security architecture is:

```text
SECURITY_THREAT_MODEL.md
   +
SECURITY_THREAT_MODEL_R3.md
   =
effective R3 security/threat contract
```

Historical security requirements remain mandatory where applicable.

## 2. R3 security objectives

1. preserve API/Application authority for authentication, authorization, validation, redaction and workflow mutation;
2. strictly separate customer and staff identity contexts;
3. enforce least privilege for Operator, Supervisor, Administrator, Integration and Automation actors;
4. prevent cross-customer/IDOR disclosure in Customer/Policy/Claim portal projections;
5. prevent configuration, automation, imports, bulk operations and pipeline metadata from bypassing strong domain rules;
6. authenticate inbound integration events and prevent replay;
7. make async processing safe under at-least-once execution;
8. prevent uncontrolled duplicate communication effects;
9. keep all provider/integration secrets out of source control and business tables where possible;
10. ensure failed/dead-letter diagnostics are sanitized;
11. preserve synthetic-only public data;
12. extend executable security QA and architecture-conformance obligations before R3 API Gate.

## 3. Trust boundaries R3

```text
Anonymous browser
   -> Public REST

Customer browser
   -> Customer auth REST
   -> Customer Portal REST

Staff browser
   -> Staff auth REST
   -> Operator/Supervisor/Admin REST

External Integration Source
   -> signed Integration REST boundary

MCP Client
   -> read-only MCP Presentation

API / MCP / Worker
   -> Application
   -> Domain
   -> Infrastructure ports/adapters

Infrastructure
   -> PostgreSQL
   -> private evidence/import storage
   -> SIMULATED LEGACY SYSTEM
   -> SIMULATED communication provider adapters
```

New trust boundaries:

- customer credential/token boundary;
- staff privilege boundary between Operator/Supervisor/Admin;
- integration-signature boundary;
- Worker/async lease boundary;
- configuration activation boundary;
- import-file/parser boundary;
- simulated provider boundary.

## 4. Actor security model

### 4.1 Anonymous Demo Customer

Historical public capabilities remain:

- synthetic policy/vehicle verification;
- claim submission;
- tracking with tracking code + policy reference.

No Customer Portal account authority is implied by anonymous tracking proof.

### 4.2 Customer Portal User

Authenticated synthetic customer account linked to exactly one Customer for R3.

May only access own approved customer-safe resources.

Authorization decisions use server-side customer identity + resource ownership, never a customer ID supplied by the UI as authority.

Denied:

- staff endpoints;
- raw audit;
- internal tasks;
- configuration/admin;
- direct Claim lifecycle mutation;
- other customer resources.

### 4.3 Claims Operator

May perform approved claim/task/pipeline/communication operations within granted permissions.

Denied administrative configuration and supervisor-only bulk/analytics capabilities unless explicitly granted.

### 4.4 Claims Supervisor

May perform Operator capabilities plus approved reassignment, analytics and bulk operations.

Supervisor does not bypass Claim Domain transition rules.

### 4.5 Platform Administrator

May administer supported Pipeline, Automation, Communication Template, Guidance, Custom Field and Import configuration/workflows.

Administrator is **not** a universal Claim superuser. Domain invariants still apply.

### 4.6 External Integration Source

Non-human actor authenticated only for `integration.events.ingest`.

Cannot call staff/customer business endpoints by virtue of integration authentication.

### 4.7 Automation Runtime

Internal non-human actor constructed by Worker/Application from an approved active rule/action.

Receives only the permission required for the specific allowlisted action.

### 4.8 MCP Client

Historical read-only customer-safe status capability remains. R3 does not promote MCP to operational/admin authority.

## 5. Authentication strategy

### 5.1 Staff JWT

- separate staff issuer;
- staff audience;
- separate signing configuration from customer tokens;
- target lifetime 15 minutes;
- minimal subject/login/role claims;
- no policy/claim/customer data in token;
- no refresh token in R3;
- token signature/issuer/audience/expiry validated on every protected request.

### 5.2 Customer JWT

- separate customer issuer;
- customer audience;
- separate signing configuration;
- target lifetime 30 minutes;
- subject = customer account identity;
- customer ID may be included only as minimized authorization context if implementation evidence shows it is safe; server still validates account/customer relationship;
- no staff role claims;
- no refresh token in R3.

Staff and customer tokens are rejected on the other surface through issuer/audience/context validation even if cryptographically valid under another configured key.

### 5.3 Password hashing

Argon2id remains preferred for staff and customer synthetic accounts.

Requirements:

- no plaintext password in source control;
- seed credentials explicitly demo-only;
- generic invalid-credential response;
- rate limiting by IP and normalized login dimensions where appropriate;
- login success/failure audit policy expanded in the R3 Audit Model.

### 5.4 Integration HMAC

Inbound events use HMAC-SHA256.

Conceptual signed material:

```text
canonical(timestamp, externalEventId, sha256(rawBody))
```

Controls:

- integration key ID is public/non-secret identifier;
- secret resolved from runtime secret configuration through Infrastructure;
- constant-time signature comparison;
- bounded accepted clock skew;
- external event ID required;
- unique replay identity persisted;
- invalid/replayed/stale events cannot mutate authoritative state.

API Contract R3 freezes header names, canonicalization and exact skew window.

### 5.5 Automation authentication

Automation is not authenticated through a user-visible JWT.

Worker creates an internal system actor only after loading an ACTIVE immutable rule version and validated action identity.

No request/input can directly ask to become `AUTOMATION` actor.

## 6. Authorization and ownership

Requirement permission intents remain the source for API Contract permission mapping.

Architecture rules:

- every protected operation authorizes in Application/API boundary;
- role labels map to explicit permissions;
- UI visibility is supplementary only;
- Customer Portal uses own-resource ownership checks;
- staff list/query results apply projection-level authorization where needed;
- configuration administration uses distinct permissions from pipeline operation;
- bulk actions re-run authorization per item;
- Automation actions are permission-constrained;
- Integration actor has no generic Domain permissions.

### Own-resource denial policy

For customer-accessible resources, the server SHOULD prefer not-found-style safe denial where revealing existence would create cross-customer information leakage. Exact status/error code belongs to API Contract R3.

## 7. RBAC intent matrix

| Capability | Customer | Operator | Supervisor | Admin | Integration | Automation |
|---|---:|---:|---:|---:|---:|---:|
| own portal read | yes | no | no | no | no | no |
| own evidence upload | conditional | no | no | no | no | no |
| claims backoffice read | no | yes | yes | support/read only if explicitly mapped | no | action-specific only |
| Claim lifecycle transition | no | yes if permitted | yes if permitted | not implicit | no | only via explicit approved rule action |
| tasks operate | no | yes | yes | not implicit | no | allowlisted actions |
| pipeline operate | no | yes | yes | not implicit | no | allowlisted actions |
| analytics | no | no | yes | yes if mapped | no | no |
| bulk | no | no | yes | no unless explicitly mapped | no | no |
| config administration | no | no | no | yes | no | no |
| imports | no | no | no | yes | no | no |
| inbound event ingest | no | no | no | no | yes | no |
| communications request | no | yes | yes | no unless mapped | no | allowlisted |

API Contract R3 provides the exact operation matrix.

## 8. Customer/Policy data protection

This repository continues using synthetic data only, but R3 introduces more identity/master-data surface.

Controls:

- no real national IDs, phone numbers, addresses or insurer customer datasets are required;
- customer/staff projections explicitly select fields rather than serializing ORM records;
- password hashes/account status/internal IDs are never customer-safe projection fields;
- policy legacy identifiers are exposed only when justified for the actor/use case;
- no unrestricted search across customer data on public/customer surfaces;
- staff search semantics must be bounded in API Contract;
- audit/logging redaction applies recursively.

## 9. Customer Portal evidence security

Historical evidence controls remain mandatory and additionally:

- upload requires authenticated own-customer + authorized Claim/action context;
- server resolves Claim ownership from authoritative relationships;
- outstanding action/task identifier cannot be trusted without ownership/eligibility check;
- historical evidence cannot be replaced/deleted by the upload operation;
- evidence event/history is appended;
- magic-byte/type validation remains required where feasible;
- private storage only;
- no user path or executable content.

## 10. Pipeline/configuration security

Threat surface: a valid admin could create configuration that changes runtime behavior.

Controls:

- immutable activated versions;
- explicit draft -> active lifecycle;
- provenance;
- distinct admin permission;
- optimistic concurrency on active pointer;
- validation of stage keys/order/transitions;
- consumer type allowlist limited to Claims/Renewals/Collections;
- custom metadata cannot target protected domain/security fields;
- activation audited;
- external reference material labeled synthetic and cannot auto-activate.

## 11. Automation security

Automation definitions are data interpreted by an allowlisted engine, never executable code.

Forbidden:

- `eval` / Function constructor;
- arbitrary JavaScript/TypeScript;
- raw SQL;
- arbitrary URLs/HTTP requests;
- shell commands;
- dynamic imports/modules;
- arbitrary permission names supplied by rule payload;
- direct repository/table mutation.

Allowed condition operators and fields are schema-controlled.

Every action maps to a fixed Application command adapter with explicit input schema and permission.

Rule version, trigger identity, execution ID and action IDs are durable for audit/idempotency.

## 12. Async/Worker security

At-least-once Worker execution is assumed.

Controls:

- durable lease with expiration;
- bounded attempts/backoff;
- deterministic idempotency identity;
- payloads contain references/approved sanitized data, not secrets;
- Worker has database access only through Infrastructure adapters and Application composition;
- no public Worker HTTP mutation endpoint required;
- dead-letter data sanitized;
- admin requeue/resolution authorized and audited;
- lease owner/process identity is operational metadata, not business authority.

A compromised/replayed job payload cannot create new permissions.

## 13. Communication security

R3 providers are simulated/demo adapters.

Controls:

- templates are versioned/approved;
- variable names/schema allowlisted;
- destination values minimized and synthetic;
- rendered content is not treated as HTML/code unless a future channel explicitly requires safe rendering;
- no arbitrary provider API endpoint or credential in template/config data;
- logical request idempotency;
- delivery retry idempotency;
- safe bounded retry;
- provider failure details sanitized;
- communications visible only to authorized context projections.

## 14. Inbound integration security

Before accepting an event:

1. enforce route/method/content-type/body-size policy;
2. resolve enabled integration key ID;
3. verify timestamp freshness;
4. hash exact raw body;
5. verify HMAC in constant time;
6. validate external event identity;
7. validate payload schema/event family;
8. reserve replay/idempotency identity;
9. persist accepted event/audit/outbox;
10. process asynchronously through Application.

Never:

- accept an arbitrary callback URL and call it;
- execute an action name supplied by payload directly;
- deserialize to provider classes with executable behavior;
- log HMAC secret/signature raw values at info level;
- reveal whether a disabled/unknown key corresponds to a real integration beyond safe error policy.

## 15. Import security

Import source is untrusted uploaded content.

Controls:

- approved MIME/extension and size limits defined in API Contract;
- private storage;
- no macro/script execution;
- CSV/XLSX parsing library configured to treat cells as data;
- formula cells are not evaluated by server;
- spreadsheet/CSV injection risks are considered when later exporting displayed values;
- mapping only to allowlisted importer fields;
- no arbitrary table/column mapping;
- dry-run cannot mutate authoritative state;
- row-level validation/errors sanitized;
- explicit admin Commit;
- per-row Application authorization/validation;
- source file path/key not exposed publicly.

Malware scanning may remain optional for the synthetic demo unless the chosen parser/file types increase risk enough to require it during implementation review.

## 16. Custom-field security

Custom fields cannot be used as a shadow schema for secrets/PII/business invariants.

Controls:

- supported target-type allowlist;
- supported primitive value types;
- max lengths/ranges/enums;
- sensitivity classification;
- blocked protected field keys/reserved namespaces;
- no secret/auth/token/password values;
- no executable markup/code;
- permission checks on definition admin and value write/read;
- version pin/reference for reproducibility.

## 17. Bulk-action security

Bulk is orchestration only.

For every selected item:

- resolve current authoritative resource;
- authorize actor for that resource/action;
- validate current state;
- validate concurrency guard;
- execute the same single-item Application command;
- record outcome.

A bulk request cannot widen the caller's normal permissions.

API Contract must cap batch size to resist resource exhaustion.

## 18. Error/redaction policy R3

RFC 9457 remains.

Never expose:

- JWT/signing secrets;
- integration HMAC secret/signature details;
- password/password hash;
- provider credentials;
- raw webhook body when sensitive;
- full import source rows if projection does not require them;
- raw provider response;
- SQL/Prisma internals;
- filesystem paths;
- Worker lease internals not needed by actor;
- automation internal exception stack;
- other-customer existence hints.

Public/customer/integration auth failures use safe generic messages while logs retain sanitized correlation/category.

## 19. Threat model additions

Historical TM-001..TM-014 remain applicable.

### TM-R3-001 — Cross-customer portal IDOR

**Threat:** authenticated customer changes IDs to access another customer's Customer/Policy/Claim/Communication/Evidence.

**Mitigations:** account->customer authoritative binding; own-resource repository/query policy; no trust in client customer ID; safe denial; tests across all portal resource types.

**Residual risk:** LOW after QA.

### TM-R3-002 — Staff privilege escalation

**Threat:** Operator invokes Supervisor/Admin operation or forges role claim.

**Mitigations:** separate permission matrix; signed short-lived JWT; role->permissions server mapping; no UI authority; operation tests; token context validation.

**Residual risk:** LOW.

### TM-R3-003 — Customer token accepted as staff token

**Threat:** token from customer issuer is reused on staff API.

**Mitigations:** separate keys/issuer/audience/context guards; negative contract tests.

**Residual risk:** LOW.

### TM-R3-004 — Pipeline/configuration rule tampering

**Threat:** unauthorized actor or stale admin update changes operational behavior.

**Mitigations:** admin permission; versioned immutable activation; optimistic concurrency; audit; strict validation; no domain invariant override.

**Residual risk:** LOW/MEDIUM until implementation conformance.

### TM-R3-005 — Webhook forgery/replay

**Threat:** attacker sends forged or replayed integration event.

**Mitigations:** HMAC; timestamp; event ID; persisted replay identity; rate limiting; schema validation; fail closed.

**Residual risk:** LOW with secret protection.

### TM-R3-006 — Automation code/config injection

**Threat:** crafted rule executes arbitrary code, SQL, HTTP or unauthorized action.

**Mitigations:** constrained schema/DSL; no eval; fixed field/operator/action allowlists; action->Application command mapping; immutable version; admin audit.

**Residual risk:** LOW/MEDIUM until parser/evaluator tests.

### TM-R3-007 — Duplicate async side effects

**Threat:** worker crash/retry duplicates communication, stage move, task or automation action.

**Mitigations:** at-least-once assumption; deterministic idempotency identity; transactional outbox/job reservation; handler replay logic; concurrency guards.

**Residual risk:** LOW after retry/concurrency QA.

### TM-R3-008 — Poison job/dead-letter leakage

**Threat:** malformed work repeatedly fails or dead-letter exposes sensitive payload.

**Mitigations:** schema validation before enqueue/execute; bounded retries; sanitized payload/failure; dead-letter access permission; audit requeue.

**Residual risk:** LOW.

### TM-R3-009 — Communication abuse/template injection

**Threat:** attacker/admin inserts malicious template variables/content or causes repeated sends.

**Mitigations:** admin versioning; variable schema; simulated provider; request+delivery idempotency; bounded retries; no arbitrary destination/provider URL.

**Residual risk:** LOW for simulated R3.

### TM-R3-010 — Import parser/file abuse

**Threat:** oversized/malformed/macro/formula file causes code execution, DoS or unauthorized writes.

**Mitigations:** size/type limits; no macro/formula execution; private storage; allowlisted mappings; dry-run; admin commit; row validation; time/resource bounds.

**Residual risk:** MEDIUM until parser implementation QA.

### TM-R3-011 — Custom-field shadow PII/secret storage

**Threat:** admin uses custom fields to store secrets, uncontrolled PII or override typed behavior.

**Mitigations:** blocked namespaces/types; sensitivity classification; no secrets; supported targets; validation; audit/versioning; projection redaction.

**Residual risk:** LOW/MEDIUM.

### TM-R3-012 — Bulk authorization bypass

**Threat:** one authorized item causes unauthorized actions on other selected items.

**Mitigations:** per-item authorization/state/concurrency; delegate single-item commands; per-item outcomes; batch-size cap.

**Residual risk:** LOW.

### TM-R3-013 — Integration-driven payment-state spoofing

**Threat:** inbound payment-intention event directly marks Collection as paid/resolved.

**Mitigations:** event treated as untrusted intention; separate verification/Application rule before authoritative mutation; audit; no direct webhook DB write.

**Residual risk:** LOW.

### TM-R3-014 — Worker privilege overreach

**Threat:** internal Worker implicitly becomes database/admin superuser at business level.

**Mitigations:** Worker enters Application; specific system actor permissions; no direct controller/Prisma business mutation; architecture tests.

**Residual risk:** LOW.

### TM-R3-015 — Configuration version drift

**Threat:** existing work/execution silently changes behavior after admin activates a new version.

**Mitigations:** work items/executions/communications pin exact version; no silent remap; activation audit.

**Residual risk:** LOW.

### TM-R3-016 — Async resource exhaustion

**Threat:** webhook/import/automation creates excessive jobs/retries.

**Mitigations:** rate limits; quotas/batch caps in API Contract; bounded attempts; backoff; Worker concurrency limits; job payload limits; dead-letter.

**Residual risk:** MEDIUM for public demo hosting.

## 20. Security logging and audit separation

Historical rule remains:

```text
technical logs != durable audit
```

R3 technical logs include safe context such as:

- service (`api`, `worker`, `mcp`, simulator);
- request/correlation ID;
- job/execution/inbound event IDs where non-secret;
- event/action type;
- attempt number;
- sanitized failure category;
- duration/status.

No raw credentials/tokens/signatures/passwords/files/provider secrets.

R3 durable audit obligations are defined in `AUDIT_MODEL_R3.md`.

## 21. Security verification obligations R3

Implementation/API QA must prove at minimum:

1. staff/customer tokens are mutually rejected across surfaces;
2. Operator cannot call Supervisor/Admin-only operations;
3. Administrator does not implicitly bypass Claim lifecycle rules;
4. portal customer cannot read another customer's Customer/Policy/Claim/Communication/Evidence;
5. invalid/stale/replayed webhook produces no authoritative mutation;
6. accepted webhook retry is idempotent;
7. automation rule cannot execute arbitrary code/action/permission;
8. automation retry does not duplicate authoritative effects;
9. Worker has no direct business Prisma mutation path outside approved Infrastructure/Application composition;
10. communication retry is bounded/idempotent;
11. import preview/dry-run cannot mutate authoritative state;
12. import parser does not evaluate formula/macro/script content;
13. custom fields reject protected/secret use;
14. bulk action independently authorizes every item;
15. dead-letter read/requeue requires approved permission and exposes sanitized data;
16. new Problem Details contain no secret/internal payload;
17. all historical security tests continue passing.

## 22. Blueprint readiness mapping

This artifact supplies R3 evidence for:

- `architecture.security_model`;
- `architecture.threat_model` (applicable);
- supports later `api.auth_contract`;
- supports later `api.permission_matrix`;
- supports later `api.security_qa` and `qa.security`.

The security package is `READY_FOR_REVIEW` and requires explicit human approval with the rest of Architecture/Security/Data R3.