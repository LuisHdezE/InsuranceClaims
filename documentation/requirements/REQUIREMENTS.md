# Requirements — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD
Status: READY_FOR_REVIEW

This document converts the approved Discovery and Target Definition into testable MVP requirements. It defines **PROPOSED behavior for this technical case study**. It does not describe FAR internal systems or processes.

---

# 1. Actors and authorization intent

## ACT-001 — Demo Customer

Synthetic insured/customer persona using the public claim-intake and tracking flows.

Authorization intent:

- may request validation of a synthetic policy/vehicle combination;
- may create a claim only when the server has validated the referenced synthetic policy/vehicle through the legacy integration boundary;
- may submit restricted synthetic evidence during claim intake;
- may track only a claim that matches the approved public tracking credentials;
- may not execute administrative state transitions;
- may not access internal audit/security information.

## ACT-002 — Claims Operator

Authenticated demo backoffice user.

Authorization intent:

- may list claims;
- may view claim detail and submitted evidence;
- may execute only state transitions allowed by the domain rules;
- may not bypass the API/Application layer;
- every meaningful administrative state transition must be durably audited.

For the MVP, a single operator role is sufficient. Fine-grained multi-role backoffice authorization is deferred unless Architecture identifies a mandatory security reason.

## ACT-003 — MCP Client

External AI/MCP client using explicitly exposed read-only tools.

Authorization intent:

- may request customer-safe claim status information using the same lookup constraints as the public tracking use case;
- may not modify claims;
- may not expose internal operator/audit information;
- may not query PostgreSQL or the simulated legacy service directly.

## ACT-004 — Simulated Legacy System

Separate synthetic system actor representing a pre-existing insurance core dependency for demonstration purposes.

Authorization intent:

- is accessed only through the modern system's legacy adapter;
- exposes only synthetic policy/vehicle verification data required by the MVP;
- does not become the authoritative store for modern claim workflow data.

## ACT-005 — Project Operator / Developer

Runs the demo, tests, Docker/Kubernetes environments and validation commands. This actor has operational access, not business authorization within the claim workflow.

---

# 2. Permission intents

These identifiers seed later API permission mapping. They are requirement-level intents, not endpoint names.

| Permission intent | Actor | Meaning |
|---|---|---|
| `claims.intake.create` | Demo Customer | Submit a new synthetic claim after server-side policy validation |
| `claims.tracking.read` | Demo Customer | Read customer-safe status/timeline for a matching tracking lookup |
| `claims.backoffice.read` | Claims Operator | List and inspect claims/evidence |
| `claims.backoffice.transition` | Claims Operator | Execute approved state transitions |
| `claims.mcp.status.read` | MCP Client | Read customer-safe claim status through MCP |

The API/Application boundary is authoritative for all permissions.

---

# 3. Functional requirements

## Policy/legacy validation

### FR-001 — Verify synthetic policy and vehicle

The system shall validate a supplied synthetic policy reference and vehicle reference through an Application use case backed by a legacy integration port.

Acceptance intent:

- validation success returns enough synthetic policy/vehicle context to continue intake;
- validation failure does not create a claim;
- the web client and MCP adapter cannot call the simulated legacy service directly.

### FR-002 — Server-side validation required for submission

The system shall not accept a claim submission unless the referenced synthetic policy/vehicle combination is validated server-side through the legacy integration boundary as part of the approved workflow.

## Claim intake

### FR-003 — Capture minimum claim data

The intake flow shall capture at minimum:

- verified policy reference;
- verified vehicle reference;
- event type;
- occurrence date/time;
- location text;
- customer description.

No real PII is required or permitted for the public demo dataset.

### FR-004 — Restricted synthetic evidence

The intake flow shall allow synthetic evidence attachments with these MVP limits:

- maximum 5 files per claim submission;
- maximum 5 MiB per file;
- allowed MIME types: `image/jpeg`, `image/png`, `application/pdf`;
- files must not be stored in a publicly browsable location;
- filename/MIME/size must be validated server-side.

