# Target Capability Backlog

**Status:** Planning guidance only; not approved MVP scope  
**Companion:** `INSURANCE_OPERATIONS_PLATFORM_EVOLUTION.md`  
**Date:** 2026-09-07

## 1. Purpose

This backlog translates the product-evolution analysis into an ordered set of candidate capabilities. It is deliberately separated from the already-approved MVP requirements so future work can be selected without rewriting historical approvals.

Priority meanings:

| Priority | Meaning |
|---|---|
| P0 | Immediate continuation of the current claims-modernization story |
| P1 | High-value platform capability after P0 foundation is stable |
| P2 | Broader insurance-operations expansion |
| Deferred | Valuable, but not justified until the core platform is mature |

No item becomes committed scope merely by appearing here.

## 2. P0 — Finish current public experience and deepen Claims Operations

### P0-01 — Diagnose and fix Home hero asset rendering

**Outcome:** The public landing page renders the intended photographic hero consistently in local/dev build.

Acceptance direction:

- verify direct HTTP response for `/insurance-claims-home-hero.jpg`;
- verify status code, MIME type, file integrity and dimensions;
- confirm Vite/public-dir behavior;
- remove any stale/broken asset path;
- validate desktop and mobile rendering;
- compare against the approved visual baseline before merge.

### P0-02 — Finish Home visual fidelity

**Outcome:** The landing page remains the public entry point and more closely matches the approved target.

Focus:

- hero composition and image crop;
- typography scale/weight;
- spacing and vertical rhythm;
- quick-access-card proportions;
- benefits/process hierarchy;
- footer density and polish;
- no false affordances for out-of-scope items.

### P0-03 — Claims operational pipeline

**Outcome:** Operators can view Claims in a clear stage-based operational board without weakening the Claim aggregate.

Candidate initial stages:

```text
REPORTED -> IN_MANAGEMENT -> DOCUMENTATION_PENDING -> RESOLVED
```

Requirements to decide before implementation:

- mapping from existing Claim statuses to operational stages;
- server-authoritative transition rules;
- drag/drop behavior and concurrency guard;
- list view equivalent;
- filters/search/sort;
- audit events for manual movement.

### P0-04 — Claims task model

**Outcome:** Human follow-up becomes first-class, assignable and auditable.

Minimum candidate fields:

| Field | Purpose |
|---|---|
| taskId | Stable identity |
| claimId | Claim relationship |
| type | Evidence review, follow-up, escalation, etc. |
| title | Operator-facing action |
| assignee/queue | Ownership |
| priority | Operational urgency |
| dueAt | Deadline |
| status | Open / completed / cancelled |
| createdBy | Human/system provenance |
| correlationId | Traceability |

### P0-05 — Claim timeline expansion

**Outcome:** Customer-safe and operator-safe timelines can be derived from durable events.

Candidate event families:

- Claim reported;
- eligibility verified;
- evidence added;
- status/stage transition;
- task created/completed;
- customer communication queued/sent/failed;
- customer response received;
- operator action;
- resolution recorded.

### P0-06 — Claims operations dashboard

**Outcome:** Supervisors can detect operational bottlenecks rather than only browse individual Claims.

Initial candidate KPIs:

- open claims;
- claims reported today;
- claims by stage;
- documentation-pending claims;
- time to first response;
- mean resolution time;
- claims outside SLA after SLA rules exist;
- evidence pending review;
- resolved claims.

## 3. P1 — Reusable operational platform capabilities

### P1-01 — Pipeline Engine foundation

**Outcome:** Reusable pipeline/stage metadata supports Claims first and future modules later.

Model direction:

```text
Pipeline
  -> Stages
  -> Reporting metadata
  -> Work-item projection
  -> Allowed transition metadata
```

Do not migrate Claim invariants into this generic model.

### P1-02 — Communication Hub

**Outcome:** Application services dispatch communications through ports instead of embedding channel-specific APIs.

Scope candidates:

- Email adapter;
- WhatsApp adapter interface with simulated/demo adapter first;
- template model;
- delivery state;
- retries;
- communication history;
- correlation IDs;
- safe failure behavior.

### P1-03 — Inbound webhook/event boundary

**Outcome:** External customer responses can safely enter workflow processing.

Controls required:

- signature/authentication;
- replay protection;
- idempotency;
- payload validation;
- customer/context resolution;
- safe event classification;
- audit trail;
- dead-letter/error path.

### P1-04 — Automation Engine v1

**Outcome:** Approved rules can create tasks, move operational projections and dispatch communications.

Rule form:

```text
WHEN event
IF conditions
WAIT optional time
THEN approved actions
```

Must include idempotency, retry safety, audit and rule versioning.

### P1-05 — Customer 360

**Outcome:** A customer becomes a master entity related to policies, claims, tasks and communications rather than duplicated data in each workflow.

