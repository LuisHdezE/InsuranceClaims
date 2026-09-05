# Architecture Implementation Conformance

Date: 2026-09-05
Blueprint: 0.5.2
Boundary: API Implementation
Status: READY_FOR_REVIEW candidate evidence

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## Approved architecture invariant

The approved architecture requires Clean Architecture + Ports & Adapters across REST, MCP and simulated legacy integration.

Required dependency direction:

- Domain is framework and adapter independent.
- Application owns use cases and ports.
- Infrastructure implements Application ports.
- REST and MCP are Presentation adapters entering through Application.
- Domain owns Claim lifecycle legality.
- MCP cannot bypass Application.
- the simulated legacy wire contract cannot leak into Domain/Application.

## Implemented package boundaries

### Domain

`packages/domain`

Contains the Claim aggregate, lifecycle status model, allowed-transition matrix and stale-state/illegal-transition domain errors.

It has no NestJS, Prisma, MCP, filesystem, HTTP, JWT or password-hashing dependency.

### Application

`packages/application`

Contains:

- use cases;
- permission enforcement;
- public-safe projections;
- transaction orchestration;
- idempotency orchestration;
- audit orchestration;
- ports for persistence, evidence storage, policy verification, JWT, hashing, clock, IDs, logging and transactions.

Application imports Domain but no concrete Infrastructure adapter or Presentation framework.

### Infrastructure

`packages/infrastructure`

Implements the approved ports for:

- Prisma/PostgreSQL persistence;
- transaction boundary;
- private evidence storage;
- Argon2id hashing;
- JWT access token handling;
- simulated legacy HTTP anti-corruption adapter;
- cryptographic hashing/ID generation;
- in-memory test adapters.

Infrastructure depends inward on Application contracts and Domain types.

### Presentation

REST:

`apps/api`

MCP:

`apps/mcp`

REST controllers call Application only. They do not import Prisma or the concrete Infrastructure package. MCP calls Application only and has no Prisma access.

Composition wiring is isolated in the application bootstrap/composition boundary.

### Simulated legacy system

`apps/legacy-simulator`

This is a separate runnable service explicitly labeled **SIMULATED LEGACY SYSTEM**. Its wire vocabulary is translated by the Infrastructure adapter before values reach Application.

No claim is made that its fields, service shape or behavior represent FAR Seguros internal systems.

## Executable conformance assertion

Script:

`scripts/architecture-check.mjs`

The script scans source imports and fails CI when it detects forbidden dependency direction or known legacy-wire leakage.

Current enforced rules include:

1. Domain cannot import NestJS, Prisma, MCP SDK, Infrastructure, filesystem/HTTP, Express, Argon2 or JOSE.
2. Application cannot import those framework/adapter dependencies.
3. REST Presentation cannot import Prisma or the concrete Infrastructure package.
4. MCP Presentation cannot import Prisma.
5. simulated legacy wire fields cannot leak outside Infrastructure/simulator.
6. Domain must visibly retain lifecycle transition ownership.

CI command:

`npm run architecture:check`

The reproducible implementation run `33995297244` on candidate `b76672777691d5cfad7850c6399e5f582301bc7d` passed this assertion together with typecheck, tests and build.

A fresh exact-head run is required after the final review tree is assembled.

## Manual conformance review

In addition to the executable import rules, the implementation was reviewed for responsibility placement:

- REST validation/rate-limit/Problem Details concerns remain Presentation concerns.
- authorization is rechecked in Application rather than trusted to UI or route visibility.
- Claim transition legality is delegated to Domain.
- Claim creation and state transition compose persistence + audit through `TransactionPort`.
- Prisma transaction implementation remains Infrastructure-only.
- public tracking projection omits internal Claim UUID, audit metadata and actor identifiers.
- evidence storage paths/keys do not appear in public API responses.
- MCP reuses the customer-safe Application tracking flow.

## Limit of this evidence

This conformance artifact proves implementation structure and dependency direction. It does not claim:

- OpenAPI correctness;
- live PostgreSQL integration QA;
- full security penetration/abuse QA;
- Postman operational coverage;
- release readiness.

Those remain downstream Blueprint boundaries.