# Architecture Contract — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Status: READY_FOR_REVIEW

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

This document is the architecture contract that later implementation conformance must prove. It defines the TO-BE for this public technical case study only. It does not describe or infer FAR internal architecture, infrastructure, databases, APIs or processes.

---

## 1. Architectural goals

The MVP shall demonstrate that a modern TypeScript application can introduce digital claim intake, claims backoffice, customer tracking and read-only MCP capability while coexisting with a separately runnable **SIMULATED LEGACY SYSTEM**.

Primary qualities:

- explicit Clean Architecture + Ports & Adapters;
- framework-independent Domain and Application layers;
- API-authoritative business/security rules;
- PostgreSQL authoritative for the modern claims workflow;
- simulated legacy isolated behind an anti-corruption adapter;
- MCP as a real Presentation adapter, never a database shortcut;
- durable business/security audit separate from technical logs;
- reproducible Docker and Kubernetes deployment evidence;
- executable architecture fitness assertions during implementation.

---

## 2. Current technology decision baseline

External versions were re-verified on 2026-09-05. Exact patch versions will be locked in the implementation dependency lockfile; architecture freezes the major lines and responsibilities.

| Concern | Approved architecture choice | Boundary |
|---|---|---|
| Runtime | Node.js 24 LTS | runtime/tooling |
| Language | TypeScript 7.x | all modern TS code |
| REST framework | NestJS 12, Express adapter | `apps/api` Presentation/composition only |
| ORM/migrations | Prisma ORM 8 | Infrastructure only |
| Modern database | PostgreSQL 18 | authoritative modern workflow store |
| Web | React + TypeScript + Tailwind | detailed later in Client Architecture |
| MCP | Official MCP TypeScript SDK v2 | `apps/mcp` Presentation adapter |
| MCP transport | Streamable HTTP, stateless for MVP | remote/demo tool access |
| Legacy simulator | small standalone Node/TypeScript HTTP service | deliberately external to modern core |
| Workspace | npm workspaces monorepo | repository/build organization |

Current-source verification references:

- Node releases: https://nodejs.org/en/blog/release
- NestJS migration/current major: https://docs.nestjs.com/migration-guide
- Nest package: https://www.npmjs.com/package/@nestjs/core
- TypeScript: https://www.npmjs.com/package/typescript
- Prisma ORM: https://docs.prisma.io/docs/orm
- PostgreSQL support/versioning: https://www.postgresql.org/support/versioning/
- MCP TypeScript SDK v2: https://ts.sdk.modelcontextprotocol.io/v2/

These sources justify technology currency only. They do not override the approved project requirements.

---

## 3. Repository/runtime topology

Approved monorepo layout at architecture level:

```text
apps/
  api/                 # NestJS REST Presentation + composition root
  web/                 # React client, detailed after API Gate
  mcp/                 # MCP Presentation + composition root
  legacy-simulator/    # SIMULATED LEGACY SYSTEM
packages/
  domain/              # pure TypeScript domain model/rules
  application/         # use cases + ports, depends on domain
  infrastructure/      # Prisma, file storage, legacy HTTP, JWT, audit adapters
  testing/             # test builders/fixtures without production authority
```

This is now an approved architecture boundary, not a claim about any insurer's real topology.

### Dependency direction

```text
REST Presentation (apps/api) ───────┐
                                    ├──> Application ───> Domain
MCP Presentation (apps/mcp) ────────┘

Infrastructure ──implements──> Application ports
Infrastructure may depend on Domain types needed by those contracts.

Legacy Simulator <── HTTP only ── Infrastructure legacy adapter
PostgreSQL       <── Prisma ───── Infrastructure repositories
Private files    <── adapter ──── Infrastructure evidence storage
```

Forbidden dependency directions:

- Domain -> NestJS/Express/Prisma/PostgreSQL/MCP/HTTP/filesystem/legacy simulator;
- Application -> NestJS/Express/Prisma/PostgreSQL/MCP SDK/filesystem/concrete HTTP clients;
- REST controllers -> Prisma/database directly;
- MCP handlers -> Prisma/database directly;
- Web -> database or legacy simulator directly;
- legacy simulator protocol types -> Domain/Application;
- Infrastructure business decisions that contradict Domain rules.

---

## 4. Layer responsibilities

### 4.1 Domain

Owns:

- Claim aggregate state and invariants;
- approved lifecycle states and transition rules;
- tracking-code semantics as opaque identity;
- evidence metadata invariants needed by the aggregate;
- domain errors for invalid transitions/invariants;
- pure value objects and entities.