### P1-06 — Policy 360

**Outcome:** Policy context supports claims and future operational processes.

Candidate data categories:

- policy identity;
- customer relationship;
- insurer;
- coverage/vigency metadata;
- insured asset references;
- modern/legacy identifiers;
- approved operational configuration references.

### P1-07 — Insurer guidance model

**Outcome:** Approved claim guidance can drive both transactional messages and customer self-service.

Candidate content:

- required documents;
- approved instructions;
- deadlines only when validated;
- assistance channels;
- forms/downloads;
- service-network links.

### P1-08 — Customer Portal foundation

**Outcome:** Customer authentication and self-service are separated from staff/operator authentication.

Initial candidate views:

- My claims;
- Claim detail/timeline;
- Required documents;
- Evidence upload;
- Outstanding actions;
- Approved guidance;
- Communications.

## 4. P2 — Broader insurance operations

### P2-01 — Governed import jobs

**Outcome:** Spreadsheet ingestion becomes traceable and safe.

Required flow:

```text
Upload -> Preview -> Mapping -> Validation -> Dry Run -> Commit -> Summary -> Audit
```

### P2-02 — Renewals module

**Outcome:** Policy-expiry windows generate proactive operational work.

Dependencies:

- Customer/Policy 360;
- scheduler;
- pipeline foundation;
- communication hub;
- approved rule configuration.

Reference stages may inform design but must be approved before implementation.

### P2-03 — Collections module

**Outcome:** Delinquency workflow, reminders, human verification and inbound payment-intention events can be modeled.

Dependencies:

- Customer/Policy 360;
- payment-state model;
- scheduler/automation;
- communication hub;
- inbound webhook boundary;
- task engine;
- verified insurer/business rules.

### P2-04 — Pipeline administration

**Outcome:** Authorized administrators can create/edit pipeline definitions and stages without code changes.

Capabilities inspired by the reference UI:

- pipeline name;
- ordered stages;
- stage reporting flags;
- stage lifecycle rules;
- enabled/disabled state;
- audit/version history.

### P2-05 — Custom field definitions

**Outcome:** Administrative metadata can extend operational views without weakening core domain schemas.

Guardrail: custom fields must not be used to bypass domain invariants or store uncontrolled secrets/PII.

### P2-06 — Bulk actions

**Outcome:** Authorized operators can safely act on multiple work items.

Every bulk action must enforce the same authorization and transition rules as single-record actions and produce per-item outcomes.

## 5. Deferred — Commercial CRM and full platform expansion

### D-01 — Sales pipeline

Reference direction:

```text
Lead New -> Contacted -> Quoted -> Awaiting Payment -> Sold
```

Defer until Claims Operations and reusable platform capabilities are demonstrably stable.

### D-02 — Additional custom pipelines

Examples may include specialty brokerage workflows. Implement only after the generic pipeline model has real value in at least two approved domains.

### D-03 — Full management BI

Potential later metrics:

- collections conversion;
- financial value at risk;
- renewal retention;
- sales conversion;
- cross-pipeline workload;
- insurer distribution;
- trend comparisons.

## 6. Cross-cutting backlog

The following requirements apply whenever their dependent features are selected:

| Capability | Required concern |
|---|---|
| All staff features | RBAC and least privilege |
| All automations | Idempotency, audit, retries, correlation |
| All external webhooks | Authentication, replay protection, validation |
| All pipeline moves | Server-side transition validation and concurrency protection |
| All communications | Delivery status, sanitization, failure handling |
| All configuration | Versioning, provenance and human approval |
| All customer data | PII controls and safe projections |
| All imports | Dry-run validation and row-level audit |
| All analytics | Defined metric semantics and safe aggregation |
| All future insurer rules | Independent verification before activation |

## 7. Scope-control rule

Before starting any P1, P2 or Deferred capability:

```text
candidate backlog item
   -> define target outcome
   -> write/adjust requirements
   -> model domain/application boundaries
   -> update interface inventory if applicable
   -> approve scope
   -> implement
   -> QA/review
```

The project must reduce scope before skipping gates.

## 8. Near-term recommended implementation order

For the active continuation, the recommended sequence is:

```text
1. P0-01 Hero asset diagnosis
2. P0-02 Home visual fidelity
3. P0-03 Claims operational pipeline
4. P0-04 Claims task model
5. P0-05 Claim timeline expansion
6. P0-06 Claims operations dashboard
7. P1-01 Pipeline Engine foundation / extraction where justified
8. P1-02 Communication Hub
9. P1-03 Inbound webhook boundary
10. P1-04 Automation Engine v1
11. P1-05/P1-06 Customer + Policy 360
12. P1-07 Insurer guidance
13. P1-08 Customer Portal
```

This order keeps the next work visibly connected to the current Claims MVP while laying platform foundations only when they have an immediate consumer.
