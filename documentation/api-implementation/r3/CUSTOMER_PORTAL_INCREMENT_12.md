# API Implementation R3 — Increment 12: Customer Portal + Post-Submission Evidence

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with simulated legacy coexistence  
**Baseline `main`:** `72869ba2df096f2f5b27918573af809d499ec64e`  
**Contract revision:** `api-v1-r3`  
**Requirements:** FR-039, FR-040, FR-041  
**Use case:** UC-R3-008  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-09

> Caso técnico no oficial · No oficial · Sin afiliación. All customer accounts, policies, claims, communications, insurer references, evidence files and credentials used by this increment are synthetic/demo data.

## 1. Frozen scope implemented

This increment implements the next server slice frozen by `API_FUNCTIONAL_COVERAGE_GAP_R3.md`, `INSURANCE_OPERATIONS_REQUIREMENTS_R3.md`, `API_CONTRACT_R3.md` and `API_ENDPOINT_INVENTORY_R3.json`: a separate authenticated Customer Portal with own-resource self-service and governed post-submission evidence.

The seven frozen `customer-portal` operations are implemented without changing their operation identity or route family:

| operationId | method/path | authentication / permission | success |
|---|---|---|---|
| `authenticateCustomer` | `POST /api/v1/portal/auth/login` | anonymous credentials | 200 |
| `getPortalSelf` | `GET /api/v1/portal/me` | customer JWT / `portal.self.read` | 200 |
| `listPortalPolicies` | `GET /api/v1/portal/policies` | customer JWT / `portal.self.read` | 200 |
| `listPortalClaims` | `GET /api/v1/portal/claims` | customer JWT / `portal.self.read` | 200 |
| `getPortalClaimDetail` | `GET /api/v1/portal/claims/{claimId}` | customer JWT / `portal.self.read` | 200 |
| `uploadPortalClaimEvidence` | `POST /api/v1/portal/claims/{claimId}/evidence` | customer JWT / `portal.self.evidence.create` | 201 |
| `listPortalCommunications` | `GET /api/v1/portal/communications` | customer JWT / `portal.self.read` | 200 |

No staff permission is reused to authorize the portal.

## 2. Separate customer identity and authentication context

R3 requires Customer Portal authentication to remain distinct from staff identity. The implementation therefore introduces a separate `CustomerAccount` authority and separate customer JWT adapter.

### Customer account

`CustomerAccount` contains only the synthetic portal identity required by the frozen Data Architecture:

- account ID;
- owning Customer ID;
- normalized unique login;
- Argon2id-compatible password hash;
- active flag;
- optimistic version;
- created/updated timestamps.

Staff `Operator` accounts and customer accounts remain physically and logically separate.

### Customer JWT

Customer access tokens use:

- dedicated signing secret `CUSTOMER_JWT_SECRET`;
- dedicated issuer (default `insurance-claims-customer`);
- dedicated audience (default `insurance-claims-customer-api`);
- context claim `customer`;
- 1800-second lifetime;
- subject = CustomerAccount ID;
- Customer ID as a minimized authorization-context claim;
- no refresh token and no logout endpoint.

The production runtime fails closed when the customer signing secret is absent. It never falls back to the staff JWT secret.

### Context separation

Both HTTP guards explicitly recognize the opposite valid token context:

- a valid staff JWT on `/api/v1/portal/*` returns `401 AUTHENTICATION_CONTEXT_MISMATCH`;
- a valid customer JWT on staff-protected routes returns the same stable code;
- an invalid/unknown bearer token remains `401 AUTHENTICATION_REQUIRED`.

The portal therefore cannot inherit staff role grants and staff identities cannot silently cross into customer self-service.

## 3. Ownership and IDOR policy

Portal ownership is derived server-side from the authenticated chain:

```text
Customer JWT subject
    -> CustomerAccount
    -> Customer
    -> owned Policy / Claim / Communication
```

The client never supplies an authoritative `customerId`.

Application and PostgreSQL mutation paths re-check ownership against persisted Claim `customer_id`. A valid customer asking for another customer's Claim receives the frozen ownership-safe response:

`404 RESOURCE_NOT_FOUND`

The implementation deliberately does not distinguish “exists but belongs to another customer” from “does not exist”.

## 4. Portal self-service projections

### `/portal/me`

Returns the authenticated synthetic Customer projection only.

### `/portal/policies`

Lists only policies belonging to the authenticated Customer with deterministic pagination.

### `/portal/claims`

Lists only claims linked to the authenticated Customer.

### Claim detail

The portal Claim detail is a customer-safe projection assembled from persisted Claim/history/evidence facts plus eligible active synthetic Guidance when its approved insurer context matches the owned Policy.

Internal staff audit is never exposed.

`outstandingActions` is intentionally returned as an empty collection in Increment 12. R3 requires an outstanding action/evidence context “when required” but does not freeze a customer-safe rule that maps internal `ClaimTask` objects into customer-facing obligations. This increment therefore does not invent that business semantic or leak staff task internals.

