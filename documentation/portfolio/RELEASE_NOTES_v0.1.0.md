# Insurance Claims Legacy Modernization MVP — v0.1.0

## Release identity

- Package version: `0.1.0`
- Recommended Git tag after this portfolio PR is merged: `v0.1.0`
- Release name: `Insurance Claims Legacy Modernization MVP v0.1.0`
- Blueprint consumer baseline: `0.5.2`
- Delivery model: GREENFIELD modernization MVP with legacy coexistence `SIMULATED`
- Release Gate: `PASS`
- Operations: `COMPLETE / 100%`
- Accepted web slices: `3 / 3`

> Publication note: create the Git tag only from the verified `main` commit that contains these release notes. Do not tag the pre-portfolio baseline.

## Highlights

### Digital Claim Intake

- synthetic policy/vehicle eligibility verification through the legacy adapter;
- modern claim creation;
- evidence submission;
- idempotency protection;
- validation and resilient error handling.

### Customer Claim Tracking

- proof-bound claim lookup;
- customer-safe claim projection;
- invalid-proof handling;
- degraded/offline transport states.

### Claims Backoffice

- operator authentication;
- authorized claim listing and detail;
- protected evidence download;
- lifecycle transitions;
- RBAC enforcement;
- stale-state concurrency protection.

## Platform capabilities

- Node.js 24 + NestJS 12 + TypeScript backend;
- React 19 + Vite 7 + TypeScript frontend;
- PostgreSQL 18 as the authoritative modern workflow store;
- REST `/api/v1` with OpenAPI 3.1 and Postman contract coverage;
- separate read-only MCP claim-status presentation boundary;
- private synthetic evidence storage behind an application port;
- HTTP legacy simulator isolated behind a legacy eligibility adapter;
- executable architecture conformance checks.

## REST business operations

1. `verifyPolicyVehicle`
2. `createClaim`
3. `trackClaim`
4. `authenticateOperator`
5. `listClaims`
6. `getClaimDetail`
7. `downloadClaimEvidence`
8. `transitionClaimStatus`

Liveness and readiness routes are provided separately.

## Security and reliability

- short-lived JWT operator authentication;
- Argon2id password hashing;
- API-side RBAC and permission checks;
- `Idempotency-Key` protection for claim creation;
- expected-state concurrency protection for transitions;
- RFC 9457 Problem Details;
- request correlation and durable audit correlation;
- secret non-leakage and safe-error assertions;
- rate limiting;
- protected evidence access;
- PostgreSQL backup/restore proof using `pg_dump` and `pg_restore`;
- executable liveness, readiness and observability checks.

## Verification evidence

The MVP lifecycle includes executable evidence for:

- Domain/Application/API tests;
- architecture-boundary validation;
- OpenAPI validation;
- Postman contract validation;
- real PostgreSQL API QA;
- Chrome browser journeys;
- API transport fidelity;
- authorization/security behavior;
- responsive and accessibility behavior;
- degraded/offline behavior;
- idempotency and concurrency behavior;
- backup/restore recoverability;
- observability and audit correlation.

The governed Release Gate candidate received explicit human approval, and Operations subsequently reached `COMPLETE / 100%`.

## Known and intentional limitations

This release is a portfolio modernization MVP / technical case study. It is not a production deployment for FAR Seguros or any insurer.

It intentionally does not claim:

- FAR production infrastructure, private processes or internal data;
- production SLO/SLA, monitoring or on-call topology;
- production HA, replication, autoscaling or disaster recovery;
- production backup schedules, RPO or RTO;
- production regulatory retention policy.

All business data are synthetic/demo data. Legacy coexistence is simulated.

## Release evidence

- [Technical case study](CASE_STUDY.md)
- [Repository overview](../../README.md)
- [Release readiness](../release/RELEASE_READINESS.md)
- [Release Gate evidence](../release/RELEASE_GATE_EVIDENCE.md)
- [Release Gate approval](../release/RELEASE_GATE_APPROVAL.md)
- [Operations observability evidence](../operations/OPERATIONS_OBSERVABILITY_EVIDENCE.md)
- [Machine-readable Blueprint state](../../.blueprint/status.yaml)

## Publishing checklist

After this PR is merged and `main` is re-verified:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git status --short
git rev-parse HEAD

git tag -a v0.1.0 -m "Insurance Claims Legacy Modernization MVP v0.1.0"
git push origin v0.1.0
```

Then create a GitHub Release targeting exactly `v0.1.0`, use the release name `Insurance Claims Legacy Modernization MVP v0.1.0`, and use this file as the release-note source.

Before publishing, verify that the tag resolves to the intended `main` commit and that the repository still has no unexpected open pull requests.
