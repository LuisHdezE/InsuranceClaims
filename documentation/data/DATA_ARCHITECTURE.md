# Data Architecture and Migration Plan — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Status: READY_FOR_REVIEW

> The schema below is for this synthetic public case study only. It is not inferred from or attributed to FAR Seguros.

---

## 1. Authoritative data ownership

### PostgreSQL 18: authoritative modern workflow store

PostgreSQL is authoritative for:

- modern claims;
- claim status history;
- evidence metadata;
- demo Claims Operator identities and password hashes;
- idempotency records;
- durable business/security audit records.

### SIMULATED LEGACY SYSTEM: authoritative only for synthetic policy/vehicle verification

The legacy simulator owns only its synthetic policy/vehicle reference dataset and eligibility response used by `PolicyVerificationPort`.

The modern system may persist a normalized snapshot/reference on a claim to preserve what was verified at creation time, but that snapshot does not become the authority for future policy validity.

### Private evidence volume

Raw synthetic evidence bytes are stored by `EvidenceStoragePort` in a private filesystem-backed location for the MVP. PostgreSQL stores metadata and server-generated storage keys, not file bytes.

---

## 2. Database principles

- PostgreSQL 18 major line, current supported minor at implementation time.
- Prisma ORM 8 lives only in Infrastructure.
- snake_case physical SQL naming is preferred; domain/application names remain idiomatic TypeScript.
- UUID identifiers for internal entities unless a stronger use-case need emerges.
- opaque public tracking codes are separate from claim UUIDs.
- UTC timestamps (`timestamptz`).
- no soft-delete requirement for claims/audit in the first release.
- append-oriented history/audit tables.
- foreign keys enforce referential integrity.
- uniqueness/indexes support idempotency and public tracking without exposing sequential IDs.

---

## 3. Logical schema

### 3.1 `operators`

Purpose: authenticated synthetic Claims Operator identities.

| Column | Type | Constraints / intent |
|---|---|---|
| `id` | uuid | PK |
| `login` | varchar(160) | unique, normalized synthetic login |
| `password_hash` | text | required, never returned publicly |
| `role` | varchar(40) | required, first release value `CLAIMS_OPERATOR` |
| `is_active` | boolean | default true |
| `created_at` | timestamptz | required |
| `updated_at` | timestamptz | required |

Indexes:

- unique index on normalized `login`.

### 3.2 `claims`

Purpose: authoritative modern Claim aggregate persistence.

| Column | Type | Constraints / intent |
|---|---|---|
| `id` | uuid | PK, internal |
| `tracking_code` | varchar(80) | unique, opaque public reference |
| `policy_reference` | varchar(80) | required synthetic reference |
| `vehicle_reference` | varchar(80) | required synthetic reference |
| `verified_customer_label` | varchar(160) | nullable/minimized synthetic display snapshot |
| `event_type` | varchar(60) | required, final allowed values defined with Domain implementation |
| `occurred_at` | timestamptz | required |
| `location_text` | varchar(300) | required |
| `description` | text | required, bounded by API validation |
| `status` | varchar(40) | required, Domain-approved lifecycle value |
| `created_at` | timestamptz | required |
| `updated_at` | timestamptz | required |

Constraints/indexes:

- unique `tracking_code`;
- index on `status`;
- index on `created_at`;
- composite index on (`policy_reference`, `tracking_code`) for public tracking proof lookup;
- status check constraint may mirror the approved lifecycle values if Prisma migration support is clean; Domain remains authoritative for transition legality.

### 3.3 `claim_status_history`

Purpose: append-only workflow history/timeline.

| Column | Type | Constraints / intent |
|---|---|---|
| `id` | uuid | PK |
| `claim_id` | uuid | FK -> claims.id, required |
| `from_status` | varchar(40) | nullable for initial record |
| `to_status` | varchar(40) | required |
| `actor_type` | varchar(40) | `SYSTEM` or `OPERATOR` for MVP |
| `actor_id` | uuid | nullable; operator FK/reference when applicable |
| `occurred_at` | timestamptz | required |

Indexes:

- (`claim_id`, `occurred_at`).

Application exposes only the customer-safe projection to public tracking/MCP.

### 3.4 `claim_evidence`

Purpose: metadata for privately stored evidence.

| Column | Type | Constraints / intent |
|---|---|---|
| `id` | uuid | PK |
| `claim_id` | uuid | FK -> claims.id, required |
| `storage_key` | varchar(255) | unique server-generated key |
| `media_type` | varchar(80) | allowlisted JPEG/PNG/PDF |
| `size_bytes` | bigint | required, <= 5 MiB enforced by Application/adapter |
| `display_filename` | varchar(255) | sanitized optional display value |
| `created_at` | timestamptz | required |