### Communications

Portal Communication history is filtered by persisted `customer_id` and projects only the approved customer-safe delivery history. Provider credentials, raw provider responses and internal retry mechanics are not exposed.

## 5. Post-submission evidence

`uploadPortalClaimEvidence` follows the existing historical evidence safety envelope while adding R3 ownership and idempotency.

### Validation

- own Claim required before mutation;
- `Idempotency-Key` required, 16–128 characters, 24-hour logical retention;
- 1–5 files per request;
- maximum 5 MiB per file;
- allowlisted media types only: `image/jpeg`, `image/png`, `application/pdf`;
- file signature/magic-byte validation supplements caller-supplied MIME;
- safe generated storage references;
- private evidence storage;
- append-only Claim evidence metadata.

The request fingerprint uses the authenticated Customer, Claim, media type, size and content hash. Client filename is deliberately excluded from logical identity, so retrying the same bytes under a renamed local filename replays the original response rather than creating duplicate evidence.

Same key + different logical content returns `409 IDEMPOTENCY_KEY_REUSED`.

### Atomicity and compensation

Evidence bytes are staged privately before the authoritative DB commit. The metadata mutation, durable audit and idempotency completion are committed atomically. If the authoritative commit fails, staged storage is cleaned up and retryable idempotency state is preserved according to the existing application contract.

The PostgreSQL transaction revalidates Claim ownership to prevent a time-of-check/time-of-use authorization gap.

## 6. Audit

The exact frozen Customer Portal event codes are used:

- `CUSTOMER_AUTH_LOGIN_SUCCEEDED`;
- `CUSTOMER_AUTH_LOGIN_FAILED`;
- `CUSTOMER_EVIDENCE_ADDED`.

### Login success

- actor: `CUSTOMER_ACCOUNT`;
- actor ID: CustomerAccount ID;
- target: customer account reference;
- metadata contains only the authentication mechanism classification;
- access token is never copied into audit.

### Login failure

- actor: `ANONYMOUS`;
- no account enumeration through audit response behavior;
- metadata may contain a one-way normalized-login hash for diagnostics;
- no password, password hash or token is stored.

### Evidence addition

- actor: `CUSTOMER_ACCOUNT`;
- target: owned Claim;
- metadata contains evidence IDs/count and bounded media type/size facts only;
- raw bytes, storage key/path and raw client filename are prohibited.

PostgreSQL QA asserts these restrictions directly against `audit_events`.

## 7. Architecture

### Application

`packages/application/src/customer-portal.ts` owns:

- customer authentication orchestration;
- context-specific authorization;
- ownership/IDOR policy;
- customer-safe projections;
- evidence safety and idempotency;
- audit intent;
- storage compensation orchestration.

It imports no NestJS, Prisma, JWT library, filesystem or Infrastructure adapter.

### Infrastructure

- `packages/infrastructure/src/customer-portal-adapters.ts` implements customer JWT signing/verification;
- `packages/infrastructure/src/customer-portal-store.ts` implements Memory and PostgreSQL portal persistence;
- existing private Evidence Storage, Argon2id, hash, clock and ID ports are reused;
- PostgreSQL authoritative evidence metadata/audit/idempotency mutation executes transactionally.

### Presentation

- `apps/api/src/customer-auth.guard.ts` is the customer-context bearer adapter;
- the historical staff guard now detects a valid customer token and fails with context mismatch;
- `apps/api/src/customer-portal-controller.ts` exposes only the seven frozen REST operations;
- controllers own transport validation/rate limiting only and do not perform Prisma/business mutation.

### Architecture gate

`scripts/architecture-check.mjs` explicitly includes the new Customer Portal guard/controller in the REST boundary and rejects direct Prisma/Infrastructure imports there.

## 8. Persistence

`prisma/contract.prisma` adds `CustomerAccount` and the optional 1:1 relation from `Customer`.

Forward migration:

- `prisma/migrations/20260909_09_customer_portal_r3.sql`

Guarded rollback:

- `prisma/migrations/20260909_09_customer_portal_r3.rollback.sql`

The rollback refuses destructive removal when customer-account history exists.

No real customer credentials are committed. QA uses ephemeral synthetic Argon2id hashes and generated JWT secrets.

## 9. Rate limits

The HTTP adapter applies the frozen R3 defaults:

- customer login: 5/min/IP plus 10/15m/normalized login;
- customer reads: 120/min/customer;
- portal evidence upload: 10/min/customer.

These limits remain separate from staff/admin families.

## 10. Verification coverage

### Application tests

`tests/application/customer-portal.test.ts` proves:

- account-derived ownership;
- own self/policy/claim access;
- cross-customer Claim denial as `RESOURCE_NOT_FOUND`;
- private evidence append;
- replay under filename change;
- same key/different content conflict;
- cross-customer evidence denial;
- durable sanitized `CUSTOMER_EVIDENCE_ADDED` audit.

