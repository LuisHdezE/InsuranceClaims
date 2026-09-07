# Operations Observability Evidence

- Evidence ID: `EVD-OPERATIONS-OBSERVABILITY-001`
- Blueprint baseline: `0.5.2`
- Canonical check: `operations.observability`
- Verification type: `evidence`
- Result: `PASS`
- Machine-tested commit: `175dd7ed599954c48487193489c4c842662e955a`
- Successful workflow run: `34102498663`
- Workflow: `Operations Observability Evidence`
- Artifact ID: `10011061257`
- Artifact: `operations-observability-175dd7ed599954c48487193489c4c842662e955a`
- Artifact digest: `sha256:c97e5a298cc74c4cf87da169be5c33cdee39fb031853f247fade4baaedbeec3e`

## Canonical basis

Blueprint 0.5.2 defines `operations` as the final **Operations & Maintenance** phase and defines one REQUIRED check for that phase: `operations.observability`. It does not define a separate Operations gate.

## Runtime proof

The successful workflow provisioned the real MVP composition used by prior QA evidence:

- PostgreSQL 18;
- simulated legacy HTTP dependency;
- production NestJS API composition;
- synthetic operator and ephemeral secrets.

It then proved:

1. `GET /health/live` returns the expected liveness contract.
2. `GET /health/ready` returns the declared MVP readiness contract.
3. valid caller `X-Request-Id` values are preserved and echoed;
4. invalid caller request IDs are replaced by UUIDv4 correlation IDs;
5. RFC 9457 Problem Details preserves request correlation and does not expose SQL/runner-path detail;
6. the complete API runtime QA suite still passes on the same composition;
7. durable PostgreSQL audit assertions preserve request-ID correlation for claim creation, transitions and successful/failed authentication;
8. generated synthetic operator password and JWT secret do not appear in API/legacy service logs;
9. machine evidence is emitted and uploaded as a CI artifact.

## Existing implementation evidence reused

The operational proof exercises already-approved implementation rather than introducing new product behavior:

- `RequestIdMiddleware` validates/generates correlation IDs and returns `X-Request-Id`;
- Problem Details includes `requestId` and sanitizes client error detail;
- unhandled API errors use structured JSON event `UNHANDLED_API_ERROR` with request ID;
- `/health/live` and `/health/ready` remain the approved operational endpoints;
- durable `audit_events` remain distinct from technical application logs.

## Operating boundary

This evidence is intentionally bounded to the repository-local MVP/case-study environment. It does **not** claim FAR production monitoring infrastructure, centralized log aggregation, on-call coverage, SLO/SLA commitments, production alerting thresholds, production backup schedules, HA/replication, RPO/RTO or disaster-recovery topology.

The operational procedure and triage boundary are documented in `documentation/operations/OPERATIONS_RUNBOOK.md`.

## Product drift

No product, API contract, persistence schema, UI capability or permission behavior was modified to satisfy this check. Operations evidence only operationalizes and revalidates observability capabilities already present in the accepted/released MVP.

## Completion statement

`operations.observability = PASS` is supported by executable runtime evidence. Because Blueprint 0.5.2 defines no separate Operations gate or mandatory human acceptance for this phase, the phase may be recorded `COMPLETE / 100%` once the repository checkpoint and permanent validator agree with this evidence. Merge remains governed separately by the normal human Git/PR decision.