Does not own:

- HTTP status codes;
- JWTs;
- Prisma models;
- file paths;
- correlation/request headers;
- MCP protocol;
- legacy simulator wire shapes.

### 4.2 Application

Owns use-case orchestration and ports.

Mandatory use cases:

- `VerifyPolicyVehicle`
- `SubmitClaim`
- `TrackClaim`
- `AuthenticateOperator`
- `ListClaims`
- `GetClaimDetail`
- `RetrieveClaimEvidence`
- `TransitionClaimStatus`
- `GetClaimStatusForMcp` (may reuse the same customer-safe query policy as tracking, but remains an explicit Presentation-facing use-case contract)

Mandatory outbound ports:

- `PolicyVerificationPort`
- `ClaimRepository`
- `EvidenceStoragePort`
- `AuditPort`
- `IdempotencyPort`
- `TransactionPort`
- `OperatorRepository`
- `PasswordHasherPort`
- `AccessTokenPort`
- `ClockPort`
- `IdGeneratorPort`

Application enforces orchestration such as server-side policy verification before claim creation, transactional state transition + history + audit intent, and customer-safe tracking projection.

### 4.3 Infrastructure

Owns concrete adapters:

- Prisma/PostgreSQL repositories;
- Prisma transaction implementation;
- local private evidence-file adapter for MVP;
- HTTP anti-corruption adapter to the simulated legacy service;
- JWT access-token implementation;
- password hashing implementation;
- append-oriented audit repository;
- idempotency persistence;
- system clock/UUID/opaque tracking-code implementations;
- structured technical logging sinks/configuration.

### 4.4 Presentation

REST and MCP are entry adapters.

REST Presentation may:

- parse/validate transport input;
- establish auth context;
- invoke Application;
- map Application/domain outcomes to the approved API error contract;
- add request correlation metadata.

REST Presentation may not:

- query Prisma;
- decide legal claim transitions;
- reconstruct business rules in controllers.

MCP Presentation may:

- expose the approved read-only claim-status tool;
- validate tool input;
- invoke `GetClaimStatusForMcp`;
- return customer-safe synthetic output.

MCP Presentation may not:

- query PostgreSQL directly;
- call the simulated legacy system directly;
- expose backoffice/audit data;
- mutate claims.

---

## 5. Domain model

### Claim aggregate root

Core fields/values at domain level:

- `claimId`
- `trackingCode`
- `policyReference`
- `vehicleReference`
- normalized synthetic policy/vehicle snapshot needed for the claim record
- `eventType`
- `occurredAt`
- `locationText`
- `description`
- `status`
- `createdAt`
- `updatedAt`

Lifecycle:

```text
RECEIVED -> UNDER_REVIEW
UNDER_REVIEW -> OBSERVED
UNDER_REVIEW -> APPROVED
OBSERVED -> UNDER_REVIEW
APPROVED -> IN_REPAIR
APPROVED -> CLOSED
IN_REPAIR -> CLOSED
```

`CLOSED` is terminal for the MVP.

### ClaimStatusHistory

Append-only domain history entry owned by the Claim workflow:

- history identifier;
- claim identifier;
- from status (nullable for initial creation);
- to status;
- occurred timestamp;
- actor reference when applicable.

### Evidence metadata

The claim references metadata, not raw file bytes:

- evidence identifier;
- claim identifier;
- media type;
- size;
- server-generated storage key;
- sanitized display filename when retained;
- created timestamp.

Evidence remains immutable after confirmed customer submission in the MVP.

### Operator

Minimal authenticated backoffice identity:

- operator identifier;
- login name/email-like synthetic identifier;
- password hash outside Domain business behavior;
- role = `CLAIMS_OPERATOR`;
- active flag.

Fine-grained multi-role authorization is explicitly deferred.

---

## 6. Legacy coexistence and anti-corruption boundary

The legacy simulator is a **SIMULATED LEGACY SYSTEM**, not a model of FAR internals.

Approved protocol characteristic for the demo:

- separate HTTP process/service;
- synthetic policy/vehicle records owned by the simulator;
- deliberately external DTO using simulator-specific snake_case fields and `Y/N` style flags;
- modern Application sees only normalized `PolicyVerificationPort` results;
- only the Infrastructure legacy adapter knows the simulator URL and wire contract.

Example conceptual translation:

```text
Simulator DTO
{ policy_no, vehicle_ref, active_flag, holder_label }

        ↓ Infrastructure anti-corruption adapter

Application contract
{ policyReference, vehicleReference, isEligible, customerLabel }
```

