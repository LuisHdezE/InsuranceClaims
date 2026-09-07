# Release Gate Evidence

Evidence ID: `EVD-RELEASE-GATE-001`
Blueprint: 0.5.2
Gate: `release_gate`
Accepted pre-release baseline: `ba7f519f36567b142604e213f50e13de4732348d`
Machine-tested candidate: `22ae0618cf865a8c940a2c9c3c243a1830cd4d97`
Workflow: `Release Gate Evidence`
Successful run: `34077824586`
Job: `101607289930`
Human gate decision: PENDING

## Candidate assertions

### `release.functional_slices_accepted`

The release scope is exactly:

1. `digital-claim-intake/web`
2. `customer-claim-tracking/web`
3. `claims-backoffice/web`

Each canonical slice artifact remained:

- `lifecycle_status = ACCEPTED`
- `definition_of_done.status = PASS`
- `visual_functional_review.status = PASS`
- `visual_functional_review.human_complete = true`
- `integration_qa.status = PASS`
- `human_acceptance.status = APPROVED`
- `blocker = null`

### `release.security_accepted`

Release security aggregates the already-approved architecture/security and runtime evidence and requires the candidate to preserve:

- architecture security model PASS;
- threat model PASS;
- API security QA PASS;
- Integration QA security PASS;
- visual/API permission fidelity PASS;
- production dependency audit with no high/critical findings at release validation time.

Run `34077824586` executed `npm audit --omit=dev --audit-level=high` and reported **0 production vulnerabilities**. The broader development dependency tree warning emitted during `npm ci` is not represented as production exposure; the release check deliberately evaluates production dependencies.

No new product/security capability is invented by this gate.

### `release.documentation`

The release documentation set includes:

- root `README.md` with scope, setup, verification, runtime and limitations;
- `documentation/release/RELEASE_READINESS.md`;
- architecture, data, threat/security and audit models;
- API contract + OpenAPI + Postman artifacts;
- Interface Inventory / Design System / Client Architecture documentation;
- Functional Slice, V&F, Integration QA and Human Acceptance evidence.

The successful run also passed typecheck, 6/6 backend tests, architecture conformance, 11/11 web tests and the production web build.

### `release.backup_restore`

Applicable because PostgreSQL is authoritative modern persistence.

`qa/release-backup-restore.sh` proved `pg_dump`/`pg_restore` against an ephemeral PostgreSQL 18.6 service using version-matched PostgreSQL 18 dump/restore binaries. The proof inserted linked synthetic sentinels across operators, claims, status history, evidence metadata, idempotency and audit, restored into a distinct database, compared all six table counts, and re-read the claim/audit/idempotency sentinels.

Successful marker from run `34077824586`:

`RELEASE_BACKUP_RESTORE_PASS source=insurance_claims_release_source restore=insurance_claims_release_restore tables=6 pg_tools=postgres:18`

The first run (`34077639975`) was intentionally rejected because Ubuntu's default `pg_dump` 16 did not match PostgreSQL server 18.6. The harness was corrected to use the PostgreSQL 18 binaries from the running service container; no product or schema behavior was changed.

This evidence is deliberately **not** a claim about production HA, replication, RPO/RTO, backup scheduling or FAR infrastructure.

## Machine validation result

Run `34077824586` completed `SUCCESS` on exact candidate SHA `22ae0618cf865a8c940a2c9c3c243a1830cd4d97` and emitted:

- `release.functional_slices_accepted=PASS`
- `release.security_accepted=PASS`
- `release.documentation=PASS`
- `release.backup_restore=PASS`
- `release_gate=READY_FOR_REVIEW_PENDING_HUMAN_DECISION`

Machine success does not equal human Release Gate approval. The gate remains pending until Luis Hernández explicitly approves Release Gate under the established project governance.
