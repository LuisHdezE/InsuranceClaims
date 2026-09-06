# Client Architecture — Insurance Claims Legacy Modernization MVP

Date: 2026-09-06  
Blueprint: 0.5.2  
Mode: GREENFIELD with SIMULATED LEGACY coexistence  
Platform: web  
Boundary: Client Architecture only, no React implementation in this PR

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Canonical composition

This boundary follows the Blueprint contract:

`Platform Client Architecture Baseline + Slice Architecture Binding = Effective Client Architecture Contract`

The reusable web baseline is:

- `.blueprint/client-architecture/web-platform.json`

The three exact slice bindings are:

- `digital-claim-intake + web` → `.blueprint/client-architecture/digital-claim-intake.web.json`
- `customer-claim-tracking + web` → `.blueprint/client-architecture/customer-claim-tracking.web.json`
- `claims-backoffice + web` → `.blueprint/client-architecture/claims-backoffice.web.json`

`client_architecture_ready` is therefore evaluated three times, once for each exact slice + platform pair. A PASS for one slice never authorizes another.

## 2. Shared WEB-001 entry policy

`WEB-001 Case Study Home` is intentionally a shared public entry and is not a fourth Functional Interface Slice. It remains outside all three slice bindings because the executable inventory assigns no `slice_id` to WEB-001.

The platform architecture still governs WEB-001 through the approved Design System and tokens. The explicitly approved landing direction at `.blueprint/ui/references/far-public-landing-approved.md` applies to WEB-001 only as a visual reference. It cannot add operations, permissions, routes or business capabilities.

This preserves both truths:

1. the public landing must follow the approved modern FAR-aligned visual direction;
2. a slice binding may contain only inventory items that actually belong to that slice.

## 3. Web platform baseline

### 3.1 Runtime/client structure

The web client remains inside `apps/web` when implementation begins. It may depend on client-safe shared types/contracts but may not import server persistence, Prisma, Infrastructure adapters, legacy-simulator protocol types or server composition roots.

Chosen client stack:

- React + TypeScript;
- Tailwind CSS using the approved Design System/tokens;
- SPA rendering for this MVP;
- React Router for route ownership;
- TanStack Query for REST server state;
- Axios through a single configured HTTP transport adapter;
- React Hook Form for form orchestration;
- Zod for immediate client structural/format feedback only;
- Vite for the client build.

The library choices are implementation decisions inside the already-approved React/TypeScript/Tailwind boundary. They do not alter API or business contracts.

### 3.2 API client boundary

All authoritative business data comes from the approved REST API in `openapi.yaml`, revision `api-v1-r1`.

The future Axios adapter shall:

- resolve API base URL from runtime configuration;
- send `X-Request-Id` when the client creates a correlation value and preserve response `requestId` for diagnostics;
- attach bearer JWT only to protected operator requests;
- attach `Idempotency-Key` only where the approved contract requires it;
- parse RFC 9457 `application/problem+json` into typed client outcomes;
- never retry mutations blindly;
- never call PostgreSQL, Prisma, the simulated legacy service or MCP directly.

No convenience endpoint may be invented by the client.

### 3.3 Authentication lifecycle

The operator flow follows the frozen API architecture exactly:

- mechanism: short-lived bearer JWT;
- target token lifetime: 900 seconds, server-defined;
- access token: memory only;
- no refresh token;
- no refresh endpoint;
- no refresh rotation/single-flight flow;
- login through `authenticateOperator` only;
- protected 401 clears token, protected query cache and operator state, then routes through `/operator/login`;
- 403 renders the accessible forbidden state without leaking claim content;
- logout is local state/token/cache disposal only;
- intended route preservation is ephemeral, never encoded with secrets in a URL;
- tokens and credentials are never logged.

Public intake and tracking routes remain anonymous and never inherit the operator bearer token accidentally.

### 3.4 Authorization presentation

Permission-aware UI is a usability layer, not a security boundary.

The client may hide or disable an action the current operator cannot use, but the API/Application remains authoritative for every protected operation.

Relevant permission intents:

- `claims.intake.create`
- `claims.tracking.read`
- `claims.backoffice.read`
- `claims.backoffice.transition`

The client must not derive new roles or permissions from visual state.

### 3.5 State and cache

TanStack Query owns server state. React local state or narrowly scoped context owns ephemeral UI state.

Forbidden:

- treating a global client store as authoritative claim state;
- persisting protected claim responses, evidence, bearer tokens or tracking proofs in durable browser storage for this MVP;
- optimistic lifecycle transitions that assume server acceptance.

After a successful state transition, invalidate the affected claim detail/history and collection/status-filter queries. On 409, refetch canonical detail before a new explicit transition decision.

### 3.6 Forms and validation

React Hook Form + Zod may provide immediate structural/format feedback. They do not recreate:

- policy/vehicle eligibility;
- evidence acceptance authority;
- claim lifecycle legality;
- authorization;
- idempotency truth.

422 Problem Details map to field/global feedback. 409 maps to non-destructive conflict recovery. 429 maps to restrained retry guidance, using `Retry-After` when present.

### 3.7 Offline behavior

Offline mode is `degraded`.

