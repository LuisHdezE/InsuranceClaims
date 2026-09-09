# API Implementation R3 — Increment 11: Insurer Guidance Administration

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with simulated legacy coexistence  
**Baseline `main`:** `bf5a39fe8200c2e2868f7031c6370bc5c8392a1e`  
**Contract revision:** `api-v1-r3`  
**Requirements:** FR-038, FR-050  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-09

> Caso técnico no oficial · No oficial · Sin afiliación. All insurer/context references, guidance categories, instructions, document categories, assistance metadata and test identities in this increment are synthetic/demo.

## 1. Frozen scope implemented

This increment follows the next server slice recommended by `API_FUNCTIONAL_COVERAGE_GAP_R3.md` after the Automation/Scheduler/Dead-letter foundation.

It implements the six frozen `guidance-admin` operations from `API_ENDPOINT_INVENTORY_R3.json` without changing their operation identity or route family:

| operationId | method/path | permission | success |
|---|---|---|---|
| `listGuidances` | `GET /api/v1/admin/guidance` | `guidance.admin` | 200 |
| `getGuidance` | `GET /api/v1/admin/guidance/{definitionId}` | `guidance.admin` | 200 |
| `createGuidance` | `POST /api/v1/admin/guidance` | `guidance.admin` | 201 |
| `createGuidanceVersion` | `POST /api/v1/admin/guidance/{definitionId}/versions` | `guidance.admin` | 201 |
| `activateGuidanceVersion` | `POST /api/v1/admin/guidance/{definitionId}/versions/{versionId}/activate` | `guidance.admin` | 200 |
| `updateGuidanceState` | `PATCH /api/v1/admin/guidance/{definitionId}` | `guidance.admin` | 200 |

The pre-existing R3 RBAC matrix already grants `guidance.admin` only to `PLATFORM_ADMIN`; no permission broadening was required.

## 2. Configuration model

The implementation uses the frozen versioned-configuration semantics already shared by Pipeline, Communication Template and Automation configuration:

- a stable `InsurerGuidanceDefinition` owns runtime availability and an active-version pointer;
- creation produces immutable-content `DRAFT` version 1 and leaves the definition disabled;
- subsequent content changes create a new `DRAFT` and require `expectedDefinitionVersion`;
- only an eligible `DRAFT` may become `ACTIVE`;
- activating a new version retires the previous active version;
- active content is never edited in place;
- enabling requires an active version;
- disabling retires the current active version and clears the active pointer;
- optimistic concurrency protects version creation, activation and state changes.

Version content maps directly to the approved R3 Data Architecture wording:

- synthetic insurer/context reference;
- guidance category;
- approved document-category list;
- approved instruction list;
- assistance metadata;
- provenance/source classification;
- version status and timestamps.

No deadline, phone number, coverage rule or other insurer-specific operational fact is modeled as authoritative configuration in this increment.

## 3. Technical bounded-schema safeguards

The frozen R3 contract does not prescribe item-count or string-length caps for guidance content. The implementation therefore applies bounded technical validation solely to keep the configuration surface predictable and safe:

- key: 80 characters, stable configuration-key alphabet;
- insurer/context reference: 80 characters;
- guidance category: 80 characters;
- source classification: 80 characters;
- document categories: maximum 20, each maximum 80 characters;
- instructions: maximum 20, each maximum 1000 characters;
- assistance metadata: maximum 20 scalar string entries, keys maximum 80 and values maximum 500 characters.

These are demo engineering limits, not insurer business rules. Empty bounded content collections remain valid; the implementation does not invent a minimum document/instruction policy.

## 4. Architecture

### Domain

`packages/domain/src/guidance.ts` defines framework-independent configuration state only.

### Application

`packages/application/src/guidance-admin.ts` owns:

- least-privilege authorization;
- validation and normalization;
- optimistic concurrency;
- DRAFT/ACTIVE/RETIRED transitions;
- active-pointer invariants;
- sanitized projections;
- audit intent.

### Infrastructure

`packages/infrastructure/src/guidance-store.ts` provides Memory and PostgreSQL adapters behind the same Application port.

PostgreSQL mutations that change authoritative configuration and their required audit record execute in the same database transaction.

### Presentation

`apps/api/src/guidance-controller.ts` is a NestJS adapter only. It applies the frozen route shape, JWT guard, request validation, request ID propagation and the established admin rate limits:

- protected read: 120/min;
- admin configuration write: 30/min.

No controller or Prisma adapter owns business transition rules.

## 5. Persistence

`prisma/contract.prisma` adds:

- `InsurerGuidanceDefinition`;
- `InsurerGuidanceVersion`;
- `InsurerGuidanceVersionStatus`;
- `InsurerGuidanceActorType`.

Migration:

- `prisma/migrations/20260909_08_insurer_guidance_r3.sql`

Guarded rollback:

- `prisma/migrations/20260909_08_insurer_guidance_r3.rollback.sql`

The rollback refuses destructive removal if guidance configuration history exists.

No synthetic insurer guidance is seeded into production state.

## 6. Audit

The exact frozen event codes are used:

- `INSURER_GUIDANCE_VERSION_CREATED`;
- `INSURER_GUIDANCE_VERSION_ACTIVATED`;
- `INSURER_GUIDANCE_VERSION_RETIRED`.

Actor type is `ADMINISTRATOR`.

Audit metadata records configuration identity and provenance/context only:

- definition ID;
- guidance key;
- version number;
- synthetic insurer/context reference;
- guidance category;
- source classification.

Raw instruction text, document-category values and assistance metadata are not copied into audit metadata.

## 7. Verification coverage

- `tests/application/guidance-admin.test.ts`
  - Operator denial;
  - DRAFT creation;
  - activation and enablement;
  - stale-write rejection;
  - new-version activation retiring prior active content;
  - disable/retirement semantics;
  - exact audit catalog and request IDs;
  - audit does not duplicate raw guidance content;
  - bounded technical validation.

- `tests/api/guidance-admin.test.ts`
  - all six frozen REST operations;
  - least privilege;
  - RFC 9457 validation/conflict responses through existing transport mapping;
  - pagination/get projections;
  - optimistic concurrency;
  - DRAFT → ACTIVE → RETIRED lifecycle.

- `qa/guidance-runtime-qa.mjs`
  - runs the frozen Guidance REST surface against the real PostgreSQL adapter;
  - authenticates synthetic `CLAIMS_OPERATOR` and `PLATFORM_ADMIN` actors;
  - verifies least privilege, persistence, versioning, activation, retirement and stale-write conflict behavior.

- `qa/guidance-audit-assertions.sql`
  - verifies the final persisted definition/version state;
  - verifies the five expected durable configuration audit events and request correlation;
  - verifies administrator actor/outcome invariants;
  - verifies rejected/no-op operations do not create spurious configuration audit rows;
  - verifies raw instruction/document/assistance content is not duplicated into audit metadata.

## 8. Explicit exclusions

This increment does not implement or claim:

- real insurer guidance or FAR-specific rules/data;
- Customer Portal guidance consumption;
- Customer Portal identity/evidence;
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

## 9. Machine verification

Verified implementation candidate SHA:

`88d91fc6b602a20f8e88572bf26924b2552d948e`

Backend verification on that exact SHA:

- Prisma contract emit: PASS;
- TypeScript typecheck: PASS;
- backend tests: **53/53 PASS**;
- architecture conformance: PASS — 8 Domain files, 17 Application files, REST Presentation, Worker adapter/composition, MCP Presentation and legacy DTO boundaries;
- production build: PASS;
- PostgreSQL Guidance runtime QA: `INSURER_GUIDANCE_RUNTIME_QA_PASS`;
- Guidance persistence/audit SQL verification: `INSURER_GUIDANCE_QA_AUDIT_ASSERTIONS_PASS`;
- production dependency audit: 0 high, 0 critical.

Exact-candidate successful GitHub Actions runs:

| Workflow | Run | Result |
|---|---:|---|
| API Implementation #324 | `34356572603` | SUCCESS |
| API QA #287 | `34356572627` | SUCCESS |
| OpenAPI Validation #307 | `34356573254` | SUCCESS |
| OpenAPI Post-MVP R2 #82 | `34356572596` | SUCCESS |
| Postman Contract #294 | `34356572713` | SUCCESS |
| Integration QA - Web Slices #185 | `34356572716` | SUCCESS |
| Release Gate Evidence #177 | `34356572715` | SUCCESS |
| Operations Observability Evidence #164 | `34356572662` | SUCCESS |
| Design System #264 | `34356572616` | SUCCESS |
| Interface Inventory #269 | `34356572657` | SUCCESS |
| Functional Slice - Claims Backoffice Web #192 | `34356572623` | SUCCESS |
| Functional Slice - Customer Claim Tracking Web #205 | `34356572621` | SUCCESS |
| Functional Slice - Digital Claim Intake Web #237 | `34356572659` | SUCCESS |

Exactly three inherited readiness locks remain expected failures and were not altered by this increment:

| Historical lock | Run | Expected result |
|---|---:|---|
| Release Gate Ready State #170 | `34356572646` | FAILURE |
| Operations State #159 | `34356572611` | FAILURE |
| Visual Functional Review Ready - Web #165 | `34356572641` | FAILURE |

There was no fourth failure and no pending workflow on the verified implementation candidate.

This evidence records machine readiness only. It does not authorize merge, tag, release or publication. Final compact-branch verification must still pass on its own exact head before the PR is marked Ready for Review.

## 10. Human gate

Machine success is not semantic approval. Merge requires a separate explicit human decision after the final compact-head verification.
