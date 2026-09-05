# Discovery — Insurance Claims Legacy Modernization

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD
Status: READY_FOR_REVIEW

## 1. Product vision

Build a public, reproducible technical case study that demonstrates how a modern insurance-claims application can be introduced alongside a simulated legacy insurance core without forcing a risky rewrite.

The MVP must provide evidence of modern web delivery, API design, SQL data modeling, MCP integration, containerized execution, Kubernetes deployment artifacts, Linux-oriented operation and architecture discipline. It is a portfolio case study, not an official FAR product and not a reconstruction of FAR internal systems.

Visible title:

**Insurance Claims Legacy Modernization**

Subtitle:

**Technical case study: modern claims workflows over a simulated legacy insurance core**

Mandatory disclaimer:

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 2. Problem statement

Insurance claims workflows often need modern digital intake, backoffice handling and customer tracking while continuity constraints make full replacement of an existing core undesirable or unjustified.

This case study addresses that modernization problem by placing a maintainable modern application boundary in front of a deliberately simulated legacy dependency. The project demonstrates translation, isolation and coexistence rather than a big-bang rewrite.

The project does not assert that FAR uses any particular internal architecture, database, API, network, platform or legacy technology.

## 3. Opportunity

Demonstrate a credible junior-to-mid level engineering portfolio artifact around a realistic business workflow while aligning the implementation with the target technical competencies:

- Node.js + TypeScript backend;
- React + TypeScript web client;
- SQL/PostgreSQL;
- versioned REST API and OpenAPI;
- MCP implemented as a real presentation adapter;
- Docker and Docker Compose;
- practical Kubernetes manifests and local validation;
- Linux-oriented runtime/deployment documentation;
- simulated modern-to-legacy integration;
- Clean Architecture + Ports & Adapters with executable conformance evidence.

The value proposition is technical evidence, not a claim that a particular insurer lacks these capabilities.

## 4. Context classification

### OBSERVED

Public-facing capabilities identified during project framing include quoting, web payments, self-service functions, workshop information and claims information/instructions.

These observations are used only to avoid proposing a generic “replace the insurer website” project. They do not reveal or imply internal architecture or operational process.

### PROPOSED

The MVP proposes:

- a digital claim-intake workflow;
- an operator backoffice for permitted claim handling;
- customer claim tracking;
- a modern API/application boundary;
- read-only MCP access through Application use cases;
- reproducible Docker/Kubernetes delivery;
- an anti-corruption layer between the modern application and a simulated legacy system.

### SIMULATED

The following are explicitly synthetic/simulated:

- legacy insurance core behavior;
- policies and vehicles;
- claims and status history;
- users/operators;
- workshops;
- notifications;
- claim evidence;
- all identifiers and operational data.

No simulated behavior may be presented as an observation of FAR internals.

## 5. Primary actors

### Demo insured/customer

Uses synthetic policy data to initiate a claim and later track the public/customer-visible status and timeline.

### Demo claims operator

Authenticates to the backoffice, reviews synthetic claims and performs only the state-changing actions later authorized by Requirements and the API contract.

### AI/MCP client

Consumes explicitly exposed read-only MCP tools. It never accesses PostgreSQL directly and never bypasses Application use cases.

### Simulated legacy system

Represents an external pre-existing insurance-core dependency for demonstration purposes only. It is a system actor, not a model of FAR internals.

### Project operator/developer

Runs, validates and demonstrates the system using repository-owned documentation, containers, tests and deployment artifacts.

## 6. MVP boundary

The MVP is intentionally narrow and centers on three mandatory business slices.

### Slice A — Digital claim intake

The demo customer can:

1. select or verify a synthetic policy through the modern system;
2. start a claim;
3. provide the minimum event information later approved in Requirements;
4. attach synthetic evidence within approved restrictions;
5. confirm submission;
6. receive a claim/tracking reference;
7. receive synthetic next-step information.

### Slice B — Claims backoffice

The demo operator can:

1. authenticate;
2. list claims;
3. inspect claim detail and evidence;
4. execute only approved claim-state transitions;
5. produce durable timeline/audit evidence for relevant actions.

Internal notes remain a candidate, not a committed feature, until Requirements determines whether they are needed.