For the MVP, customer evidence is added during intake and is read-only after final submission. Post-submission customer evidence amendment is deferred.

### FR-005 — Confirm claim submission

The customer shall explicitly confirm the intake before the claim becomes submitted.

On successful submission the system shall:

- create the claim;
- assign the initial approved lifecycle state;
- generate an opaque unique tracking code;
- create the initial customer-visible timeline entry;
- create the required durable business/audit evidence;
- return synthetic next-step information.

### FR-006 — Prevent duplicate accidental submission

The claim-submission operation shall support an idempotency strategy so that retrying the same confirmed submission does not create multiple claims.

The concrete key/header contract belongs to API Contract Design.

## Customer tracking

### FR-007 — Tracking lookup

The system shall allow customer tracking using both:

- the opaque tracking code; and
- the synthetic policy reference associated with that claim.

A tracking code alone shall not be treated as sufficient lookup proof for the public demo API.

### FR-008 — Customer-safe claim view

A successful tracking lookup shall expose only:

- tracking code;
- customer-safe claim summary;
- current customer-visible status;
- customer-visible status timeline;
- synthetic next-step information.

It shall not expose:

- operator credentials;
- technical logs;
- internal audit metadata;
- infrastructure details;
- data belonging to another synthetic claim.

## Backoffice

### FR-009 — Operator authentication

The backoffice shall require real demo authentication before claims can be listed or administratively modified.

The exact JWT/session/token mechanism is deferred to Architecture/Security.

### FR-010 — Claims list

An authenticated Claims Operator shall be able to list claims with enough summary data to identify tracking code, current state, occurrence date and verified synthetic policy/vehicle references.

Filtering/search details may be minimal and are not required beyond what is needed for the demo workflow.

### FR-011 — Claim detail

An authenticated Claims Operator shall be able to inspect:

- claim intake data;
- evidence metadata and permitted evidence retrieval;
- current lifecycle state;
- status history;
- customer-visible timeline information;
- relevant durable audit reference/details permitted to the operator role.

### FR-012 — Controlled state transition

An authenticated Claims Operator shall be able to request only transitions permitted by the approved claim lifecycle rules.

The server/domain layer shall reject invalid transitions even if a client attempts them directly.

### FR-013 — State transition history and audit

Every successful administrative claim-state transition shall create:

1. a claim status-history record/timeline event; and
2. a separate durable business/security audit event identifying the acting operator, action, claim reference, timestamp and correlation/request reference where available.

Technical logs do not satisfy this requirement.

## MCP

### FR-014 — Read-only MCP claim status

The MVP shall expose a real MCP tool capability equivalent to `get_claim_status`.

The tool shall:

- be implemented in TypeScript using the current supported MCP SDK/contract at implementation time;
- enter through a Presentation adapter;
- invoke an Application use case;
- use the same customer-safe lookup/redaction rules as public claim tracking;
- remain read-only;
- never access PostgreSQL or the simulated legacy service directly.

Additional MCP tools are optional and must not delay the mandatory release.

## Legacy simulator

### FR-015 — Separate simulated legacy service

The repository shall contain a separately runnable service labeled **SIMULATED LEGACY SYSTEM** that supplies only the synthetic policy/vehicle behavior needed by FR-001/FR-002.

The modern system shall consume it through an anti-corruption adapter implementing an internal port.

The simulator must not be represented as FAR's actual legacy technology or data model.

## Demo data

### FR-016 — Reproducible synthetic seed data

The demo shall provide repository-controlled synthetic data sufficient to execute the three mandatory slices without manual database editing.

At minimum the dataset shall include:

- one demo customer context;
- at least two synthetic policies/vehicles so positive and negative/alternate policy paths can be demonstrated;
- one demo Claims Operator;
- several claims spanning more than one lifecycle state after seeding or demo execution.

No seeded identifier may intentionally reproduce a real person's identity, email, phone, national ID or real confidential claim data.