Exact endpoint path/payload belongs to the simulator implementation and may be documented there, but it cannot leak into Domain/Application types.

Failure policy:

- timeout/unavailable simulator -> safe dependency-unavailable Application outcome;
- invalid pair -> validation failure, no claim created;
- malformed simulator payload -> integration failure, no silent acceptance;
- no client-side fallback that assumes policy validity.

---

## 7. MCP architecture

The MCP server is a separate modern process under `apps/mcp`, sharing the approved Domain/Application packages and Infrastructure adapters through a composition root.

Mandatory tool capability:

`get_claim_status`

Input intent:

- tracking code;
- associated synthetic policy reference.

Output intent:

- customer-safe claim summary;
- current public status;
- public timeline;
- synthetic next steps.

MCP transport is stateless Streamable HTTP for the MVP. The implementation must validate allowed Origin behavior according to the active MCP specification/SDK guidance and apply abuse controls appropriate to a public/demo endpoint.

The MCP process may independently compose the same Application use case and PostgreSQL repository adapter. This is not a bypass because the handler still enters through Application. Direct Prisma imports from MCP Presentation are forbidden.

---

## 8. Authentication strategy

Backoffice REST authentication uses short-lived bearer JWT access tokens for the MVP.

Architecture policy:

- no refresh-token flow in the mandatory MVP;
- short access-token lifetime, target 15 minutes;
- signing key supplied by environment/secret, never committed;
- token contains only minimal synthetic operator identity/role claims;
- server revalidates authorization at the API/Application boundary;
- password hashes use a modern password-hashing adapter (Argon2id preferred at implementation unless compatibility evidence forces a reviewed alternative);
- login attempts are rate limited;
- logout is client-side token disposal because no refresh/session store is introduced for the MVP.

This intentionally reduces authentication surface while still demonstrating real authentication and API authorization.

Public customer tracking and MCP status lookup do not use operator JWT. They rely on the approved tracking-code + synthetic-policy-reference proof pair and must avoid existence leakage.

---

## 9. API error strategy

REST errors use RFC 9457 Problem Details with media type `application/problem+json`.

Base fields:

- `type`
- `title`
- `status`
- `detail`
- `instance`

Approved project extensions:

- `code` stable application error code;
- `requestId` correlation identifier;
- `errors` optional field-validation collection.

No stack traces, SQL details, tokens, raw legacy payloads or filesystem paths may appear in public errors.

The detailed status/error matrix is frozen later in API Contract Design.

---

## 10. API versioning policy

REST uses URL major versioning:

`/api/v1/...`

Policy:

- additive compatible changes remain within v1;
- breaking representation/semantic changes require a reviewed new major or explicit migration decision;
- OpenAPI `operationId` becomes the stable downstream linkage after API Contract Ready;
- auth/error/versioning changes are cross-cutting and may trigger broad Blueprint revalidation after the API baseline exists.

MCP capability names are version-stable within the release; protocol compatibility is delegated to the official SDK's active v2 line and documented transport behavior.

---

## 11. Transaction boundaries

Required atomic boundaries:

### Submit claim

Within the modern authoritative store:

1. verify policy/vehicle through legacy port before mutation;
2. consume/reserve idempotency identity;
3. persist claim;
4. persist initial status history;
5. persist evidence metadata after storage succeeds according to implementation ordering;
6. persist durable `CLAIM_CREATED` audit event.

Raw file storage cannot be made part of a PostgreSQL transaction. Implementation must use compensation/cleanup so failed DB commit does not leave accepted orphan evidence.

### Transition claim state

One transaction must persist:

- new claim state;
- appended status history;
- durable state-transition audit event.

If any of these fail, the state transition is not committed.

---

## 12. Architecture conformance contract

Implementation must include executable fitness assertions proving at minimum:

1. `packages/domain` imports no NestJS, Prisma, MCP SDK, HTTP adapter, filesystem adapter or Infrastructure package.
2. `packages/application` imports no NestJS, Prisma, MCP SDK, Express, filesystem or concrete Infrastructure adapter.
3. Infrastructure implements declared Application ports rather than redefining use-case contracts.
4. REST controllers/guards/pipes contain no Prisma client access.
5. MCP handlers contain no Prisma client access and depend on Application use-case contracts.
6. legacy simulator client/protocol DTOs exist only in Infrastructure/legacy-simulator boundaries.
7. web source cannot import server persistence/internal packages.
8. Domain owns lifecycle transition legality.
9. composition-root tests verify critical port-to-adapter bindings.