- no queued business writes;
- no offline claim submission;
- no offline state transition;
- no fabricated cached business truth;
- no durable persistence of evidence, tracking proof or operator token;
- current in-memory form state may remain visible while the page stays open;
- after reconnection, authoritative state is refetched before explicit mutation retry.

### 3.8 Observability and privacy

Use `X-Request-Id` / response `requestId` as the correlation bridge.

Sanitized client diagnostics may include route, operationId, HTTP status, stable problem code and requestId. They must exclude:

- bearer tokens;
- passwords;
- tracking proof pairs;
- policy/vehicle values;
- evidence bytes/names when not required;
- full request/response bodies;
- raw legacy payloads.

### 3.9 Accessibility

Target: WCAG 2.2 AA.

- keyboard-complete journeys;
- semantic headings/landmarks/forms/tables;
- programmatic field labels/errors;
- focus movement for route errors, validation summaries and dialogs;
- live regions for async outcomes;
- minimum 44px touch target;
- no color-only status;
- public and admin responsive variants preserve logical DOM/keyboard order.

### 3.10 Testing strategy

All four layers are mandatory:

- unit: mappers, auth utilities, permission presentation, Problem Details, idempotency helpers;
- component/UI: forms, states, accessibility, responsive public/admin components;
- integration: configured Axios transport + TanStack Query + auth/header/error/cache behavior;
- E2E: the three slice journeys against the real synthetic API.

## 4. Slice: digital-claim-intake + web

Inventory:

- WEB-002 `/claims/new/verify`
- WEB-003 `/claims/new`
- WEB-004 `/claims/new/review`
- WEB-005 `/claims/new/success`

Canonical operations:

- `verifyPolicyVehicle`
- `createClaim`

Permission:

- `claims.intake.create`

Idempotency:

- `createClaim` requires one `Idempotency-Key` per explicit submission intent;
- identical retry reuses the same key and payload;
- replay response is treated as canonical success;
- changed-payload reuse or in-progress conflict never triggers implicit resubmission.

The client stages evidence locally only for the current flow. Server MIME/count/size validation remains authoritative. No pre-validation endpoint is invented.

## 5. Slice: customer-claim-tracking + web

Inventory:

- WEB-006 `/claims/track`
- WEB-007 `/claims/track/status`

Canonical operation:

- `trackClaim`

Permission intent:

- `claims.tracking.read`

Security rules:

- tracking code + synthetic policy reference remain sensitive proof input;
- invalid proof preserves collapsed `404 CLAIM_NOT_FOUND` behavior;
- internal audit/backoffice data is never rendered;
- the web client uses REST `trackClaim`, not MCP;
- proof values are not placed in URL query parameters or durable browser storage.

No Idempotency-Key is introduced for this read-only slice.

## 6. Slice: claims-backoffice + web

Inventory:

- WEB-008 `/operator/login`
- WEB-009 `/operator/claims`
- WEB-010 `/operator/claims/:claimId`

Canonical operations:

- `authenticateOperator`
- `listClaims`
- `getClaimDetail`
- `downloadClaimEvidence`
- `transitionClaimStatus`

Protected permission intents:

- `claims.backoffice.read`
- `claims.backoffice.transition`

WEB-008 itself is the anonymous authentication entry and has no permission requirement.

Transition concurrency uses `expectedFromStatus`; it is not replaced by a client-invented Idempotency-Key protocol. On `CLAIM_STATE_CONFLICT` or invalid transition, refetch canonical claim detail and require a new explicit operator decision.

Evidence is downloaded only through the protected REST endpoint. The browser client does not create durable evidence caches or log binary contents.

## 7. Visual contract binding

All slices bind to:

- `.blueprint/ui/design-system.json`
- `.blueprint/ui/design-tokens.json`

No slice-specific static mockup is required. The Design System is sufficient for intake, tracking and backoffice implementation.

Public/customer experiences use the FAR-aligned modern treatment. Backoffice uses the same identity family with restrained brand accents, neutral work surfaces, readable density, lifecycle/evidence/history emphasis and no marketing hero.

WEB-001 additionally uses the approved landing reference. That reference remains outside the slice bindings because WEB-001 is shared.

## 8. Traceability and API authority

The slice bindings consume the executable Interface Inventory, not the early descriptive scope baseline.

Every bound operationId must exist in the current `openapi.yaml`. Every route and permission must match the selected inventory items. Idempotency operations must be a subset of the slice's bound operations.

The validation workflow must fail if any of those relationships drift.

## 9. Implementation guardrails

For all three slice contracts:

- API remains authoritative;
- no new API behavior;
- approved executable inventory only;
- no hardcoded authoritative business data;
- no database/Prisma/legacy/MCP direct client access;
- no auth bypass;
- high-risk idempotency follows the approved API contract;
- no Functional Interface Slice code begins until the corresponding `client_architecture_ready` scoped gate is PASS and this PR is merged.

## 10. Gate model

The expected scoped gates are:

1. `client_architecture_ready` / `digital-claim-intake` / `web`
2. `client_architecture_ready` / `customer-claim-tracking` / `web`
3. `client_architecture_ready` / `claims-backoffice` / `web`

Each must independently satisfy all 15 required canonical Client Architecture checks. Brownfield coexistence is N/A because the project mode is GREENFIELD; the simulated legacy HTTP service is a server-side integration dependency, not a Brownfield client coexistence surface.