### Slice C — Claim tracking

The demo customer can:

1. retrieve a claim through an approved tracking mechanism;
2. see the current customer-visible status;
3. see a customer-visible timeline;
4. see synthetic next-step information.

## 7. Required technical capabilities within the MVP

These are project constraints/capabilities, not yet detailed architecture contracts:

- Node.js + TypeScript backend runtime;
- React + TypeScript + Tailwind web client;
- PostgreSQL with versioned migrations and synthetic seeds;
- versioned REST API with OpenAPI as machine-readable contract;
- Clean Architecture + Ports & Adapters across backend, web client, MCP and legacy integration;
- executable architecture conformance tests where feasible;
- separate simulated legacy service and anti-corruption adapter;
- real MCP server in TypeScript using current SDK/contract at implementation time;
- MCP tools restricted to read-only portfolio-safe behavior;
- Docker/Docker Compose reproducibility;
- Kubernetes manifests with practical local validation;
- structured logs and request/correlation ID;
- durable business/security audit separate from technical logs;
- synthetic-only demo data;
- repository CI with exact-candidate-SHA evidence and human approval kept separate.

Framework selection inside Node.js remains an Architecture decision. NestJS is a preferred candidate from project framing, not a Discovery-approved contract.

## 8. Conditional secondary capabilities

The following may be included only when they do not threaten the three mandatory slices or Blueprint gates:

- synthetic authorized-workshop directory;
- a read-only MCP workshop lookup tool;
- local email/notification simulation;
- map/geolocation presentation.

If time or complexity becomes material, these are reduced or removed before any mandatory gate is skipped.

## 9. Explicit out of scope

The first release excludes:

- payments or indemnity processing;
- quoting/pricing;
- real policy issuance;
- native Android/Kotlin application;
- public chatbot;
- AI damage assessment;
- real FAR integration;
- productive WhatsApp integration;
- biometrics;
- real document processing;
- BCU integration;
- accounting;
- Active Directory integration;
- real on-premise infrastructure;
- multi-tenancy;
- unnecessary microservices;
- Kafka/RabbitMQ unless a later approved requirement proves necessity;
- event sourcing unless a later approved requirement proves necessity;
- any use of real customer PII or operational secrets.

## 10. Constraints

- Blueprint Master 0.5.2 is read-only for the duration of the MVP.
- Blueprint findings are recorded and deferred until after Release Gate.
- Delivery mode is GREENFIELD even though legacy coexistence is demonstrated.
- The legacy dependency is SIMULATED.
- Clean Architecture + Ports & Adapters is REQUIRED by this consumer.
- Domain and Application may not depend on frameworks, database drivers, MCP SDKs, HTTP details or legacy implementation details.
- REST, MCP and other entry adapters must call Application use cases.
- No adapter may reach PostgreSQL in a way that bypasses approved Application/port boundaries.
- No client may invent server permissions, states, transitions or endpoints.
- API remains authoritative for business rules and authorization.
- OpenAPI becomes authoritative only after API Contract Design; Discovery does not define final endpoints or operationIds.
- No real FAR data, processes, architecture or infrastructure may be fabricated.
- Scope reduction takes precedence over gate skipping.
- Human approval is not inferred from CI.
- The target execution timebox is approximately four intensive days, but quality gates are not relaxed to meet it.

## 11. Assumptions to validate later

These are hypotheses, not contracts:

- synthetic policy verification can be represented adequately by the legacy simulator;
- a compact claim lifecycle is sufficient for the portfolio demo;
- a tracking code or equivalent can provide customer tracking without exposing unnecessary data;
- one synthetic operator role may be enough for the first backoffice slice;
- read-only MCP tools such as claim-status lookup can demonstrate MCP value without increasing security risk;
- a small workshop directory may be useful for a second MCP tool, but is optional;
- PostgreSQL is sufficient as the authoritative modern data store;
- a modular monorepo may simplify delivery, but repository structure is deferred to Architecture;
- Docker Compose and a small local Kubernetes environment can provide enough deployment evidence for the portfolio goal.

Each assumption that affects behavior must be accepted, rejected or converted into an explicit requirement/architecture decision before implementation relies on it.

## 12. Initial success criteria

