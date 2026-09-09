# API Implementation R3 — Increment 13: Governed Imports

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with simulated legacy coexistence  
**Baseline `main`:** `a68cba68eb5c483f1536f25befa1e70bc002dff8`  
**Contract revision:** `api-v1-r3`  
**Requirements:** FR-042, FR-043  
**Status:** IMPLEMENTED_VERIFIED_PENDING_FINAL_COMPACT_HEAD  
**Date:** 2026-09-09

> Caso técnico no oficial · Sin afiliación. Every ImportJob, row, target reference, identity and source value used by this increment is synthetic/demo data.

## 1. Frozen scope implemented

This increment implements the nine frozen `imports` operations from `API_ENDPOINT_INVENTORY_R3.json` without changing their operation identity or route family:

| operationId | method/path | permission | success |
|---|---|---|---|
| `listImportJobs` | `GET /api/v1/admin/import-jobs` | `imports.execute` | 200 |
| `createImportJob` | `POST /api/v1/admin/import-jobs` | `imports.execute` | 201 |
| `getImportJob` | `GET /api/v1/admin/import-jobs/{importJobId}` | `imports.execute` | 200 |
| `previewImportJob` | `POST /api/v1/admin/import-jobs/{importJobId}/preview` | `imports.execute` | 200 |
| `updateImportMapping` | `PUT /api/v1/admin/import-jobs/{importJobId}/mapping` | `imports.execute` | 200 |
| `validateImportJob` | `POST /api/v1/admin/import-jobs/{importJobId}/validate` | `imports.execute` | 200 |
| `dryRunImportJob` | `POST /api/v1/admin/import-jobs/{importJobId}/dry-run` | `imports.execute` | 200 |
| `commitImportJob` | `POST /api/v1/admin/import-jobs/{importJobId}/commit` | `imports.execute` | 202 |
| `listImportJobRows` | `GET /api/v1/admin/import-jobs/{importJobId}/rows` | `imports.execute` | 200 |

The pre-existing R3 RBAC matrix grants `imports.execute` only to `PLATFORM_ADMIN`; no permission broadening is introduced.

## 2. Scope-control decision

The approved R3 requirements freeze the governed ImportJob engine but do not define a concrete business import type or approved Customer/Policy/Claim spreadsheet schema.

To avoid inventing FAR/insurer processes or turning R3 into the explicitly excluded generic database/table importer, this increment activates only one technical synthetic fixture:

- import type: `SYNTHETIC_REFERENCE_RECORDS`;
- approved target fields: `externalReference`, `label`, optional `classification`;
- authoritative demo target: `SyntheticImportReference`.

This fixture demonstrates the full governed lifecycle and row-partial commit semantics. It is not a claim that Customers, Policies, Claims or any insurer-specific dataset may be imported with this schema.

## 3. Lifecycle and authority

The implementation follows the frozen lifecycle exactly:

```text
UPLOADED
 -> PREVIEWED
 -> MAPPED
 -> VALIDATED
 -> DRY_RUN_READY
 -> COMMITTING
 -> COMPLETED | COMPLETED_WITH_ERRORS | FAILED
```

`CANCELLED` remains represented by the frozen Domain state but no cancellation REST operation exists in the approved R3 inventory, so this increment does not invent one.

Authority rules:

- upload only stores a private source and ImportJob metadata;
- preview parses/stages rows only;
- mapping stores allowlisted field mapping only;
- validation normalizes rows and records validation outcomes only;
- dry-run computes CREATE/UPDATE/UNCHANGED/REJECTED against the approved synthetic target without target mutation;
- only explicit Commit may request authoritative mutation;
- commit execution occurs asynchronously through the existing durable PostgreSQL-backed Worker path;
- every eligible row is committed in its own Application/repository transaction;
- rejected/failed rows do not roll back independent successful rows;
- any rejected/failed row prevents an all-success terminal status.

## 4. Source safety and technical limits

Frozen R3 engineering limits are enforced:

- source formats: CSV and XLSX;
- source size maximum: 10 MiB;
- parsed row maximum: 5000;
- create/commit idempotency retention: 24 hours;
- page size maximum: 100.

The source is private and never exposed as a public file path.

CSV handling:

- UTF-8 only;
- bounded row/header shape;
- quoted-field parsing;
- binary NUL rejection.

XLSX handling treats the workbook as untrusted ZIP/XML data:

- encrypted/multi-disk/ZIP64 archives rejected;
- path traversal and unsafe entry names rejected;
- only stored/deflate compression accepted;
- per-entry and aggregate decompression limits enforced;
- macro/binary workbook content rejected;
- XML DOCTYPE/ENTITY declarations rejected;
- formulas are never evaluated; a formula is surfaced only as inert text for validation.

These safeguards are demo engineering controls, not insurer business rules.

## 5. Mapping and validation

Mapping is server allowlisted and cannot introduce SQL, executable code, arbitrary fields or dynamic database targets.

The synthetic fixture requires mappings for:

- `externalReference`;
- `label`;

and optionally accepts:

- `classification`.

Technical bounds:

- external reference: maximum 80, stable technical reference alphabet;
- label: required, maximum 160;
- classification: optional, maximum 80;
- duplicate external references within one source are rejected at validation.

No raw spreadsheet value is promoted to a real insurer/customer policy rule.

## 6. Architecture

### Domain

`packages/domain/src/import-job.ts` owns framework-independent ImportJob/ImportRow lifecycle state and transition legality.

### Application

`packages/application/src/governed-imports.ts` owns:

- least-privilege authorization;
- source/import-type technical validation;
- mapping allowlist;
- optimistic concurrency;
- idempotency;
- preview/validation/dry-run no-mutation rules;
- row-partial commit orchestration;
- audit intent and sanitized projections.

### Infrastructure

`packages/infrastructure/src/import-adapters.ts` owns private file storage and CSV/XLSX parsing.

`packages/infrastructure/src/import-store.ts` provides Memory and PostgreSQL adapters behind the same Application port.

PostgreSQL commit semantics keep each independent row in its own transaction. ImportJob lifecycle transitions, durable audit and async-job creation use explicit transactions and optimistic guards. Target updates also verify the affected-row count so a concurrent target-version change becomes an explicit `IMPORT_TARGET_CONCURRENCY_CONFLICT` instead of a false success.

### Presentation

`apps/api/src/import-controller.ts` implements only the frozen REST surface, JWT boundary, multipart handling, request validation, request correlation and established R3 rate limits:

- protected reads: 120/min/principal;
- import upload: 5/min/admin;
- lifecycle writes: 30/min/admin.

### Worker

`apps/worker/src/worker.ts` recognizes durable `COMMIT_IMPORT_JOB` work and invokes `GovernedImportsApplication`; it does not perform Prisma business mutation directly.

## 7. Persistence

`prisma/contract.prisma` adds:

- `ImportJob`;
- `ImportRow`;
- `SyntheticImportReference`;
- the ImportJob/row lifecycle enums.

Forward migration:

- `prisma/migrations/20260909_10_governed_imports_r3.sql`

Guarded rollback:

- `prisma/migrations/20260909_10_governed_imports_r3.rollback.sql`

The rollback refuses destructive removal if any ImportJob, row outcome or synthetic target record exists.

Database foreign keys preserve the synthetic target's source ImportJob/ImportRow provenance.

## 8. Idempotency and async commit

`createImportJob` and `commitImportJob` use the established 24-hour HTTP idempotency behavior:

- same key + same fingerprint replays the original logical response;
- same key + different fingerprint returns `IDEMPOTENCY_KEY_REUSED`;
- in-progress reuse returns `IDEMPOTENCY_IN_PROGRESS`.

Commit request atomically:

1. moves the ImportJob to `COMMITTING` using `expectedVersion`;
2. creates durable async job `COMMIT_IMPORT_JOB`;
3. writes `IMPORT_COMMIT_REQUESTED` audit;
4. completes the idempotency record.

The Worker leases that job through the existing AsyncOperations Application boundary and marks it successful only after the ImportJob reaches `COMPLETED` or `COMPLETED_WITH_ERRORS`.

## 9. Audit

Durable event codes used:

- `IMPORT_JOB_CREATED`;
- `IMPORT_DRY_RUN_COMPLETED`;
- `IMPORT_COMMIT_REQUESTED`;
- `IMPORT_COMMIT_COMPLETED`;
- `IMPORT_COMMIT_FAILED` when orchestration fails.

Human lifecycle events use `ADMINISTRATOR`; terminal Worker execution uses `SYSTEM`.

Audit metadata is deliberately aggregate/sanitized. It records technical identity, counts, import type/media and commit policy where applicable. Raw row values are not duplicated into audit metadata.

## 10. Verification coverage

`tests/application/governed-imports.test.ts` covers:

