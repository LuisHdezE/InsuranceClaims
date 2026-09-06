# API QA Evidence — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Timezone: America/Montevideo
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Boundary: `api_qa`
Gate: `api_qa_pass`
Status: READY_FOR_REVIEW

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Purpose

This evidence records runtime verification for the five mandatory Blueprint API QA checks:

- `api.qa_positive`
- `api.qa_negative`
- `api.contract_validation`
- `api.security_qa`
- `api.audit_qa`

`api.affected_consumer_revalidation` is not applicable to this initial API baseline because no executable client slice has begun and there is no previously accepted downstream API consumer to revalidate.

No client implementation, Interface Inventory execution, Design System work or API Gate decision is claimed by this document.

## 2. Verified baseline and candidate

Verified base `main` before the API QA branch:

`27617f3be901243a975314b03851d922651949c3`

Technical runtime-QA candidate:

`441930564f8846879f557b7bd2881b75c41bc39b`

Exact-head GitHub Actions runs:

- API QA: `34000730047` = **SUCCESS**
- API Implementation regression: `34000730019` = **SUCCESS**
- OpenAPI Validation regression: `34000730052` = **SUCCESS**
- Postman Contract regression: `34000730070` = **SUCCESS**

The candidate therefore passed the new runtime boundary while preserving all previously accepted implementation and contract checks.

## 3. Runtime topology actually exercised

The API QA workflow uses the production composition rather than the memory runtime:

1. PostgreSQL **18.6** service;
2. the separate Node/TypeScript **SIMULATED LEGACY SYSTEM** over HTTP;
3. the NestJS API through `createProductionRuntimeFromEnv`;
4. Prisma 8 PostgreSQL Infrastructure adapter;
5. Argon2id operator password hashing;
6. short-lived JWT access tokens;
7. private filesystem evidence storage in the ephemeral runner;
8. a synthetic operator seeded through the production Infrastructure store.

Observed runner versions in the successful run:

- Node.js `24.20.0`
- npm `11.19.0`
- PostgreSQL server `18.6`

`qa/bootstrap.sql` exists only to create an ephemeral synthetic QA schema. It does **not** claim that production migration delivery has been completed and does not replace the approved Data Architecture/migration plan.

## 4. Positive API QA

The runtime suite demonstrated successful behavior for the approved REST surface, including:

- `getLiveness`;
- `getReadiness`;
- `verifyPolicyVehicle` through the simulated legacy ACL;
- `createClaim` with multipart PDF evidence;
- idempotent replay of the original `201` response;
- `trackClaim` with customer-safe projection;
- `authenticateOperator` with Argon2id verification and JWT issuance;
- `listClaims`;
- `getClaimDetail`;
- `downloadClaimEvidence` as protected binary content;
- `transitionClaimStatus` from `RECEIVED` to `UNDER_REVIEW`;
- public tracking observing the new status and timeline after the operator transition.

The runtime emitted:

`API_QA_RUNTIME_PASS`

for positive, negative, contract, security and concurrency assertions.

Disposition: `api.qa_positive = PASS`.

## 5. Negative API QA

Negative runtime assertions demonstrated the approved failure contracts for representative high-value cases:

- mismatched public tracking proof -> `404 CLAIM_NOT_FOUND`;
- invalid credentials -> `401 INVALID_CREDENTIALS`;
- protected route without bearer token -> `401 AUTHENTICATION_REQUIRED`;
- malformed/invalid bearer token -> `401 AUTHENTICATION_REQUIRED`;
- invalid pagination -> `422 VALIDATION_ERROR`;
- disallowed evidence MIME -> `422 EVIDENCE_VALIDATION_FAILED`;
- reused idempotency key with a different fingerprint -> `409 IDEMPOTENCY_KEY_REUSED`;
- stale transition -> `409 CLAIM_STATE_CONFLICT`;
- illegal transition -> `409 INVALID_STATE_TRANSITION`;
- transport abuse beyond the verification rate limit -> `429 RATE_LIMITED` with `Retry-After`.

Error assertions also require RFC 9457-compatible `application/problem+json`, stable project `code`, safe `type`, `requestId`, and sanitized detail text without SQL or runner filesystem leakage.

Disposition: `api.qa_negative = PASS`.

## 6. Runtime contract validation

The suite validates behavior against the previously frozen API contract rather than inventing new operations.

Runtime coverage includes all ten approved REST operations across the positive flow, while the existing OpenAPI and Postman regressions independently confirmed exact contract inventory/operation alignment on the same candidate SHA.

Contract invariants verified at runtime include:

- `X-Request-Id` propagation on business requests;
- `Idempotency-Replayed: true` on completed replay;
- no internal claim UUID in the public create response;
- customer tracking redaction of internal identifiers, audit events, description and verified customer label;
- JWT lifetime contract of 900 seconds;
- evidence allowlisted media type and attachment disposition;
- server-authoritative lifecycle transitions;
- stale-state conflict behavior;
- rate-limit `Retry-After` behavior.

`MCP:get_claim_status` remains a separate MCP Presentation contract and is not fabricated as a REST operation.

Disposition: `api.contract_validation = PASS`.

