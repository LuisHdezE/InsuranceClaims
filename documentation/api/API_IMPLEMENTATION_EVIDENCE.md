# API Implementation Evidence — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Boundary: `api_implementation`
Gate target: `api_implemented`
Status: READY_FOR_REVIEW candidate evidence

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

This document records implementation evidence for the five checks required by Blueprint 0.5.2 `api_implemented`. It does not replace OpenAPI Validation, Postman Operational Contract, API QA, Security QA or the later API Gate.

## 1. Approved contract implemented

The implementation preserves the approved API Contract revision `api-v1-r1` and exposes the eight frozen business operations:

| operationId | Method | Path | Presentation implementation |
|---|---|---|---|
| `verifyPolicyVehicle` | POST | `/api/v1/public/policy-verifications` | `PublicClaimsController.verify` |
| `createClaim` | POST | `/api/v1/public/claims` | `PublicClaimsController.createClaim` |
| `trackClaim` | POST | `/api/v1/public/claim-tracking` | `PublicClaimsController.track` |
| `authenticateOperator` | POST | `/api/v1/operator/auth/login` | `OperatorAuthController.login` |
| `listClaims` | GET | `/api/v1/operator/claims` | `OperatorClaimsController.list` |
| `getClaimDetail` | GET | `/api/v1/operator/claims/:claimId` | `OperatorClaimsController.detail` |
| `downloadClaimEvidence` | GET | `/api/v1/operator/claims/:claimId/evidence/:evidenceId` | `OperatorClaimsController.evidence` |
| `transitionClaimStatus` | POST | `/api/v1/operator/claims/:claimId/transitions` | `OperatorClaimsController.transition` |

Operational routes are also implemented:

- `GET /health/live`
- `GET /health/ready`

The separate Presentation adapter `apps/mcp/src/main.ts` implements the approved read-only MCP tool `get_claim_status` and delegates to `ClaimsApplication.getClaimStatusForMcp`. It does not access PostgreSQL or the simulated legacy service directly.

The separate runnable `apps/legacy-simulator` remains explicitly a **SIMULATED LEGACY SYSTEM**. The modern application reaches it only through the Infrastructure anti-corruption adapter implementing `PolicyVerificationPort`.

## 2. `api.endpoints_implemented`

Status: PASS evidence candidate.

Primary evidence:

- `apps/api/src/controllers.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/main.ts`
- `apps/api/src/transport.ts`
- `packages/application/src/index.ts`
- `packages/infrastructure/src/runtime.ts`
- `packages/infrastructure/src/prisma-store.ts`
- `packages/infrastructure/src/adapters.ts`
- `apps/legacy-simulator/src/main.ts`
- `apps/mcp/src/main.ts`

Implementation details include:

- bounded Zod transport validation;
- RFC 9457 Problem Details mapping;
- `X-Request-Id` correlation;
- contract rate limits;
- multipart evidence limits and MIME validation;
- private evidence storage abstraction;
- public tracking redaction/proof semantics;
- server-generated opaque tracking code;
- `Idempotency-Key` hashing/fingerprinting/replay/conflict behavior;
- `expectedFromStatus` stale-state guard;
- liveness/readiness routes;
- separate MCP and legacy simulator processes.

OpenAPI is deliberately not generated here because Blueprint places that in the next `openapi_validation` boundary.

## 3. `api.auth_authorization`

Status: PASS evidence candidate.

Authentication implementation:

- `Argon2PasswordHasher` implements the approved Argon2id password adapter;
- `JwtAccessTokenAdapter` issues/verifies the approved short-lived access token;
- `JwtAuthGuard` authenticates protected HTTP calls;
- login responses have no refresh token and no server logout capability.

Authorization remains authoritative in Application:

- `requirePermission(...)` rejects unauthenticated callers and missing permissions;
- `listClaims`, `getClaimDetail` and evidence retrieval require `claims.backoffice.read`;
- state transitions require `claims.backoffice.transition`;
- role-to-permission mapping is created server-side;
- Presentation visibility is never treated as authorization.

The MCP status projection reuses the customer-safe tracking use case and cannot obtain operator-only detail through a separate data path.

## 4. `api.audit_logging`

Status: PASS evidence candidate.

Durable audit and technical logging are separate ports.