The MVP is successful when the release candidate can demonstrate, with repository evidence:

1. the three mandatory claim slices end to end;
2. safe coexistence through an explicit legacy port and adapter against a separately labeled simulated legacy service;
3. MCP functionality that reaches Application use cases rather than the database directly;
4. approved Clean Architecture boundaries plus executable implementation-conformance evidence;
5. valid OpenAPI, API QA and API Gate evidence;
6. a responsive React client using real authoritative API operations;
7. durable business/security audit distinct from technical logs;
8. synthetic-only demo data and explicit disclaimer/no-affiliation language;
9. reproducible Docker execution;
10. versioned Kubernetes manifests with local verification evidence;
11. CI evidence tied to the exact candidate SHA;
12. completion of the Blueprint client gates, human acceptance and Release Gate;
13. a portfolio-grade README and a demo path that can be explained in roughly 90 seconds.

## 13. Initial risk register

| ID | Risk | Impact | Initial mitigation |
|---|---|---:|---|
| RISK-001 | Case study could be mistaken for an official FAR product or internal reconstruction | HIGH | Strong disclaimer, synthetic data, explicit OBSERVED/PROPOSED/SIMULATED separation, no copied branding |
| RISK-002 | Scope creep from insurance-domain breadth | HIGH | Three mandatory slices only; secondary features are removable |
| RISK-003 | Clean Architecture degrades into framework/controller-centric code | HIGH | Architecture contract plus executable dependency/conformance tests |
| RISK-004 | MCP becomes a shortcut to PostgreSQL | HIGH | MCP is a Presentation adapter and must invoke Application use cases/ports |
| RISK-005 | Legacy simulator becomes an unnecessary project of its own | MEDIUM | Keep protocol simple and optimize for translation/anti-corruption evidence |
| RISK-006 | Upload/evidence functionality introduces avoidable security exposure | MEDIUM | Synthetic-only files, restricted MIME/size/storage, validation defined before implementation |
| RISK-007 | Kubernetes work consumes time needed for core slices | MEDIUM | Minimal practical manifests and local proof, no platform engineering expansion |
| RISK-008 | NestJS or another framework is adopted before Architecture approves it | MEDIUM | Keep framework as candidate until Architecture decision record |
| RISK-009 | UI invents states or server behavior to move faster | HIGH | Interface/API traceability and API-authoritative behavior |
| RISK-010 | Four-day target pressures the team to skip gates | HIGH | Remove optional functionality before relaxing process |
| RISK-011 | Synthetic data accidentally resembles real PII | MEDIUM | Clearly artificial seed conventions and review before public release |
| RISK-012 | Public repository leaks secrets or environment credentials | HIGH | `.env.example` only, secret scanning discipline, no real credentials committed |

## 14. Traceability seed

These Discovery objectives seed, but do not replace, future requirement IDs.

| Objective ID | Discovery objective | Expected downstream trace |
|---|---|---|
| OBJ-001 | Digital claim intake | Requirements -> interface scope -> API contract -> Slice A -> tests/E2E |
| OBJ-002 | Operator backoffice | Requirements/permissions -> API contract -> Slice B -> audit/tests/E2E |
| OBJ-003 | Customer claim tracking | Requirements -> API contract -> Slice C -> MCP/client tests where applicable |
| OBJ-004 | Safe simulated legacy coexistence | Architecture port/adapter -> contract tests -> integration evidence |
| OBJ-005 | Read-only MCP through Application | Requirements/permissions -> MCP adapter -> use case -> tests/redaction evidence |
| OBJ-006 | Reproducible Docker/Kubernetes delivery | Architecture/operations decisions -> CI/deployment evidence |
| OBJ-007 | Security, correlation and audit separation | NFR/security model -> API/client behavior -> QA/audit evidence |
| OBJ-008 | Portfolio-safe public demonstration | Disclaimer/synthetic-data rules -> README/demo/release evidence |

## 15. Discovery completion state

The Discovery content is complete enough for review, but the Blueprint checks `discovery.product_vision` and `discovery.scope_mvp` require manual verification.

Therefore this phase is **READY_FOR_REVIEW**, not PASS/COMPLETE.

No Target Definition, Requirements, Architecture or implementation work is authorized by this document alone.