## 7. Security QA

Runtime security assertions covered:

- generic invalid-credential responses without account-validity disclosure;
- protected-route rejection without/with invalid bearer tokens;
- public tracking proof redaction;
- server-side evidence MIME validation;
- private evidence retrieval behind operator authentication/authorization;
- rate limiting on the public verification surface;
- sanitized Problem Details;
- generated synthetic QA secrets rather than committed operator password/JWT secret values;
- idempotency conflict protection;
- atomic stale-state protection for transitions.

### Production dependency advisory classification

The full development dependency installation still reports:

- 5 moderate advisories;
- 8 high advisories;
- 13 total advisories.

Those findings are **not hidden**.

The runtime-specific security classification executes:

`npm audit --omit=dev --json`

Successful candidate result:

- info: 0
- low: 0
- moderate: 0
- high: 0
- critical: 0
- total: **0**

Therefore the current npm audit classification reports no advisory in the production dependency tree. The 13 full-tree advisories remain tooling/development-tree hygiene and must not be misrepresented as “the repository has zero vulnerabilities.”

The workflow would fail `api.security_qa` if a high or critical production advisory were present.

Disposition: `api.security_qa = PASS`.

## 8. Durable audit QA

PostgreSQL assertions independently inspect durable rows after the HTTP runtime flow.

Verified invariants:

- one `CLAIM_CREATED` event for the primary claim;
- completed idempotent replay does not duplicate `CLAIM_CREATED`;
- primary claim has exactly initial history plus one successful transition history row;
- one `CLAIM_STATE_TRANSITIONED` durable audit for the successful transition;
- one `AUTH_LOGIN_SUCCEEDED` durable success event for the successful login request;
- one `AUTH_LOGIN_FAILED` durable failure event for the rejected credentials request;
- concurrent transition race creates only one successful transition history row;
- concurrent transition race creates only one `CLAIM_STATE_TRANSITIONED` audit event;
- successful QA claims have completed idempotency records linked to claims.

The SQL suite emitted:

`API_QA_AUDIT_ASSERTIONS_PASS`

Disposition: `api.audit_qa = PASS`.

## 9. Concurrency evidence

API QA executes two concurrent transition requests against a fresh `RECEIVED` claim, both carrying `expectedFromStatus = RECEIVED`.

Expected and observed invariant:

- exactly one request succeeds with HTTP `200`;
- exactly one request fails with HTTP `409 CLAIM_STATE_CONFLICT`;
- PostgreSQL contains only one transition history row beyond the initial history;
- PostgreSQL contains only one durable transition audit for the race.

This proves the PostgreSQL adapter now enforces the contract as an atomic compare-and-set rather than relying only on an earlier in-memory aggregate read.

## 10. Defects discovered by real runtime QA

The runtime boundary found defects that the earlier memory-backed implementation tests could not expose.

### QA-FINDING-001 — Prisma Temporal runtime initialization

Observed failure:

`ReferenceError: Temporal is not defined`

The Prisma 8 PostgreSQL codec selected for `timestamptz` requires Temporal support. The production runtime now initializes the pinned `temporal-polyfill` before the Prisma PostgreSQL runtime.

### QA-FINDING-002 — Date/Temporal adapter mismatch

After Temporal initialization, Prisma correctly rejected JavaScript `Date` values for the `pg/timestamptz-temporal@1` codec.

Resolution:

- Domain/Application continue to own ordinary JavaScript `Date` values;
- Infrastructure converts `Date -> Temporal.Instant` on PostgreSQL writes;
- Infrastructure converts PostgreSQL Temporal values back to `Date` on reads.

This keeps Prisma/Temporal concerns inside Infrastructure and preserves Clean Architecture dependency direction.

### QA-FINDING-003 — transition compare-and-set

The original PostgreSQL adapter updated a claim by ID after the Application aggregate had checked `expectedFromStatus`. Two concurrent transactions could therefore race after the read.

Resolution:

- Infrastructure update is now filtered by both claim ID and expected source status;
- a no-match update becomes `ClaimStateConflictError`;
- transition history/audit are not written by the losing request.

The concurrent runtime test and durable PostgreSQL assertions now pass.

## 11. Scope integrity

This API QA boundary does not:

- change the approved REST operation inventory;
- create a real insurer integration;
- claim FAR Seguros internal systems, data, workflows or infrastructure;
- start frontend implementation;
- start Interface Inventory execution;
- mark API Gate as passed;
- modify Blueprint Master.

The simulated legacy boundary remains explicitly synthetic.

## 12. Blueprint disposition

Technical evidence supports:

- `api.qa_positive = PASS`
- `api.qa_negative = PASS`
- `api.contract_validation = PASS`
- `api.security_qa = PASS`
- `api.audit_qa = PASS`
- `api.affected_consumer_revalidation = N/A`
- `api_qa = READY_FOR_REVIEW`
- `api_qa_pass = READY_FOR_REVIEW`

The gate must remain `READY_FOR_REVIEW` until Luis Hernández gives the explicit human API QA Pass decision. Gate approval does not authorize merging PR #9; merge authorization remains a separate decision.