## Observability and public safety

### FR-017 — Request/correlation identifier

HTTP business requests shall carry or receive a request/correlation identifier that can be propagated into technical logs and relevant audit evidence.

### FR-018 — Technical logs separate from audit

The system shall maintain structured technical/operational logs independently from durable business/security audit records.

### FR-019 — Health visibility

The runtime shall expose health information sufficient for local operation and Kubernetes liveness/readiness validation without exposing secrets.

---

# 4. Claim lifecycle business rules

The following lifecycle exists only for this synthetic MVP and is not claimed to match FAR's internal workflow.

## BR-001 — Approved states

The MVP claim lifecycle shall use:

```text
RECEIVED
UNDER_REVIEW
OBSERVED
APPROVED
IN_REPAIR
CLOSED
```

`OBSERVED` means that, in this synthetic case study, the claim requires additional review/information before it can proceed. It is not an assertion about FAR terminology.

## BR-002 — Allowed transitions

The allowed transitions are:

```text
RECEIVED -> UNDER_REVIEW
UNDER_REVIEW -> OBSERVED
UNDER_REVIEW -> APPROVED
OBSERVED -> UNDER_REVIEW
APPROVED -> IN_REPAIR
APPROVED -> CLOSED
IN_REPAIR -> CLOSED
```

All other direct transitions are invalid for the MVP.

## BR-003 — Closed is terminal

`CLOSED` is terminal in the first release. Reopening a claim is out of scope.

## BR-004 — Initial state

A newly confirmed claim enters `RECEIVED`.

## BR-005 — State authority

Only the server/domain logic is authoritative for lifecycle transitions. The client UI may hide unavailable actions but cannot define or override the transition rules.

## BR-006 — Operator-only transitions

Only an authenticated Claims Operator may request administrative transitions.

## BR-007 — Public status visibility

The customer-facing status may use the same lifecycle labels in the MVP, but public responses must never include internal audit/security metadata.

## BR-008 — Policy validation authority

Policy/vehicle validity for intake is obtained through the legacy integration port. Client-provided policy/vehicle information is never trusted as authoritative without server-side validation.

## BR-009 — Tracking reference

Tracking codes must be unique and opaque. They must not encode internal database identifiers or secrets.

## BR-010 — Evidence immutability after submission

Customer evidence is immutable after confirmed submission in the MVP. Administrative evidence modification workflows are not part of the first release.

## BR-011 — MCP is read-only

MCP cannot create claims, transition claims, delete claims, modify evidence or perform administrative actions.

## BR-012 — Synthetic-only domain data

All policy, vehicle, claim, user and evidence content used for the public demo is synthetic.

## BR-013 — Internal notes deferred

Operator internal notes are not committed to the mandatory release scope.

## BR-014 — Workshop directory deferred

Workshop directory/map behavior and workshop-related MCP tools are not committed to the mandatory release scope.

---

# 5. Non-functional requirements

## NFR-001 — Clean Architecture conformance

Backend, MCP and legacy integration shall conform to the approved Clean Architecture + Ports & Adapters dependency rules. The web client shall use an equivalent feature-oriented boundary so React presentation does not own authoritative server behavior.

Architecture Implementation Conformance must later be evidenced with executable checks where feasible.

## NFR-002 — API-authoritative security

Authentication, authorization, state transitions, validation and redaction must be enforced server-side. UI presentation rules are supplementary only.

## NFR-003 — Synthetic/public-safe data

No real PII, customer claim data, FAR secrets or production credentials may exist in source control, seed data, screenshots, logs or demo fixtures.

## NFR-004 — Secret handling

The repository shall contain only safe examples such as `.env.example`. Runtime secrets shall be injected through environment/configuration mechanisms and never hardcoded.

## NFR-005 — Upload safety

Evidence handling shall validate size/MIME, use non-public storage, generate safe server-side references and prevent raw user filenames from becoming trusted storage paths.

## NFR-006 — Structured observability

