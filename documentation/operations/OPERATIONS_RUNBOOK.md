# Operations & Maintenance Runbook

## Scope

This runbook covers the repository-local operational baseline for the **Insurance Claims Legacy Modernization MVP** under Blueprint `0.5.2`.

It is a demonstrable MVP/case-study operating contract. It does **not** claim FAR production infrastructure, production monitoring vendors, on-call rotations, SLO/SLA commitments, production backup schedules, HA/replication, RPO/RTO or disaster-recovery topology.

## Canonical Blueprint requirement

The Operations & Maintenance phase has one REQUIRED canonical check for this baseline:

- `operations.observability`

There is no separate Operations gate in Blueprint 0.5.2. Release Gate must already be `PASS` before this operational baseline is treated as complete.

## Runtime components

- NestJS API: `http://127.0.0.1:3000`
- Simulated legacy dependency: `http://127.0.0.1:3200`
- PostgreSQL: authoritative modern workflow persistence
- React web client: API consumer only, never direct database access

All QA/runtime credentials and secrets are synthetic and ephemeral.

## Health signals

### Liveness

`GET /health/live`

Expected contract:

```json
{"status":"ok"}
```

Use liveness to prove that the API process can serve HTTP. It is not a dependency-health guarantee.

### Readiness

`GET /health/ready`

Expected MVP contract:

```json
{"status":"ok","components":{"process":"ready"}}
```

The current readiness endpoint explicitly reports the process component only. Do not interpret it as proof of a production database, object store, network or legacy-system health topology that the MVP does not define.

## Request correlation

The API uses `X-Request-Id` as its correlation boundary.

- A caller-supplied ID matching the allowlisted syntax is preserved.
- Invalid caller IDs are rejected as correlation input and replaced with a UUIDv4.
- The effective ID is returned in the `X-Request-Id` response header.
- RFC 9457 Problem Details responses include the same `requestId`.
- Critical application operations pass the request ID into durable audit behavior where the architecture contract requires it.

Operational triage should begin with the request ID from the client/error response and correlate it with audit evidence where applicable.

## Error observability and redaction

Expected behavior:

- classified failures return sanitized RFC 9457 Problem Details;
- internal SQL, runner paths, secrets and raw infrastructure details must not appear in client problem detail;
- unhandled API exceptions are logged as structured JSON with event `UNHANDLED_API_ERROR`, request ID, bounded error name and bounded error message;
- synthetic runtime checks reject leakage of the generated operator password or JWT secret into API/legacy service logs.

The MVP does not claim a centralized production log collector.

## Durable business/audit signals

PostgreSQL `audit_events` provides the durable audit plane defined by the approved architecture. Runtime QA proves correlation for, among others:

- `CLAIM_CREATED` with request ID;
- `CLAIM_STATE_TRANSITIONED` with request ID;
- `AUTH_LOGIN_SUCCEEDED` with request ID and success outcome;
- `AUTH_LOGIN_FAILED` with request ID and failure outcome.

Audit events are not interchangeable with technical application logs.

## Incident triage sequence

1. Capture route, timestamp and `X-Request-Id`/Problem Details `requestId`.
2. Check `/health/live` and `/health/ready` without assuming readiness covers undeclared production dependencies.
3. Inspect API/legacy runtime logs for transport or unhandled failures, preserving redaction rules.
4. For business mutations/authentication, correlate the request ID with durable audit records.
5. Reproduce only with synthetic/demo inputs in the repository QA environment.
6. If a failure indicates an API contract or product defect, return to the normal Blueprint change-impact and revalidation path rather than patching around the contract in Operations.

## Evidence workflow

`.github/workflows/operations-observability.yml` provisions PostgreSQL 18 plus the simulated legacy service and real API, then proves:

- liveness;
- readiness;
- valid request-ID propagation;
- replacement of invalid caller request IDs;
- Problem Details correlation and sanitization;
- the complete runtime QA flow;
- durable audit correlation invariants;
- absence of synthetic QA secrets in service logs.

Machine output is written to `.runtime/operations-observability.json` and uploaded as a short-retention CI artifact.

## Maintenance boundary

Operations & Maintenance is not permission to bypass prior gates. Any future product/API/auth/security/data change must use a new short-lived branch, impact analysis at the appropriate scope, exact-head CI and human governance. This runbook describes the accepted MVP baseline only.