Implemented durable events:

- `AUTH_LOGIN_SUCCEEDED`
- `AUTH_LOGIN_FAILED`
- `CLAIM_CREATED`
- `CLAIM_STATE_TRANSITIONED`

Critical invariants implemented:

- successful login does not issue a JWT unless `AUTH_LOGIN_SUCCEEDED` persists;
- failed credentials remain denied even if failure-audit persistence fails;
- Claim creation persists Claim + initial history + `CLAIM_CREATED` + idempotency completion through one `TransactionPort` boundary;
- state transition persists Claim state + history + `CLAIM_STATE_TRANSITIONED` through one `TransactionPort` boundary;
- request correlation is propagated into applicable audit records;
- transport error responses never expose stack traces, raw DB errors, JWTs, secrets or storage paths.

The Prisma Infrastructure implementation creates a transaction-scoped `PrismaWorkflowStore` so Application transaction orchestration does not depend on Prisma.

## 5. `api.backend_tests`

Status: PASS evidence candidate.

Test files:

- `tests/domain/claim.test.ts`
- `tests/application/application.test.ts`
- `tests/api/api.test.ts`

Current suite contains six executable tests covering:

1. approved Domain transition matrix;
2. stale expected-state rejection;
3. idempotent Claim submission and customer-safe tracking;
4. operator authentication plus durable audit/history on transitions;
5. REST intake, idempotency replay, tracking, authentication and transition flow;
6. generic invalid tracking proof plus protection of operator routes.

Reproducible CI candidate `b76672777691d5cfad7850c6399e5f582301bc7d`, run `33995297244`, passed:

- locked dependency installation with `npm ci`;
- Prisma 8 contract emit;
- TypeScript 7 typecheck;
- all backend tests;
- executable architecture conformance;
- build.

Any later metadata/evidence commit or history compaction must receive a fresh exact-head CI PASS before this boundary is presented for human gate approval.

## 6. `api.architecture_implementation_conformance`

Status: PASS evidence candidate.

Executable assertion:

`scripts/architecture-check.mjs`

It rejects, among other violations:

- NestJS, Prisma, MCP SDK, Infrastructure, filesystem/HTTP, Argon2 or JOSE imports from Domain;
- those same framework/adapter dependencies from Application;
- Prisma/Infrastructure imports from REST Presentation controllers/guards/transport;
- Prisma imports from MCP Presentation;
- simulated legacy wire fields leaking outside Infrastructure/simulator;
- lifecycle transition legality disappearing from Domain.

The implementation dependency direction remains:

`Presentation -> Application -> Domain`

and

`Infrastructure -> Application ports + Domain types`

Composition root wiring may know concrete adapters, but business rules do not.

Detailed conformance evidence is also recorded in `documentation/architecture/ARCHITECTURE_IMPLEMENTATION_CONFORMANCE.md`.

## 7. Reproducibility

The implementation now versions `package-lock.json` (`lockfileVersion: 3`). Final CI uses:

- Node.js 24;
- `actions/checkout@v7` on the exact pull-request head SHA;
- `actions/setup-node@v7`;
- `npm ci`;
- cache keyed by `package-lock.json`;
- read-only repository permissions.

The temporary workflow permission used solely to materialize the lockfile was removed before the review candidate.

## 8. Explicitly deferred to later Blueprint boundaries

The following are intentionally **not** claimed by API Implemented:

- OpenAPI generation/validation;
- Postman collection/environment/coverage;
- full API positive/negative QA matrix;
- contract-to-OpenAPI validation;
- Security QA and dependency-advisory adjudication;
- Audit QA against the full operational contract;
- API Gate;
- client/interface execution.

During dependency installation npm reported an aggregate provisional tree warning of 13 advisories (`5 moderate`, `8 high`). This implementation boundary does not silently classify or waive them. Exact advisory/runtime relevance must be adjudicated in Security QA using the committed lockfile; any applicable unresolved high-risk runtime issue must block `api_qa_pass` rather than being hidden by this implementation gate.

## 9. Gate interpretation

This evidence supports moving the five implementation checks to PASS and the `api_implemented` gate to `READY_FOR_REVIEW` only.

It does **not** constitute human approval. `api_implemented = PASS` requires the explicit human gate decision after review of the final exact-head CI evidence.