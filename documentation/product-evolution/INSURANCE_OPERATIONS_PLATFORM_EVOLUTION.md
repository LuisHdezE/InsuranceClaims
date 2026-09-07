# Insurance Operations Platform Evolution Guide

**Status:** Product-evolution guidance, not approved MVP scope  
**Project:** Insurance Claims Legacy Modernization  
**Date:** 2026-09-07  
**Applies after / alongside:** governed MVP v0.1.0 without retroactively changing its accepted scope

## 1. Purpose

This document captures product and architecture analysis derived from additional insurance-operations reference material reviewed after completion of the governed claims MVP lifecycle.

Its purpose is to guide future implementation while preserving the current project story:

> Modernize a legacy-dependent claims workflow first, then evolve the modern platform around it without coupling new capabilities to the legacy core.

This document is intentionally **not** a replacement for `documentation/requirements/REQUIREMENTS.md`, the accepted interface scope, or any prior approval artifact. Capabilities described here become implementation scope only after explicit prioritization and approval.

## 2. Reference inputs reviewed

The analysis was derived from externally supplied reference material describing a configurable insurance brokerage operations platform, including:

- `arquitectura-crm-far-seguros.md`
- `arquitectura-crm-far-seguros-v2.md`
- `kpis-webhook-correos-far-seguros.md`
- `Manual de Operaciones_ Gestión Unificada y Automatizada para Corredurías de Seguros.pdf`
- six screenshots showing pipeline creation, pipeline selection, Kanban/list views, opportunity creation and pipeline administration

These source artifacts are reference inputs only. Their business rules, insurer-specific values, contact details, deadlines, wording and operational assumptions must **not** be treated as verified production facts unless independently validated and approved.

## 3. Current product baseline

The existing MVP remains centered on three accepted journeys:

| Surface | Current capability |
|---|---|
| Public web | Digital claim intake |
| Public web | Customer claim tracking |
| Operator backoffice | Authentication, claim list/detail, evidence and lifecycle transitions |
| API | Claims operations, health and legacy eligibility adapter |
| Persistence | PostgreSQL authoritative modern claim state |
| Legacy coexistence | Simulated policy/vehicle eligibility dependency |
| MCP | Separate read-only claim-status presentation boundary |

The current public Home is retained as the **public landing page** of the evolving solution. Future operational capabilities belong behind the public experience rather than replacing it.

## 4. Target product direction

The target direction is an **Insurance Operations Platform** built around the existing claims modernization core.

```text
Public Site
   |
   +-- Landing
   +-- Claim Intake
   +-- Claim Tracking
   +-- Customer Portal (future)
           |
           v
      REST Application Boundary
           |
           v
Insurance Operations Core
   |
   +-- Claims
   +-- Customers / Policies
   +-- Pipeline Engine
   +-- Task Engine
   +-- Automation Engine
   +-- Communication Hub
   +-- Analytics
   +-- Import / Data Operations
   |
   +-- Renewals (later)
   +-- Collections (later)
   +-- Sales (deferred expansion)
```

This preserves the portfolio narrative: claims modernization is the entry point; the broader platform is an evolution around that core.

## 5. Central architectural insight: configurable Pipeline Engine

The reference system reveals that Kanban should not be implemented independently for every business process.

A reusable pipeline capability should model:

```text
Pipeline
   +-- Stage definitions
   +-- Stage order
   +-- Reporting metadata
   +-- Field definitions
   +-- Automation hooks
   +-- Work items / projections
```

A future pipeline can then represent Claims, Collections, Renewals, Sales or another configured process without duplicating presentation and workflow infrastructure.

### 5.1 Important boundary rule

A generic pipeline must **not** replace strong domain models.

For Claims:

```text
Claim Aggregate
   +-- Claim lifecycle
   +-- Evidence
   +-- Status history
   +-- Decisions
   +-- Audit
   +-- Legacy eligibility context
            |
            v
     Pipeline Work Item / Projection
            |
            v
          Kanban
```

The claim aggregate remains authoritative for claim business invariants. The pipeline is an operational projection and workflow surface.

This same pattern should be considered for future Renewals, Collections and Sales rather than collapsing all business behavior into a generic `Opportunity` CRUD model.

## 6. Product surfaces

### 6.1 Public site

The public landing page remains the entry point and should eventually connect to real public/customer capabilities:

| Public capability | Direction |
|---|---|
| Landing | Preserve and finish visual fidelity |
| Report a claim | Existing MVP capability |
| Track a claim | Existing MVP capability |
| Products / quotation | Future commercial capability, not part of current MVP |
| Public documents | Future curated content capability |
| Help / FAQ | Future public-support content |
| Customer area | Future authenticated Customer Portal |

### 6.2 Customer Portal

Future authenticated customer self-service can expose:

- customer profile;
- policies;
- claims;
- claim timeline;
- evidence and required documents;
- outstanding actions;
- insurer-specific guidance;
- communication history;
- support/contact actions.

