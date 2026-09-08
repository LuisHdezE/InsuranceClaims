# API Implementation R3 — Increment 07: Communication Hub

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `11a0dc70b317c439d7164e610933f2aaba408f52`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. All communication templates, customer references, destinations, messages and provider results used by this increment are synthetic/demo data.

## 1. Increment boundary

This increment implements the approved R3 Communication Hub immediately after Customer 360 + Policy 360.

Implemented requirements:

- `FR-029` — versioned Communication Templates;
- `FR-030` — outbound Communication request through an Application/provider port;
- `FR-031` — delivery lifecycle, append-only attempts and queryable history.

Frozen `communication-template-admin` operations implemented:

```text
GET   /api/v1/admin/communication-templates
GET   /api/v1/admin/communication-templates/{definitionId}
POST  /api/v1/admin/communication-templates
POST  /api/v1/admin/communication-templates/{definitionId}/versions
POST  /api/v1/admin/communication-templates/{definitionId}/versions/{versionId}/activate
PATCH /api/v1/admin/communication-templates/{definitionId}
```

Frozen `communications` operations implemented:

```text
POST /api/v1/operator/communications
GET  /api/v1/operator/communications
GET  /api/v1/operator/communications/{communicationId}
```

Permissions remain separated:

- template administration requires `communications.admin`;
- outbound request requires `communications.send`;
- operational history reads require `communications.read`;
- Platform Administrator does not implicitly gain operational send/read authority;
- Claims Operator/Supervisor do not gain template administration authority.

## 2. Configuration semantics

Communication templates follow the same approved R3 governed-configuration model as Pipelines:

- creating a definition creates immutable-content `DRAFT v1`;
- subsequent versions require `expectedDefinitionVersion`;
- activation requires an eligible `DRAFT` version;
- activation retires the previous active version;
- activated content is never edited in place;
- enabling requires an active version;
- disabling an active definition retires the active version and clears the runtime pointer;
- provenance/source classification is mandatory;
- optimistic concurrency protects definition metadata/pointers.

Audit event codes used by the frozen inventory are preserved:

- `COMM_TEMPLATE_VERSION_CREATED`;
- `COMM_TEMPLATE_VERSION_ACTIVATED`;
- `COMM_TEMPLATE_VERSION_RETIRED`.

## 3. Channels and template variables

R3 provider delivery is explicitly simulated/demo. The implemented channels are limited to:

- `EMAIL`;
- `WHATSAPP`.

This does not claim a production email or WhatsApp integration. No live provider SDK, credential, sender identity or destination address is committed or persisted.

Template variable definitions are bounded to a finite schema:

- `STRING`;
- `NUMBER`;
- `BOOLEAN`.

A version accepts at most 30 declared variables. Runtime requests must match the approved schema exactly. String values are bounded. Arbitrary JSON, executable content, SQL, URLs, secrets and uncontrolled PII are not accepted as template variables.

EMAIL templates require a subject. Body/subject lengths are bounded.

## 4. Communication acceptance semantics

`POST /api/v1/operator/communications` returns HTTP `202` only after a logical Communication has been durably accepted as:

`QUEUED`

It does **not** mean delivered.

The request identifies:

- an active approved `templateVersionId`;
- its matching channel;
- an approved target type/reference;
- allowlisted variables;
- required `Idempotency-Key`.

Application re-authorizes all of those values before persistence.

The REST API does not expose an endpoint that bypasses the queue/lifecycle to force provider delivery.

## 5. Target resolution and destination minimization

Initial R3 target types are constrained to the approved Communications collaboration boundary:

- `CUSTOMER`;
- `CLAIM`.

Targets are resolved server-side through Application ports.

A Customer target must resolve to an existing modern synthetic Customer. A Claim target must resolve to an existing Claim with an explicit modern Customer link.

The persisted `destinationRef` is the synthetic opaque Customer reference from the modern Customer master. The client does not submit raw email addresses, phone numbers or provider credentials.

## 6. Delivery lifecycle and retry safety

Communication lifecycle vocabulary follows the approved architecture:

```text
QUEUED
  -> DELIVERING
      -> DELIVERED
      -> FAILED
FAILED
  -> DELIVERING (reviewed retry execution)
```

`DELIVERED` and `CANCELLED` are terminal for delivery processing.

Delivery attempts are append-only and contain:

- monotonically increasing attempt number;
- unique deterministic delivery identity;
- start/completion timestamps;
- `IN_PROGRESS | DELIVERED | FAILED` outcome;
- simulated provider reference when applicable;
- sanitized failure category.

A concurrent second processor cannot start another attempt while the Communication is `DELIVERING`. Re-processing a `DELIVERED` Communication does not create another attempt.

The provider adapter for R3 is `SimulatedCommunicationDeliveryAdapter`. A focused Application test also uses a deterministic adapter that fails once and then succeeds to prove that a retry creates a second attempt instead of overwriting or duplicating the first.

No exactly-once provider-delivery claim is made.

## 7. Idempotency

Logical Communication request identity is protected by the required `Idempotency-Key`.

Application stores only its hash plus a request fingerprint.

Semantics:

- same key + same request fingerprint replays the original Communication response;
- same key + different request fingerprint returns `IDEMPOTENCY_KEY_REUSED`;
- a racing duplicate cannot create a second logical Communication.

Provider delivery identity is separate from request idempotency and is unique per Communication attempt.

