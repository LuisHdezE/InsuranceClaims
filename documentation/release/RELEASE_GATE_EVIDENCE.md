# Release Gate Evidence

Evidence ID: `EVD-RELEASE-GATE-001`
Blueprint: 0.5.2
Gate: `release_gate`
Candidate baseline: `ba7f519f36567b142604e213f50e13de4732348d`
Human gate decision: PENDING

## Candidate assertions

### `release.functional_slices_accepted`

The release scope is exactly:

1. `digital-claim-intake/web`
2. `customer-claim-tracking/web`
3. `claims-backoffice/web`

Each canonical slice artifact must remain:

- `lifecycle_status = ACCEPTED`
- `definition_of_done.status = PASS`
- `visual_functional_review.status = PASS`
- `visual_functional_review.human_complete = true`
- `integration_qa.status = PASS`
- `human_acceptance.status = APPROVED`
- `blocker = null`

### `release.security_accepted`

Release security aggregates the already-approved architecture/security and runtime evidence and requires the current candidate to preserve:

- architecture security model PASS;
- threat model PASS;
- API security QA PASS;
- Integration QA security PASS;
- visual/API permission fidelity PASS;
- production dependency audit with no high/critical findings at release validation time.

No new product/security capability is invented by this gate.

### `release.documentation`

The release documentation set includes:

- root `README.md` with scope, setup, verification, runtime and limitations;
- `documentation/release/RELEASE_READINESS.md`;
- architecture, data, threat/security and audit models;
- API contract + OpenAPI + Postman artifacts;
- Interface Inventory / Design System / Client Architecture documentation;
- Functional Slice, V&F, Integration QA and Human Acceptance evidence.

### `release.backup_restore`

Applicable because PostgreSQL is authoritative modern persistence.

`qa/release-backup-restore.sh` proves `pg_dump`/`pg_restore` against an ephemeral PostgreSQL database using linked synthetic sentinels across operators, claims, status history, evidence metadata, idempotency and audit.

This evidence is deliberately **not** a claim about production HA, replication, RPO/RTO, backup scheduling or FAR infrastructure.

## Machine validation

The Release Gate evidence workflow must pass on the exact candidate head before the gate can become `READY_FOR_REVIEW`.

Machine success does not equal human Release Gate approval. The gate remains pending until Luis Hernández explicitly approves Release Gate under the established project governance.