Indexes:

- index on `claim_id`;
- unique `storage_key`.

No raw file path supplied by the user is stored as authority.

### 3.5 `idempotency_records`

Purpose: prevent duplicate retry of high-risk claim submission.

| Column | Type | Constraints / intent |
|---|---|---|
| `id` | uuid | PK |
| `scope` | varchar(80) | e.g. claim submission operation scope |
| `idempotency_key_hash` | varchar(128) | hash of external key, not secret raw value |
| `request_fingerprint` | varchar(128) | stable hash of canonical relevant request identity |
| `status` | varchar(30) | `IN_PROGRESS` / `COMPLETED` / `FAILED_RETRYABLE` as implementation needs |
| `claim_id` | uuid | nullable FK -> claims.id |
| `response_reference` | text/jsonb | minimal replay metadata, no evidence bytes/secrets |
| `created_at` | timestamptz | required |
| `expires_at` | timestamptz | required |

Constraint:

- unique (`scope`, `idempotency_key_hash`).

Exact external header/key semantics are frozen at API Contract Ready.

### 3.6 `audit_events`

Purpose: durable append-oriented business/security accountability.

| Column | Type | Constraints / intent |
|---|---|---|
| `id` | uuid | PK |
| `event_code` | varchar(80) | required stable code |
| `occurred_at` | timestamptz | required |
| `actor_type` | varchar(40) | required |
| `actor_id` | varchar(100) | nullable/minimized synthetic actor reference |
| `target_type` | varchar(60) | nullable |
| `target_id` | varchar(100) | nullable |
| `outcome` | varchar(30) | `SUCCESS` / `FAILURE` |
| `request_id` | varchar(100) | nullable correlation reference |
| `metadata` | jsonb | sanitized allowlisted metadata only |
| `created_at` | timestamptz | required |

Indexes:

- (`event_code`, `occurred_at`);
- (`target_type`, `target_id`, `occurred_at`);
- `request_id`;
- `actor_id` where useful.

No normal application update/delete use case is defined for this table.

---

## 4. Claim lifecycle persistence

Approved persisted status values:

```text
RECEIVED
UNDER_REVIEW
OBSERVED
APPROVED
IN_REPAIR
CLOSED
```

Database validation may reject unknown values, but only Domain behavior decides whether one known state may transition to another known state.

Every claim creation creates the first history record:

```text
NULL -> RECEIVED
```

Every successful administrative transition appends exactly one new history entry within the same modern database transaction as the claim status update and required audit event.

---

## 5. Transaction design

### 5.1 Claim submission

Sequence intent:

1. Application validates input.
2. Application invokes `PolicyVerificationPort` and receives eligible normalized context.
3. Application resolves idempotency identity.
4. Evidence adapter writes permitted files to temporary/private storage using server keys.
5. PostgreSQL transaction persists:
   - idempotency reservation/final state as appropriate;
   - Claim;
   - evidence metadata;
   - initial status history;
   - `CLAIM_CREATED` audit event.
6. Transaction commits.
7. On failure, Infrastructure performs best-effort cleanup of newly staged orphan evidence.

Implementation may refine the staging sequence, but must preserve these invariants:

- no duplicate claim on idempotent replay;
- no accepted claim without server legacy verification;
- no committed evidence metadata pointing to unaccepted raw user path;
- no successful claim creation without initial history and durable audit.

### 5.2 State transition

Single PostgreSQL transaction:

1. load current Claim;
2. Domain validates requested transition;
3. update current status;
4. append history;
5. append `CLAIM_STATE_TRANSITIONED` audit;
6. commit.

No partial success.

---

## 6. Migration strategy

Migrations are repository-owned, deterministic and applied through Prisma migration tooling from Infrastructure.

Rules:

- migrations are forward-only in normal shared history;
- destructive reset is allowed only in explicitly documented disposable local/demo environments;
- schema changes after API/client baselines require Blueprint impact review when behavior/contract may change;
- seed data is separate from migration history;
- migration execution is part of Docker startup/CI validation, not hidden manual SQL.

Planned initial migration chain:

```text
001_create_operators
002_create_claims
003_create_claim_status_history
004_create_claim_evidence
005_create_idempotency_records
006_create_audit_events
007_add_indexes_and_constraints
```

Prisma may combine these into generated timestamped migration directories during implementation. The logical order above is the approved architecture contract.

### Rollback philosophy