## 8. Persistence

Forward migration:

`prisma/migrations/20260908_05_communication_hub_r3.sql`

adds:

- `communication_template_definitions`;
- `communication_template_versions`;
- `communications`;
- `communication_attempts`.

PostgreSQL constraints enforce finite channels/statuses/outcomes, template version uniqueness, request idempotency uniqueness, attempt numbering and delivery identity uniqueness.

`qa/bootstrap.sql` mirrors the physical schema.

Rollback:

`prisma/migrations/20260908_05_communication_hub_r3.rollback.sql`

is conservative and refuses destructive rollback while template/configuration/communication/attempt history exists.

No production template, message, customer destination or provider credential is seeded.

## 9. Clean Architecture

- Communication vocabulary is framework-independent Domain code.
- Template administration, authorization, idempotency, target compatibility, variable validation and delivery orchestration live in Application.
- provider delivery and persistence are Application ports.
- `MemoryCommunicationStore` and `PrismaCommunicationStore` are Infrastructure adapters.
- `CommunicationContextResolver` resolves Customer/Claim context through existing ports, not direct controller/Prisma shortcuts.
- `SimulatedCommunicationDeliveryAdapter` is Infrastructure only.
- NestJS controllers are outer Presentation adapters.
- future Worker execution can invoke `processCommunicationDelivery()` through Application without owning business rules.

No Application/Domain code imports NestJS, Prisma or a provider SDK.

## 10. Explicit exclusions

This increment does not implement:

- real email/WhatsApp delivery or credentials;
- inbound integration/webhooks (`FR-032..033`);
- the generic Worker scheduler/outbox/dead-letter foundation;
- Automation Engine;
- Customer Portal communication views;
- Insurer Guidance;
- Renewals/Collections communication automation;
- real PII/destinations;
- communication deletion;
- arbitrary provider response persistence;
- changes to `documentation/api/r3/**`;
- Blueprint Master, tag, release or publication changes.

Communication lifecycle integration into later cross-capability projections may be refined during their owning increments/final R3 reconciliation without reopening the nine frozen Communication Hub operations.

## 11. Production dependency security remediation

During exact-head API QA for the initial implementation head, the pre-existing production dependency gate began reporting three `high` findings from the npm advisory feed. The Increment 07 implementation had not changed `package.json` or `package-lock.json`, so the gate was investigated rather than suppressed.

Sanitized diagnostic run:

- `API QA #248` — workflow run `34290617974`.

The report established that the three reported nodes were one dependency chain:

```text
@nestjs/core
  -> @nestjs/platform-express
      -> multer 2.2.0
```

The root vulnerable package was `multer 2.2.0`; `@nestjs/platform-express 12.0.1` pins that exact release. The patched Multer release is `2.3.0`.

The remediation is deliberately minimal:

```json
{
  "overrides": {
    "multer": "2.3.0"
  }
}
```

No NestJS major/minor upgrade, security-gate exception or audit suppression was introduced.

Candidate validation:

- `API QA #249` — workflow run `34290869005` — FULL SUCCESS with `multer 2.3.0` resolved at runtime;
- Prisma contract emit, TypeScript, PostgreSQL bootstrap, runtime contract/security/concurrency checks and durable persistence assertions all passed;
- `npm audit --omit=dev` completed with zero `high` and zero `critical` production findings.

Persisted-lock validation:

- `API QA #250` — workflow run `34291147977` — FULL SUCCESS;
- the runner regenerated the lock using npm after applying the root override, re-ran the complete API QA chain, and persisted only the validated dependency metadata;
- comparison of the generated lock against the prior lock showed that the Multer entry changed only its version, tarball URL and integrity hash; unrelated dependency graph entries did not drift;
- temporary diagnostic workflow changes were restored to the canonical workflow before the final branch tree was prepared.

This security remediation is part of Increment 07 because the existing `api.security_qa` gate became blocking during its verification. The gate itself remains unchanged and authoritative.

## 12. Verification targets and results

Machine verification must prove:

1. Prisma 8 contract emit succeeds;
2. PostgreSQL bootstrap and runtime schema are compatible;
3. TypeScript passes;
4. backend tests pass;
5. architecture conformance passes;
6. build passes;
7. API QA passes with ephemeral PostgreSQL and simulated legacy;
8. Integration QA passes;
9. template admin is restricted to `communications.admin`;
10. outbound requests require `communications.send`;
11. history reads require `communications.read`;
12. Platform Administrator has no implicit send/read grant;
13. active template/version/channel compatibility is server-authoritative;
14. request `202` response remains `QUEUED`, not delivered;
15. same idempotency key/same request replays one logical Communication;
16. key reuse with changed request is rejected;
17. simulated failure can retry safely without overwriting prior attempts;
18. delivered Communication reprocessing creates no duplicate attempt;
19. no provider credentials/raw secret destinations are exposed;
20. frozen `documentation/api/r3/**` remains unchanged;
21. historical Claim/Task/Pipeline/Customer/Policy behavior does not regress;
22. production dependency security gate passes without suppression after the Multer 2.3.0 override.

The functional implementation and dependency remediation have been machine-verified on the validation runs recorded above. The final compacted PR head must still complete its own exact-head CI before human merge review.

## 13. Governance

Machine success moves this increment only to:

`IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`

It does not authorize merge, tag, release or publication. Merge requires separate explicit human approval from Luis.