The customer portal must be a separate authorization surface from the staff backoffice.

### 6.3 Staff Operations Workspace

The operator surface can evolve into:

- Dashboard;
- Customers;
- Policies;
- Claims;
- Pipelines;
- Tasks;
- Communications;
- Imports;
- Reports;
- Configuration.

The screenshots distinguish **operating a pipeline** from **configuring a pipeline**. That distinction should be preserved with separate permissions.

## 7. Claims Operations evolution

Claims is the highest-value immediate expansion because it directly strengthens the current MVP instead of changing its story.

A target claim-intake orchestration can become:

```text
Claim reported
   |
   +-- verify eligibility through port
   +-- persist Claim
   +-- persist evidence
   +-- create operational pipeline projection
   +-- create timeline/audit events
   +-- generate tasks when required
   +-- dispatch customer communication
   +-- notify staff
```

A practical operational pipeline can retain the reference stages as a starting point:

```text
REPORTED
   -> IN MANAGEMENT
   -> DOCUMENTATION PENDING
   -> RESOLVED
```

However, stage names, transitions and outcomes must be reconciled with the existing Claim domain and approved requirements before implementation.

## 8. Task Engine

The reference material repeatedly uses automation to create controlled human work rather than attempting to automate every decision.

A reusable Task Engine should support:

```text
Event / Rule
   -> Create Task
   -> Assign owner / queue
   -> Due date / priority
   -> Notification
   -> Completion / rejection
   -> Audit trail
```

Potential Claims tasks include evidence review, missing-document follow-up, insurer contact, coverage review, estimate review, adjuster follow-up, SLA escalation and closure review.

Tasks should be first-class entities rather than free-form notes embedded in claims.

## 9. Automation Engine

The generic automation model should support a controlled structure such as:

```text
WHEN event
IF conditions
WAIT optional duration / until date
THEN one or more actions
```

Candidate actions:

| Action | Example |
|---|---|
| MoveStage | Move operational projection to Documentation Pending |
| CreateTask | Request operator review |
| SendWhatsApp | Send approved template through adapter |
| SendEmail | Send transactional guidance |
| AddTag | Mark operational context |
| NotifyOperator | Create internal alert |
| PauseAutomation | Stop reminders after a customer response |
| UpdateField | Update an approved workflow field |
| ScheduleCheck | Re-evaluate later |

Automation must be idempotent, auditable and safe under retries.

### 9.1 Rules by insurer

Insurer-specific reference rules must not be hardcoded as universal domain facts.

Prefer a versioned configuration model:

```text
InsurerRuleSet
   +-- insurer
   +-- effectiveFrom / effectiveTo
   +-- coverage / grace configuration
   +-- reminder policy
   +-- claim requirements
   +-- communication templates
```

Every production rule must have provenance and approval before activation.

## 10. Communication Hub

WhatsApp, email and internal notifications should be isolated behind communication ports/adapters rather than embedded directly in Claim application services.

A target model includes:

```text
Communication
   +-- Channel
   +-- Template
   +-- Template variables
   +-- Delivery
   +-- Delivery status
   +-- Incoming message
   +-- Attachment metadata
   +-- Communication history
```

The reference material provides a valuable reusable pattern for incoming messages:

```text
Inbound webhook
   -> identify customer/context
   -> classify event/intention
   -> pause incompatible automation
   -> transition workflow if allowed
   -> create human verification task
   -> acknowledge receipt
```

For Claims this can later support events such as customer document submission, requested evidence arrival or other customer responses without requiring manual polling.

## 11. Insurer guidance and document requirements

The reference material shows insurer-specific claim guidance delivered by email, including documents, steps, assistance channels and links.

The reusable capability is more important than the supplied text itself.

A future model can expose:

```text
Insurer Claim Guidance
   +-- required documents
   +-- deadlines
   +-- instructions
   +-- assistance contacts
   +-- forms / downloads
   +-- approved service-network links
```

The same approved guidance can feed both transactional communications and the Customer Portal.

No supplied insurer-specific phone number, deadline or requirement becomes production truth merely by appearing in a reference document.

## 12. Customer and Policy 360

The platform should eventually have a master Customer and Policy view so the same person can participate in multiple workflows without data duplication.

A customer can simultaneously have, for example, an active claim and a future renewal workflow. This requires normalized relationships rather than copying customer data into each pipeline card.

Candidate relationship model:

```text
Customer
   +-- Policies
   +-- Claims
   +-- Communications
   +-- Tasks
   +-- Pipeline Work Items
```

PII handling, access control and audit must remain explicit.

## 13. Import and data operations

Bulk data ingestion is a valuable enterprise capability, but it should be safe by design.

Target flow:

```text
Upload
   -> Preview
   -> Column mapping
   -> Validation
   -> Duplicate/error review
   -> Dry run
   -> Commit import
   -> Result summary
   -> Audit
```

The import process should create an `ImportJob` and preserve per-row outcomes. Uploading a spreadsheet must never directly mutate production state without validation and traceability.