Preferred implementation mechanisms:

- dependency-cruiser or equivalent import-boundary rules;
- focused architecture tests;
- TypeScript workspace/package boundaries;
- DI/composition tests.

Passing API runtime tests alone cannot satisfy this contract.

---

## 13. Deployment topology intent

Docker Compose mandatory services:

- `postgres`
- `legacy-simulator`
- `api`
- `mcp`
- `web`

Private evidence storage uses a named/mounted volume for local demo execution.

Kubernetes proof shall model at minimum:

- namespace;
- API Deployment/Service;
- MCP Deployment/Service;
- legacy simulator Deployment/Service;
- web Deployment/Service;
- PostgreSQL deployment/stateful proof suitable for local demo only;
- configuration/secrets strategy;
- readiness/liveness probes;
- resource requests/limits.

This is portfolio/local validation, not a claim of production insurance infrastructure.

---

## 14. Architecture decisions (ADR summary)

### ADR-001 — Clean Architecture + Ports & Adapters

Decision: REQUIRED.

Reason: it is an explicit consumer constraint and demonstrates safe modernization boundaries.

### ADR-002 — npm-workspaces monorepo

Decision: APPROVED.

Reason: shared Domain/Application contracts are needed by REST and MCP while preserving independent Presentation adapters and a separately runnable simulator.

### ADR-003 — NestJS 12 at the outer REST boundary

Decision: APPROVED.

Reason: strong TypeScript/Node portfolio fit, DI/composition support and clear adapter boundary. NestJS does not enter Domain/Application.

### ADR-004 — Prisma 8 + PostgreSQL 18 in Infrastructure

Decision: APPROVED.

Reason: current TypeScript ORM/migration tooling and a current supported PostgreSQL major. Prisma generated/runtime types remain Infrastructure concerns.

### ADR-005 — Separate MCP process using shared Application

Decision: APPROVED.

Reason: proves MCP is a true entry adapter and prevents direct database tooling shortcuts.

### ADR-006 — Separate HTTP legacy simulator + anti-corruption adapter

Decision: APPROVED.

Reason: demonstrates coexistence/translation without pretending access to a real insurer core.

### ADR-007 — JWT access token only for first release

Decision: APPROVED.

Reason: real operator authentication with smaller scope than refresh/session infrastructure.

### ADR-008 — RFC 9457 Problem Details

Decision: APPROVED.

Reason: standardized machine-readable errors before API contract details are frozen.

### ADR-009 — URL major versioning

Decision: APPROVED.

Reason: explicit and easy-to-demonstrate v1 contract boundary.

### ADR-010 — Local private filesystem evidence adapter for MVP

Decision: APPROVED.

Reason: meets non-public storage behavior without adding cloud object-storage scope. Storage remains a port so it can be replaced later.

---

## 15. Deferred architecture choices

Not required for Release 1:

- Redis;
- Kafka/RabbitMQ;
- event sourcing/CQRS infrastructure;
- microservice decomposition beyond the simulator/MCP process boundaries already justified;
- cloud object storage;
- refresh tokens;
- external identity provider/Active Directory;
- production ingress/service mesh;
- real insurer connectivity;
- productive email/WhatsApp notifications.

---

## 16. Traceability

| Architecture area | Requirements |
|---|---|
| Domain/transition model | FR-005, FR-012, FR-013, BR-001..BR-006 |
| Legacy port/adapter | FR-001, FR-002, FR-015, BR-008, AC-013 |
| Evidence storage port | FR-004, BR-010, NFR-005 |
| Customer-safe query | FR-007, FR-008, FR-014, BR-007, BR-011 |
| Operator auth | FR-009, NFR-002, NFR-014 |
| Audit/log separation | FR-013, FR-017, FR-018, NFR-006, NFR-007, AC-014 |
| Architecture fitness | NFR-001, NFR-015, AC-012, AC-013 |
| Docker/Kubernetes | NFR-008..NFR-010, AC-016, AC-017 |

---

## 17. Architecture readiness

This artifact provides evidence for:

- `architecture.domain_model`
- `architecture.decision_records`
- `api.auth_strategy`
- `api.error_contract`
- `api.versioning_policy`

Security, threat modeling, data/migrations and audit obligations are documented in companion architecture-phase artifacts.

The architecture package may reach `READY_FOR_REVIEW`, but `architecture_ready` must not become `PASS` without explicit human approval.