### REST tests

`tests/api/customer-portal.test.ts` proves:

- customer login and 1800-second token contract;
- staff token rejected by portal as context mismatch;
- customer token rejected by staff route as context mismatch;
- all own-resource read endpoints;
- IDOR-safe `404`;
- evidence 201 + replay header;
- foreign-Claim evidence denial;
- customer Communication history.

### PostgreSQL runtime QA

`qa/customer-portal-runtime-qa.mjs` runs the portal against the real PostgreSQL adapter and live Nest process, proving:

- failed/successful customer authentication;
- both cross-token mismatch directions;
- own Customer/Policy/Claim projections;
- resource-safe denial;
- fake JPEG signature rejection;
- valid PDF evidence append;
- idempotent replay;
- reused-key conflict;
- Communication list behavior.

`qa/customer-portal-audit-assertions.sql` verifies:

- CustomerAccount persistence/ownership;
- login success/failure audit classification;
- exactly one evidence row after replay;
- exactly one customer evidence audit event for the committed request;
- absence of forbidden path/storage/filename/byte metadata;
- completed HTTP idempotency record.

## 11. CI compatibility and security

Introducing a mandatory separate customer JWT secret exposed several historical workflows that start the production runtime with only the staff JWT secret.

The correction preserves production fail-closed behavior:

- no customer→staff secret fallback was introduced;
- unrelated QA staff seeding remains valid without requiring a Customer Portal fixture;
- workflows that start the production runtime generate a distinct ephemeral `CUSTOMER_JWT_SECRET`;
- Operations observability secret scanning checks the customer secret as well as the staff secret and synthetic password.

This avoids weakening the runtime merely to satisfy CI.

## 12. Explicit exclusions

This increment does not implement or claim:

- real customer/claim/PII data;
- real FAR Seguros identity, policies, claims or workflows;
- refresh tokens, password reset, SSO or external IdP;
- customer account administration API;
- a customer-facing mapping of internal ClaimTasks into outstanding actions;
- customer access to raw audit;
- evidence download through the portal;
- claim reopening;
- Imports;
- Renewals;
- Collections;
- Custom Fields;
- Bulk Operations;
- new Automation effects;
- new external integrations;
- changes to frozen `documentation/api/r3/**`;
- changes to Blueprint Master;
- tag, release or publication.

## 13. Machine verification

Verified implementation candidate SHA:

`eb67831e0e1590a5b6f5cb829e8c78795eb83eef`

Backend verification on that exact SHA:

- Prisma contract emit: PASS;
- TypeScript typecheck: PASS;
- backend tests: **56/56 PASS**;
- architecture conformance: PASS — 8 Domain files, 18 Application files, REST Presentation, Worker adapter/composition, MCP Presentation and legacy DTO boundaries;
- production build: PASS;
- PostgreSQL Customer Portal runtime QA: PASS;
- Customer Portal persistence/audit SQL verification: PASS;
- production dependency classification remains enforced by API/Integration QA.

Exact-candidate successful GitHub Actions runs:

| Workflow | Run | Result |
|---|---:|---|
| API Implementation #334 | `34369063734` | SUCCESS |
| API QA #297 | `34369063724` | SUCCESS |
| OpenAPI Validation #317 | `34369063590` | SUCCESS |
| OpenAPI Post-MVP R2 #92 | `34369063500` | SUCCESS |
| Postman Contract #304 | `34369063659` | SUCCESS |
| Integration QA - Web Slices #195 | `34369063666` | SUCCESS |
| Release Gate Evidence #187 | `34369063708` | SUCCESS |
| Operations Observability Evidence #174 | `34369063741` | SUCCESS |
| Design System #274 | `34369063720` | SUCCESS |
| Interface Inventory #279 | `34369063731` | SUCCESS |
| Functional Slice - Claims Backoffice Web #202 | `34369063707` | SUCCESS |
| Functional Slice - Customer Claim Tracking Web #215 | `34369063629` | SUCCESS |
| Functional Slice - Digital Claim Intake Web #247 | `34369063649` | SUCCESS |

Exactly three inherited readiness locks remain expected failures and were not altered by this increment:

| Historical lock | Run | Expected result |
|---|---:|---|
| Release Gate Ready State #180 | `34369063433` | FAILURE |
| Operations State #169 | `34369063526` | FAILURE |
| Visual Functional Review Ready - Web #175 | `34369063580` | FAILURE |

There was no fourth failure and no pending workflow on the verified implementation candidate.

This evidence records machine readiness only. It does not authorize merge, tag, release or publication. Final compact-branch verification must still pass on its own exact head before PR #49 is marked Ready for Review.

## 14. Human gate

Machine success is not semantic approval. PR #49 remains subject to final compact-head verification and a separate explicit human merge decision. No merge, tag, release or publication is authorized by this document.