## 14. Analytics and management visibility

The reference material emphasizes conversion, value at risk and stage distribution. For the current project, the first analytics should remain Claims-centered.

Candidate Claims KPIs:

| KPI | Value |
|---|---|
| Open claims | Current operational load |
| Claims reported today | Intake volume |
| Time to first response | Customer-service responsiveness |
| Mean resolution time | Operational efficiency |
| Claims by stage | Work distribution |
| Documentation-pending claims | Bottleneck indicator |
| Claims outside SLA | Escalation indicator |
| Evidence pending review | Operational workload |
| Claims by insurer | Distribution / capacity planning |
| Resolved claims | Throughput |

Later, if Collections/Renewals/Sales are approved, management analytics can expand to financial risk, retention and commercial conversion.

## 15. Later business modules

### 15.1 Renewals

The reference material models automated stage movement based on policy expiry windows. This is a strong future extension because it builds naturally on Customer + Policy + Scheduler capabilities.

### 15.2 Collections

Collections introduces payment status, delinquency stages, insurer-specific reminder rules, inbound payment-intention webhooks and manual verification tasks. It is valuable but materially expands the domain and should not be pulled into the Claims MVP by accident.

### 15.3 Sales

Sales completes a full brokerage lifecycle but moves the product further toward CRM/ERP territory. It should remain deferred until the Claims Operations story is complete and the broader platform direction is explicitly approved.

## 16. Cross-cutting requirements not sufficiently covered by the reference system

The supplied reference material is useful for product capabilities but does not fully define the controls needed for a robust implementation.

Future work must explicitly cover:

- RBAC separation for Customer, Operator, Supervisor and Administrator;
- webhook authentication and replay protection;
- PII protection and least-privilege access;
- auditability of human and automated actions;
- rule/configuration versioning;
- communication retries and dead-letter handling;
- scheduler/job idempotency;
- optimistic/pessimistic concurrency where appropriate;
- drag-and-drop transition validation on the server;
- observability and correlation IDs across automations;
- data retention and deletion policy only after real requirements exist;
- synthetic/demo data for this portfolio case unless explicitly replaced by authorized data.

## 17. Visual and UX guidance extracted from the screenshots

The reference screenshots support the following reusable interface concepts:

| Concept | Guidance |
|---|---|
| Pipeline selector | Quickly switch operational context |
| Kanban/list toggle | Provide both visual and data-dense views |
| Advanced filters | Essential for operational triage |
| Sorting | Allow priority/time/value ordering |
| Search | Search active work items/customer context |
| Import action | Entry point to governed bulk ingestion |
| Add work item | Associate an existing contact with a pipeline/stage |
| Manage fields | Administrative capability, permission-gated |
| Pipeline administration | Separate screen from daily operations |
| Stage reporting flags | Configure whether stages feed funnel/distribution analytics |

## 18. Current public-landing visual debt

The current public Home remains the target landing page, but visual review has identified outstanding work before it can be considered aligned with the approved reference:

- the hero photographic asset is not rendering in the local Vite composition despite the layout allocating the intended space;
- remaining differences exist in hero composition, spacing, typography, depth, footer density and overall visual fidelity;
- the next implementation step must diagnose the actual asset HTTP response, MIME type, file integrity and Vite serving path before further CSS guessing;
- public controls must never look actionable if they intentionally remain outside MVP scope.

This debt is independent from the broader product-evolution roadmap and should be resolved as part of the active Home visual-alignment work.

## 19. Implementation guardrails

1. Keep the current accepted MVP requirements and approvals immutable unless a new governed change explicitly reopens them.
2. Preserve Clean Architecture + Ports & Adapters across web, API, MCP and integrations.
3. Keep PostgreSQL authoritative for modern workflow state.
4. Keep legacy coexistence simulated in this portfolio project unless explicitly re-scoped.
5. Prefer reusable platform capabilities over duplicated per-module infrastructure.
6. Preserve strong domain aggregates; generic pipeline infrastructure is operational support, not a replacement for domain invariants.
7. Validate business rules before treating reference material as production truth.
8. Reduce scope before skipping quality/security/review gates.
9. Keep all demo/customer/insurer data synthetic unless authorized real data is explicitly introduced.
10. Require human approval before promoting any future capability from this guide into committed implementation scope.

## 20. Recommended evolution sequence

```text
Current MVP
   -> finish public Home visual alignment
   -> deepen Claims Operations
   -> Pipeline / Kanban foundation
   -> Task Engine
   -> Communication Hub
   -> Customer + Policy 360
   -> Automation Engine
   -> Claims Analytics
   -> Customer Portal
   -> Import / bulk operations
   -> Renewals
   -> Collections
   -> configurable Pipeline Builder / Custom Fields
   -> Sales / additional commercial pipelines
   -> full management intelligence
```

This sequence is directional. The authoritative implementation order should be maintained in the companion backlog and changed only through explicit project decisions.