- least privilege;
- create/commit idempotency;
- optimistic concurrency;
- mapping allowlist;
- preview/validation/dry-run non-mutation;
- duplicate/invalid row behavior;
- row-partial commit;
- terminal counts/outcomes;
- audit event sequence and raw-row exclusion;
- XLSX formulas treated as inert text;
- macro/binary and unsupported source rejection.

`tests/api/governed-imports.test.ts` covers all nine frozen REST operations, including multipart create, RFC 9457 error codes, pagination/rows, exact 200/201/202 contracts, replay header and a real in-memory Worker tick.

`tests/application/async-worker.test.ts` includes explicit `COMMIT_IMPORT_JOB` dispatch coverage while preserving existing Automation/Integration worker behavior.

`qa/governed-imports-runtime-qa.ts` executes the complete REST lifecycle against the real PostgreSQL runtime, invokes the actual Worker adapter and verifies the terminal API projection.

`qa/governed-imports-audit-assertions.sql` verifies persisted job/row/target state, source provenance, durable async completion, idempotency records, exact audit actor/request correlation and absence of raw row content in audit metadata.

## 11. Explicit exclusions

This increment does not implement or claim:

- real insurer/FAR imports or data;
- Customer/Policy/Claim spreadsheet schemas;
- a generic database/table importer;
- arbitrary mapping targets;
- arbitrary SQL/code/executable spreadsheet behavior;
- cross-row atomic import types;
- an ImportJob cancellation endpoint not present in the frozen inventory;
- Renewals;
- Collections;
- Custom Fields;
- Bulk Operations;
- changes to frozen `documentation/api/r3/**`;
- changes to Blueprint Master;
- tag, release or publication.

## 12. Machine verification

Verified pre-compaction implementation candidate SHA:

`e97a806e80514fa2a58b7863cafee2fdc95ff968`

Machine evidence on that candidate:

- Prisma contract emit: PASS;
- TypeScript typecheck: PASS;
- backend tests: **60/60 PASS**;
- architecture conformance: PASS — 9 Domain files, 19 Application files, REST Presentation, Worker adapter/composition, MCP Presentation and legacy DTO boundaries;
- production build: PASS;
- PostgreSQL governed-import runtime QA: PASS (`GOVERNED_IMPORTS_RUNTIME_QA_PASS`);
- governed-import persistence/audit SQL assertions: PASS (`GOVERNED_IMPORTS_QA_AUDIT_ASSERTIONS_PASS`);
- production dependency audit in API QA: 0 high, 0 critical;
- web tests: 11/11 PASS;
- web release build: PASS;
- production dependency audit in Release Gate Evidence: 0 vulnerabilities.

Successful exact-candidate workflows included:

| Workflow | Run | Result |
|---|---:|---|
| API Implementation #341 | `34383135706` | SUCCESS |
| API QA #304 | `34383135856` | SUCCESS |
| OpenAPI Validation #324 | `34383135846` | SUCCESS |
| OpenAPI Post-MVP R2 #99 | `34383135848` | SUCCESS |
| Postman Contract #311 | `34383135756` | SUCCESS |
| Integration QA - Web Slices #202 | `34383135716` | SUCCESS |
| Operations Observability Evidence #181 | `34383135813` | SUCCESS |
| Design System #281 | `34383135818` | SUCCESS |
| Interface Inventory #286 | `34383135728` | SUCCESS |
| Functional Slice - Claims Backoffice Web #209 | `34383135835` | SUCCESS |
| Functional Slice - Customer Claim Tracking Web #222 | `34383135739` | SUCCESS |
| Functional Slice - Digital Claim Intake Web #254 | `34383135934` | SUCCESS |

The three inherited readiness locks remained expected failures and were not changed:

- Release Gate Ready State #187 — `34383135899` — FAILURE;
- Operations State #176 — `34383135834` — FAILURE;
- Visual Functional Review Ready - Web #182 — `34383135838` — FAILURE.

`Release Gate Evidence #194` (`34383135802`) reached PASS for its release prerequisites, backend/web typechecks, 60/60 backend tests, architecture check, 11/11 web tests, web build and production dependency audit, then failed while running `apt-get update` because the hosted runner received an external Google Chrome APT repository `Hash Sum mismatch`. The PostgreSQL service itself was healthy. No project source, test, architecture, schema or dependency check failed in that run. This infrastructure-only result is not treated as final compact-head evidence and is not used to weaken or bypass the gate.

Final readiness still requires a fresh exact compact-head matrix with all substantive workflows green and only the three inherited readiness locks failing. Machine success will not authorize merge, tag, release or publication.

## 13. Human gate

After final compact-head verification, merge requires a separate explicit human decision for the exact PR number.
