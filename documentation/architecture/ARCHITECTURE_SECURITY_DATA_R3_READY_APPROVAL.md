# Architecture + Security + Data R3 — Ready Approval

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Requirements R3:** APPROVED + MERGED via PR #35  
**Architecture/Security/Data review PR:** #36  
**Decision date:** 2026-09-08  
**Human approver:** Luis Hernández  
**Decision:** APPROVED

## Human decision

Luis Hernández explicitly approved the semantic Architecture + Security + Data R3 gate with:

`Apruebo Architecture Security Data Ready R3`

This approval accepts the R3 architecture/security/data/audit package represented by:

- `documentation/architecture/INSURANCE_OPERATIONS_ARCHITECTURE_R3.md`
- `documentation/data/DATA_ARCHITECTURE_R3.md`
- `documentation/security/SECURITY_THREAT_MODEL_R3.md`
- `documentation/audit/AUDIT_MODEL_R3.md`
- `documentation/architecture/ARCHITECTURE_SECURITY_DATA_R3_REVIEW.md`

## Approved invariants

The approval confirms, at minimum:

1. Claim lifecycle remains Domain/server authoritative.
2. ClaimTask lifecycle remains separate from Claim lifecycle.
3. Pipeline is a versioned operational projection and does not replace domain authority.
4. Existing work items remain pinned to the configuration version they use.
5. PostgreSQL remains authoritative for the modern workflow and backs durable outbox/jobs/retry/dead-letter execution.
6. `apps/worker` is an execution adapter that invokes Application and has no independent business authority.
7. Staff and Customer Portal authentication contexts are separate and non-interchangeable.
8. Inbound integration events require HMAC authentication plus validation, replay protection and idempotency.
9. Automation is constrained to approved versioned rules/actions and cannot execute arbitrary code, SQL, shell commands or unrestricted HTTP.
10. Customer/Policy modern records do not replace the historical legacy eligibility verification requirement.
11. External communication delivery remains simulated/demo in R3.
12. Import preview/validation/dry-run cannot mutate authoritative state; Commit is explicit and row-partial only for independent rows with per-row outcomes.
13. Bulk actions preserve per-item authorization, validation and concurrency semantics.
14. Historical v0.1.0/v0.2.0 evidence and `api-v1-r1` / `api-v1-r2` remain immutable.

## Blueprint gate meaning

This decision marks the Architecture + Security + Data R3 semantic package as **READY / APPROVED for progression to the next governed phase after merge**.

It covers the design intent needed for:

- `architecture.domain_model`
- `architecture.decision_records`
- `architecture.security_model`
- `architecture.threat_model`
- `data.architecture`
- `data.schema_migrations`
- `data.authoritative_database`
- `audit.event_catalog`
- `audit.retention_policy`
- `api.auth_strategy`
- `api.error_contract`
- `api.versioning_policy`

## What this approval does NOT authorize

This approval does **not** authorize:

- merging PR #36;
- endpoint paths;
- `operationId` values;
- request/response schemas;
- concrete API status/error mappings;
- exact throttling/batch/header values;
- Prisma schema changes or migrations;
- controllers, worker code or other product implementation;
- OpenAPI/Postman updates;
- UI implementation;
- modification of Blueprint Master.

Merge of PR #36 remains a separate explicit human gate.

After merge and verification of `main`, the next governed phase is **API Contract R3 Design**.