Technical logs shall be structured, contain correlation/request context where applicable and redact secrets/sensitive values.

## NFR-007 — Durable audit

Business/security audit records for login where appropriate, claim creation and administrative state transitions shall be durable and queryable independently from technical logs.

## NFR-008 — Reproducible Docker environment

The repository shall support a documented Docker Compose startup path sufficient to run the MVP dependencies required by the demo.

The exact container topology is an Architecture decision.

## NFR-009 — Kubernetes proof

The repository shall contain versioned Kubernetes deployment evidence with at least namespace, workloads, services, configuration strategy, probes and reasonable resource declarations, validated locally using an approved local Kubernetes environment.

## NFR-010 — Linux-oriented operation

Build/run/deployment instructions shall be executable in a Linux-oriented development/runtime environment.

## NFR-011 — Responsive web UI

The three mandatory web slices shall remain usable from approximately 360px-wide mobile viewport through desktop layouts.

## NFR-012 — Accessibility

The implemented MVP shall target WCAG 2.2 AA behavior for the covered flows, including keyboard access, form labels/errors, focus visibility, semantic status communication and sufficient contrast.

## NFR-013 — Error handling

API and client behavior shall define consistent handling of validation, authentication, authorization, not-found, conflict and rate-limiting/error conditions when those conditions apply.

The concrete error contract is decided in Architecture/API Contract.

## NFR-014 — Public endpoint abuse resistance

Public policy validation, tracking and other anonymous endpoints shall use an API-side abuse/rate-limiting strategy. Exact limits are deferred to Architecture/API Contract.

## NFR-015 — Testability

The project shall include tests covering domain rules, Application use cases, persistence/integration adapters, legacy contract behavior, MCP behavior/redaction, API integration, architecture conformance and critical web/E2E flows.

## NFR-016 — Exact-head CI evidence

Gate-relevant CI evidence shall run against the exact candidate SHA using repository-owned workflows. CI success does not replace human approval.

## NFR-017 — OpenAPI-first contract discipline

No authoritative HTTP endpoint implementation may begin before API Contract Ready. The final REST contract must have stable unique `operationId` values in the validated OpenAPI artifact.

## NFR-018 — Portfolio reproducibility

A reviewer shall be able to understand and reproduce the demo from repository documentation without needing access to FAR systems or confidential infrastructure.

---

# 6. Use cases

## UC-001 — Verify policy for claim intake

Primary actor: Demo Customer

Preconditions:

- synthetic legacy simulator is available;
- the customer has synthetic policy/vehicle references from the demo dataset.

Main flow:

1. Customer supplies synthetic policy and vehicle references.
2. Presentation calls the Application use case.
3. Application calls the legacy verification port.
4. Infrastructure adapter translates the request to the simulated legacy service.
5. A successful validation returns normalized synthetic policy/vehicle context.

Alternate flow:

- invalid/mismatched references return a safe validation failure and no claim is created.

## UC-002 — Submit digital claim

Primary actor: Demo Customer

Preconditions:

- policy/vehicle can be validated according to FR-001/FR-002.

Main flow:

1. Customer enters the required claim data.
2. Customer attaches optional permitted synthetic evidence.
3. Server validates claim fields and evidence constraints.
4. Customer confirms submission.
5. Application creates the claim idempotently in `RECEIVED`.
6. System generates opaque tracking code.
7. System records initial status history and durable audit evidence.
8. Customer receives tracking information and synthetic next steps.

## UC-003 — Track claim

Primary actor: Demo Customer

Main flow:

1. Customer supplies tracking code and associated synthetic policy reference.
2. Server validates the lookup pair.
3. Application returns the customer-safe claim summary, status, public timeline and next steps.

Alternate flow:

- invalid lookup returns a safe not-found/denied-style response without leaking which portion was incorrect.

## UC-004 — Authenticate operator

Primary actor: Claims Operator

Main flow:

1. Operator submits demo credentials through the approved authentication mechanism.
2. Server authenticates the operator.
3. Successful authentication establishes the approved session/token context.
4. Authentication event is handled according to the later security/audit design.

## UC-005 — Review claim in backoffice

Primary actor: Claims Operator

Precondition: authenticated operator.

Main flow:

1. Operator lists claims.
2. Operator opens one claim.
3. System presents claim data, evidence, current status and history permitted to the operator.

## UC-006 — Transition claim state

Primary actor: Claims Operator

Precondition: authenticated operator and an allowed transition from the current state.

Main flow:

1. Operator requests a transition.
2. Domain validates the transition rule.
3. Application persists new state/history atomically according to Architecture/Data decisions.
4. System writes separate durable audit evidence.
5. Customer tracking subsequently reflects the new customer-visible state/timeline.

Alternate flow:

- invalid transition is rejected without mutating claim state/history.

## UC-007 — Query claim status through MCP

Primary actor: MCP Client

Main flow:

1. MCP client invokes the read-only claim-status tool with the approved tracking lookup inputs.
2. MCP adapter invokes the Application tracking/status use case.
3. Application enforces the same lookup/redaction rules as customer tracking.
4. Tool returns customer-safe synthetic status data.

The MCP adapter never accesses PostgreSQL directly.

## UC-008 — Reproduce the demo environment

Primary actor: Project Operator / Developer

Main flow:

1. Operator follows repository setup documentation.
2. Operator starts the Docker Compose environment or approved local components.
3. Synthetic migrations/seeds prepare the demo state.
4. Operator verifies health and executes the end-to-end demo.
5. Kubernetes manifests can be applied and validated in the documented local Kubernetes environment.

---

# 7. Acceptance criteria

## AC-001 — Positive policy verification

Given a valid synthetic policy/vehicle pair,
when the customer requests verification,
then the modern Application returns normalized validated context obtained through the legacy port/adapter and no client accesses the simulator directly.

## AC-002 — Invalid policy blocked

Given an invalid or mismatched synthetic policy/vehicle pair,
when claim intake is attempted,
then claim submission is rejected and no claim record is created.

## AC-003 — Claim creation

Given a valid synthetic policy/vehicle pair and valid claim input,
when the customer confirms submission,
then exactly one claim is created in `RECEIVED`, an opaque tracking code is returned, initial history/audit evidence exists and permitted evidence metadata is associated with the claim.

## AC-004 — Evidence restrictions

Given an attachment exceeding the approved size/count or using an unapproved MIME type,
when submission validation occurs,
then the server rejects the invalid evidence and does not silently persist it.

## AC-005 — Idempotent submission

Given the same confirmed claim submission is retried with the same approved idempotency identity,
when the API receives the retry,
then no duplicate claim is created.

## AC-006 — Customer tracking

Given the correct tracking code and associated synthetic policy reference,
when the customer tracks the claim,
then current public status, public timeline and next steps are returned without internal audit/security metadata.

## AC-007 — Tracking information leak prevention

Given an invalid tracking/policy combination,
when tracking is requested,
then the response does not disclose whether the tracking code or policy reference alone is valid.

## AC-008 — Operator authentication required

Given an unauthenticated request for backoffice data or state mutation,
when the server processes it,
then access is denied at the API/Application boundary.

## AC-009 — Valid transition

Given a claim in `RECEIVED` and an authenticated operator,
when the operator transitions it to `UNDER_REVIEW`,
then the state changes, status history is appended and a separate durable audit event identifies the action.

## AC-010 — Invalid transition

Given a claim in `RECEIVED`,
when an operator attempts to transition directly to `CLOSED`,
then the server rejects the transition and preserves the original state/history.

## AC-011 — Closed terminal

Given a claim in `CLOSED`,
when any new state transition is requested,
then the server rejects it in the MVP.

## AC-012 — MCP architecture boundary

Given a claim-status MCP request,
when the tool executes,
then it invokes an Application use case, returns only customer-safe synthetic data and architecture tests/review prove it does not query PostgreSQL directly.