- no production-style automatic down migrations are required for this portfolio MVP;
- local disposable environments can reset/reapply from zero;
- release rollback uses application/image revision plus database compatibility planning, not blind reverse DDL;
- before a future destructive migration, create explicit backup/restore and migration plan evidence.

---

## 7. Seed strategy

Synthetic seeds shall provide:

### Legacy simulator

- at least two synthetic policies/vehicles;
- at least one valid/eligible pair;
- at least one invalid or mismatched path;
- no real names, IDs, phones, national IDs or claim data.

### Modern PostgreSQL

- one synthetic Claims Operator;
- several claims across multiple lifecycle states after seed/demo execution;
- corresponding status histories;
- safe synthetic evidence metadata/fixtures when useful;
- audit records only when they represent intentional seeded/demo history and are clearly synthetic.

Seed credentials are demo-only and must not masquerade as production credentials.

---

## 8. Private evidence storage

Architecture choice: local filesystem adapter behind `EvidenceStoragePort` for mandatory MVP.

Storage semantics:

```text
/private-evidence/<generated-prefix>/<generated-key>
```

The exact physical path is Infrastructure configuration and never appears in public API output.

Rules:

- storage key generated by server;
- no path components from raw filename;
- evidence directory not served as static web content;
- retrieval occurs through authorized Application/REST flow;
- Docker uses named volume;
- Kubernetes proof uses a local-demo persistent volume strategy or documented ephemeral limitation.

Cloud object storage is deferred.

---

## 9. Legacy simulator data model

The simulator intentionally uses its own synthetic contract and storage representation.

It may use an in-memory/static repository-owned JSON fixture because its purpose is integration/coexistence demonstration, not independent data-platform complexity.

Conceptual records:

```text
legacy_policy_record
- policy_no
- vehicle_ref
- active_flag (Y/N)
- holder_label
- coverage_hint
```

These field names are invented for the simulator and must be labelled as such. They never become modern Domain entities.

---

## 10. Data access boundaries

Allowed:

- Infrastructure Prisma repositories -> PostgreSQL;
- Infrastructure legacy adapter -> simulator HTTP;
- Infrastructure evidence adapter -> private storage.

Forbidden:

- REST controller -> Prisma;
- MCP handler -> Prisma;
- React -> PostgreSQL;
- Domain/Application -> Prisma types/client;
- web/MCP -> simulator directly;
- legacy simulator -> modern PostgreSQL.

Architecture tests must prove these boundaries where import graphs can enforce them.

---

## 11. Concurrency and consistency

MVP concurrency strategy:

- claim submission protected by persisted idempotency identity;
- state transition uses transactional update and must guard against stale concurrent writes;
- preferred implementation uses optimistic concurrency (`updated_at`/version check) or transaction locking supported cleanly by the chosen Prisma/PostgreSQL path;
- conflicting concurrent transition returns a conflict-style Application outcome to be mapped in API Contract.

The exact HTTP status/code belongs to API Contract Design.

---

## 12. Data retention outside audit

Because this is a disposable synthetic portfolio demo, no insurer regulatory retention period is asserted.

Operational defaults:

- claim/demo database persists until explicit environment reset;
- evidence persists with the demo environment until explicit cleanup/reset;
- idempotency records may expire after a bounded operational period (target 24 hours unless API Contract/implementation evidence justifies another value);
- audit retention is defined separately in the Audit Model.

---

## 13. Backup/restore posture

For the MVP architecture phase:

- Docker/local PostgreSQL data uses a named volume;
- demo reset/reseed must be documented;
- a simple `pg_dump`/`pg_restore` operational proof may be added before Release Gate if release backup/restore becomes applicable;
- no production HA/replication claim is made.

---

## 14. Schema-to-requirement traceability

| Table/store | Requirement coverage |
|---|---|
| `claims` | FR-003, FR-005, FR-007, FR-008, FR-010..FR-012 |
| `claim_status_history` | FR-005, FR-008, FR-011, FR-013, AC-009, AC-018 |
| `claim_evidence` + private storage | FR-004, FR-011, BR-010, NFR-005 |
| `operators` | FR-009, NFR-002 |
| `idempotency_records` | FR-006, AC-005 |
| `audit_events` | FR-013, FR-017, FR-018, NFR-007, AC-014 |
| legacy simulator fixture | FR-001, FR-002, FR-015, BR-008, AC-013 |

---

## 15. Data readiness mapping

This artifact provides evidence for:

- `data.architecture`
- `data.schema_migrations`
- `data.authoritative_database`

Actual migration files, Prisma schema/client and runtime verification belong to implementation. This design artifact freezes the required tables, ownership, migration intent and transaction invariants before API implementation begins.