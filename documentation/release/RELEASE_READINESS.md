# Release Readiness — Insurance Claims Legacy Modernization MVP

Date: 2026-09-06
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Release Gate status: CANDIDATE / HUMAN DECISION PENDING

## 1. Release identity

This release candidate is the portfolio MVP represented by the three committed web interface slices:

- `digital-claim-intake/web`
- `customer-claim-tracking/web`
- `claims-backoffice/web`

All three have completed Functional Definition of Done, Visual & Functional Review, Integration QA and explicit Human Acceptance. Their canonical lifecycle is `ACCEPTED`.

The release also includes the supporting REST API, MCP presentation, PostgreSQL persistence adapter, private synthetic evidence adapter and the separate simulated legacy HTTP dependency required by those slices.

## 2. Blueprint Release Gate mapping

| Check | Applicability | Candidate evidence |
|---|---|---|
| `release.functional_slices_accepted` | REQUIRED | Three `.blueprint/functional-slices/*.json` artifacts are `ACCEPTED`, with Human Acceptance `APPROVED`, V&F `PASS`, Integration QA `PASS`, DoD `PASS` and no blocker. |
| `release.security_accepted` | REQUIRED | Approved threat/security model, API security QA, scoped Integration QA `qa.security`, server-authoritative authorization and exact-head production dependency audit. |
| `release.documentation` | REQUIRED | This release guide, repository README, architecture, data, security, API/OpenAPI/Postman and accepted-slice evidence are versioned and linked. |
| `release.backup_restore` | CONDITIONAL → APPLICABLE | PostgreSQL is authoritative state for the MVP. `qa/release-backup-restore.sh` performs an ephemeral `pg_dump`/`pg_restore` proof without claiming a FAR production backup policy. |

A machine-successful candidate stops at `READY_FOR_REVIEW`. CI cannot infer the human Release Gate decision.

## 3. Security acceptance aggregation

Release security acceptance is not a new security design exercise. It aggregates already-approved and still-valid evidence:

- `documentation/security/SECURITY_THREAT_MODEL.md`
- `documentation/architecture/ARCHITECTURE.md`
- `documentation/api/API_QA_EVIDENCE.md`
- `documentation/integration-qa/INTEGRATION_QA_WEB_SYSTEM_EVIDENCE.md`
- `.blueprint/status.yaml` checks including `architecture.security_model`, `architecture.threat_model`, `api.security_qa` and `qa.security`

The Release Gate workflow additionally executes `npm audit --omit=dev --audit-level=high`. High or critical production dependency findings fail the release candidate.

No security control is delegated to React. Operator authorization remains API/Application authoritative, public tracking remains proof-bound, synthetic evidence download remains protected, and the web client does not bypass the REST boundary.

## 4. Recoverability proof

`release.backup_restore` is applicable because PostgreSQL stores authoritative modern workflow state.

The proof is deliberately scoped to this public portfolio MVP:

1. create an ephemeral PostgreSQL source database;
2. apply the repository-owned QA schema;
3. insert linked synthetic sentinel records covering operators, claims, status history, evidence metadata, idempotency and audit;
4. create a custom-format `pg_dump`;
5. restore it into a distinct empty database with `pg_restore`;
6. verify exact table row counts and sentinel business identifiers after restore.

This proves basic dump/restore recoverability for the repository schema. It does **not** claim production RPO/RTO, scheduled backups, HA, replication, insurer infrastructure or disaster-recovery operations.

Raw evidence bytes use a local private filesystem adapter in the MVP. The Release Gate proof does not pretend that filesystem adapter is a production object-storage backup solution.

## 5. Reproducible verification

Repository verification commands:

```bash
npm ci
npm run contract:emit
npm run typecheck
npm test
npm run architecture:check
npm --workspace @insurance/web test
npm --workspace @insurance/web run build
npm audit --omit=dev --audit-level=high
```

The heavy Integration QA workflow separately validates the composed runtime over PostgreSQL + simulated legacy + API + React/Chrome.

## 6. Runtime configuration

`.env.example` is the canonical safe configuration template. Real secrets are never committed.

Important variables:

- `DATABASE_URL`
- `LEGACY_SIMULATOR_URL`
- `JWT_SECRET`
- `EVIDENCE_STORAGE_DIR`
- synthetic demo operator login/password

## 7. Rollback and reset posture

This MVP does not define blind reverse database migrations.

Repository-defined posture:

- application rollback means returning to a previously validated application revision while respecting database compatibility;
- disposable local/demo databases may be reset and re-seeded;
- destructive future migrations require explicit impact, backup/restore and migration evidence before release;
- current Release Gate validates dump/restore mechanics for the existing schema only.

## 8. Known intentional limitations

The release does not claim:

- FAR production infrastructure or internal workflows;
- real insurer/customer data;
- regulatory retention periods;
- production HA, replication, autoscaling or DR topology;
- production object storage;
- production Kubernetes implementation merely because a capability may be declared in Blueprint metadata.

Legacy coexistence is simulated. All test/demo records are synthetic.

## 9. Release decision boundary

Machine validation may establish `READY_FOR_REVIEW`, but `release_gate = PASS` requires the project's explicit human gate decision under the same Git/PR governance used throughout this MVP.

Operations & Maintenance remains downstream and is not automatically started by Release Gate preparation.