## AC-013 — Legacy anti-corruption boundary

Given policy verification,
when the modern system communicates with the simulator,
then translation occurs inside the legacy Infrastructure adapter implementing the approved port and Domain/Application contain no simulator protocol dependency.

## AC-014 — Audit/log separation

Given a successful administrative state transition,
when evidence is inspected,
then a durable business/security audit record exists independently of structured technical logs.

## AC-015 — Public-safe repository

Given the release candidate repository and demo assets,
when reviewed,
then no real FAR customer data, production secrets, real credentials or claimed internal FAR architecture/process artifacts are present.

## AC-016 — Docker reproducibility

Given the documented local prerequisites,
when the documented Docker Compose startup procedure is executed,
then the mandatory demo services reach their documented healthy state with synthetic data available.

## AC-017 — Kubernetes validation

Given the documented local Kubernetes environment,
when the versioned manifests are applied,
then required workloads/services become healthy according to readiness/liveness checks and can be removed using the documented cleanup procedure.

## AC-018 — Critical E2E journey

Given the seeded demo environment,
when a customer creates a claim, an operator performs a valid state transition and the customer tracks the same claim,
then the tracked status reflects the operator's change and the corresponding history/audit evidence is present.

---

# 8. Traceability

| Discovery objective | Requirement coverage | Use cases | Expected future slice/evidence |
|---|---|---|---|
| OBJ-001 Digital claim intake | FR-001..FR-006, BR-004, BR-008..BR-010, NFR-005 | UC-001, UC-002 | Slice A, API contract, domain/use-case/integration/E2E tests |
| OBJ-002 Operator backoffice | FR-009..FR-013, BR-002..BR-006 | UC-004, UC-005, UC-006 | Slice B, permission matrix, audit tests, E2E |
| OBJ-003 Customer tracking | FR-007, FR-008, BR-007, BR-009 | UC-003 | Slice C, API contract, client/E2E tests |
| OBJ-004 Simulated legacy coexistence | FR-001, FR-002, FR-015, NFR-001 | UC-001, UC-002 | legacy port/adapter ADR, contract tests, architecture conformance |
| OBJ-005 Read-only MCP through Application | FR-014, BR-011, NFR-001/NFR-002 | UC-007 | MCP adapter contract/tests/redaction evidence |
| OBJ-006 Docker/Kubernetes delivery | NFR-008, NFR-009, NFR-010, NFR-016 | UC-008 | Docker/K8s docs, CI/deployment evidence |
| OBJ-007 Security/correlation/audit | FR-013, FR-017..FR-019, NFR-002..NFR-007, NFR-013/NFR-014 | UC-002..UC-007 | security model, audit catalog, QA evidence |
| OBJ-008 Portfolio-safe public demo | FR-016, BR-012, NFR-003/NFR-004/NFR-018 | all | README/release review/demo evidence |

---

# 9. Deferred requirements / non-commitments

The following are intentionally **not** requirements for the mandatory MVP release:

- internal operator notes;
- workshop directory;
- workshop search MCP tool;
- maps/geocoding;
- productive notification integration;
- claim reopening;
- customer post-submission evidence amendments;
- multiple operator roles;
- real insurer/core integration;
- any FAR-specific data/process/infrastructure behavior.

They may only be activated through a later reviewed scope decision that does not bypass Blueprint gates.

---

# 10. Requirements readiness

All seven Blueprint Requirements checks have documentary coverage in this artifact:

- `requirements.actors_authorization` -> sections 1–2;
- `requirements.functional` -> section 3;
- `requirements.non_functional` -> section 5;
- `requirements.business_rules` -> section 4;
- `requirements.use_cases` -> section 6;
- `requirements.acceptance_criteria` -> section 7;
- `requirements.traceability` -> section 8.

The artifact is **READY_FOR_REVIEW**. The checks may be evidenced as complete, but `requirements_ready` must not become `PASS` until explicit human approval is recorded.
