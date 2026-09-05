# Target Definition — Insurance Claims Legacy Modernization

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD
Status: COMPLETE

## 1. Target outcome

Deliver a public, reproducible MVP that demonstrates incremental modernization of insurance-claims workflows through a maintainable modern application boundary that coexists with a separately labeled **SIMULATED LEGACY SYSTEM**.

The target is a portfolio case study. It is not an official FAR product, does not reproduce FAR internals, and uses only synthetic policy, claim, user, workshop, evidence and operational data.

## 2. Delivery model

The target remains **GREENFIELD with simulated legacy coexistence**.

The project does not become Brownfield because no source code, database, API contract, infrastructure, network, directory service or internal operating process from FAR is available for inspection.

The modern solution therefore proves coexistence patterns against an intentionally simulated external dependency rather than claiming migration from a real FAR system.

## 3. Mandatory product slices

### Slice A — Digital claim intake

A demo customer must be able to validate a synthetic policy/vehicle reference against the simulated legacy boundary, register a claim, attach restricted synthetic evidence, submit it and receive an opaque tracking reference plus next-step information.

### Slice B — Claims backoffice

A demo claims operator must authenticate, list and inspect claims, review submitted evidence and execute only explicitly allowed claim-state transitions. Meaningful administrative/state-changing actions must produce durable audit evidence.

### Slice C — Claim tracking

A demo customer must be able to retrieve a submitted claim through the approved tracking mechanism and view the current customer-visible status, public timeline and next-step information.

## 4. Mandatory technical proof

The release candidate must demonstrate all of the following without expanding into a full insurance platform:

- Node.js + TypeScript backend runtime;
- React + TypeScript + Tailwind web client;
- PostgreSQL for the modern application's authoritative persisted claim data;
- versioned REST API with OpenAPI contract before implementation;
- real TypeScript MCP server/adaptor using current MCP contracts at implementation time;
- at least one read-only MCP claim-status capability routed through Application use cases;
- a separate simulated legacy service and anti-corruption adapter;
- Docker/Docker Compose reproducibility;
- Kubernetes manifests with local validation;
- Linux-oriented operation documentation;
- structured technical logs and request/correlation IDs;
- durable business/security audit separate from technical logs;
- architecture implementation conformance evidence;
- exact-candidate-SHA CI evidence with human decisions kept separate.

## 5. Logical system boundaries

These are target responsibilities, not a final folder or deployment topology.

### Web client

Provides customer and operator user interfaces. It consumes only approved server contracts and does not own authoritative business rules, authorization or persistence.

### Modern application/API boundary

Owns the claim workflows, authorization decisions, business rules, orchestration and public/admin API behavior. Presentation adapters must enter through Application use cases.

### MCP presentation adapter

Exposes portfolio-safe, read-only capabilities. It calls the same Application layer used by other adapters and may not query PostgreSQL or the legacy simulator directly.

### Legacy integration boundary

Application depends on a port representing the policy/vehicle capability required by the MVP. Infrastructure implements that port through an anti-corruption adapter against the separate simulated legacy service.

### Modern persistence boundary

Persists modern claims, claim status history, evidence metadata/references and durable audit records through Infrastructure adapters implementing internal ports. Exact schema and migration design belong to Architecture/Data.

### Delivery/runtime boundary

Provides Docker Compose and Kubernetes evidence sufficient to reproduce and validate the MVP without turning infrastructure into a separate platform project.

## 6. Required architecture invariant

This consumer requires **Clean Architecture + Ports & Adapters**.

Conceptual direction:

```text
Domain <- Application <- Presentation adapters
             ^
             |
       Infrastructure adapters
```

The notation above expresses dependency direction, not runtime call direction.

Required invariants:

- Domain does not depend on Node frameworks, HTTP, PostgreSQL, ORM libraries, React, MCP SDKs, Docker/Kubernetes or legacy details.
- Application defines use cases and ports and does not access DB, HTTP, filesystem, MCP SDK or legacy protocols directly.
- Infrastructure implements internal ports.
- REST and MCP are input adapters and invoke Application use cases.
- the legacy adapter implements an Application/internal port.
- React never accesses persistence directly and never invents authoritative permissions, states, transitions or endpoints.
- executable architecture fitness/conformance tests are required where feasible.

These invariants are mandatory target constraints. Frameworks and concrete implementation libraries remain Architecture decisions.

## 7. Security and data posture

The target release must:

- use synthetic-only data;
- contain no real customer PII or operational secrets;
- keep `.env.example` credential-free;
- provide real operator authentication/authorization in the demo;
- enforce permissions at the API/application boundary;
- prevent public tracking from exposing internal audit/security information;
- restrict evidence uploads;
- redact secrets/sensitive synthetic fields from technical logs;
- keep durable audit evidence separate from operational logs;
- keep MCP read-only and portfolio-safe.

Exact authentication mechanism, credential lifecycle, rate limits, storage driver and retention values are deferred to Architecture/Security where the approved requirements will constrain them.

## 8. Explicit scope decisions

To protect the four-day MVP objective, the following candidates are **DEFERRED from the mandatory release scope** unless later activated without affecting gates:

- internal operator notes;
- workshop directory;
- workshop MCP lookup;
- maps/geocoding;
- email notification delivery beyond simple local simulation.

The following remain out of scope as approved in Discovery:

- payments/indemnities;
- quoting/pricing;
- policy issuance;
- native mobile apps;
- public chatbot;
- AI damage assessment;
- real FAR integrations;
- WhatsApp production integration;
- biometrics;
- real document processing;
- BCU/accounting/Active Directory integrations;
- real on-premise infrastructure;
- multi-tenancy;
- unnecessary brokers/event sourcing/microservices.

## 9. Decisions intentionally deferred to Architecture

Target Definition does **not** decide:

- NestJS versus another Node framework;
- ORM/query library;
- exact repository/folder layout;
- exact authentication token/session mechanism;
- exact upload storage technology;
- Docker image topology;
- Kubernetes packaging style;
- detailed PostgreSQL schema;
- concrete legacy simulator transport;
- error-envelope/Problem Details details;
- final API endpoints or operationIds.

Those decisions require approved Requirements first.

## 10. Target acceptance statement

Target Definition is complete when Requirements can be written without changing the approved Discovery boundary and without pretending that unresolved architecture/API details are already authoritative.

This document satisfies that condition and therefore hands the project to Requirements & Domain.
