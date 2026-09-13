# Insurance Claims Legacy Modernization — R3 Full Product v0.3.0

## Release identity

- Candidate project version: `0.3.0`
- Previous published release: `0.2.0`
- Planned annotated Git tag: `v0.3.0`
- Planned release name: `Insurance Claims Legacy Modernization — R3 Full Product v0.3.0`
- Formalization status: `CANDIDATE / HUMAN MERGE DECISION PENDING`
- Publication status: `NOT_STARTED`
- Blueprint consumer baseline: `0.5.2`
- Delivery model: `GREENFIELD` modernization with legacy coexistence `SIMULATED`
- API contract: `api-v1-r3`
- Formalization baseline: `47e1745ad5cbe65c9a1b54dcae236bad7205d92b`

> `v0.3.0` is not published by this artifact. The annotated tag and GitHub Release require a separate explicit human publication gate after formalization is merged.

## What v0.3.0 packages

R3 moves the case study from the earlier Claims Operations increment into a broader full-product modernization slice. The accepted product now includes public journeys, operator work, customer and policy views, commercial/financial follow-up, administration, automation, imports, async recovery and governed observability.

### Public and operator experience

The productized web surface contains 22 views/capability surfaces:

- Public Claim Intake and Public Claim Tracking;
- Operator Login and role-aware Staff Workspace;
- Operations Dashboard, Claims Workspace, Claim Detail and Tasks;
- Customer Directory and Customer 360;
- Policy Directory and Policy 360;
- Renewals and Collections;
- Analytics;
- Pipeline and Automation Administration;
- Communication Template, Custom Field and Guidance Administration;
- Governed Imports;
- Recovery Operations / Dead Letters.

### R3 API

`api-v1-r3` closes with:

- `90` effective REST operations;
- `76` paths;
- `16` operation families;
- `15` inherited operations;
- `75` new operations;
- `7` changed existing operations;
- deterministic runtime reconciliation at `90/90`;
- OpenAPI zero drift;
- Postman semantic coverage at `90/90`.

The historical read-only MCP `get_claim_status` tool remains a separate presentation contract and is not counted as a REST operation.

### Architecture and business authority

The release preserves Clean Architecture + Ports & Adapters:

`Presentation -> Application -> Ports <- Infrastructure`

Business authority remains server-side. React does not directly own lifecycle rules, persistence or legacy integration. PostgreSQL and the simulated legacy service stay behind infrastructure boundaries.

### Security and reliability

The accepted R3 evidence includes:

- JWT authentication and API-side RBAC;
- role-aware navigation without client-side privilege invention;
- Argon2id password hashing;
- idempotency and concurrency protection;
- RFC 9457 Problem Details;
- request and durable-audit correlation;
- safe error sanitization and secret non-leakage checks;
- protected evidence access through a storage port;
- rate limiting;
- PostgreSQL 18 provider-real QA;
- integration-event, worker and dead-letter recovery behavior;
- backup/restore and operations-observability evidence.

## Quality evidence

The release candidate inherits the exact approved R3 technical closure and portfolio evidence:

- backend baseline: `91` tests;
- architecture-boundary validation;
- real PostgreSQL 18 API QA;
- full-system Integration QA with real API/web runtime;
- browser responsive/accessibility journeys;
- offline/degraded browser behavior;
- OpenAPI and Postman zero-drift checks;
- full-product technical closure on an exact approved head.

R3 Full Product Technical Closure was merged through PR #90 at `54f791707d6a4e2f9425f57d0a18e20e139fb518`. Portfolio Hardening & Case Study was merged through PR #91 at `47e1745ad5cbe65c9a1b54dcae236bad7205d92b`.

## Deliberate boundaries

The following remain deliberately outside standalone R3 UI productization:

1. Authenticated Customer Portal UI;
2. Operator Communications UI;
3. Standalone Bulk Actions UI.

These are documented product decisions. The release formalization does not silently invent privileges, contracts or screens to fill them.

## Version alignment

The formalization aligns the complete npm monorepo to `0.3.0`:

- root package;
- API;
- web client;
- MCP boundary;
- legacy simulator;
- Domain;
- Application;
- Infrastructure;
- internal workspace dependency references;
- `package-lock.json` workspace metadata.

The lockfile is regenerated under Node.js 24 and verified with `npm ci`. Dedicated CI also proves that the package dependency graph did not change relative to the `0.2.0` baseline when release identity metadata is normalized away.

## Previous release preservation

`v0.2.0` remains the latest published release until the separate publication gate completes. Its tag remains immutable and resolves to release commit:

`9265417849f398f5d1efa56b7cd8ff365b950dbb`

The historical release is not moved, deleted or repurposed by `0.3.0` formalization.

## Case-study disclosure

**Caso técnico no oficial · No oficial · Sin afiliación**

This is a portfolio technical case study. All business data are synthetic/demo data. It does not represent FAR production infrastructure, private processes, insurer rules, production data or an official FAR implementation.

## Evidence references

- [R3 Release Formalization candidate](../release/R3_RELEASE_FORMALIZATION_0.3.0.md)
- [R3 Technical Case Study](CASE_STUDY.md)
- [R3 Portfolio Hardening](R3_PORTFOLIO_HARDENING.md)
- [R3 Full Product Technical Closure](../product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.md)
- [R3 API Final Closure](../api-implementation/r3/FINAL_CLOSURE_INCREMENT_22.md)
- [Published v0.2.0 release notes](RELEASE_NOTES_v0.2.0.md)

## Publication record

- Formalization baseline: `47e1745ad5cbe65c9a1b54dcae236bad7205d92b`
- Formalization PR: `PENDING`
- Formalization merge commit: `PENDING`
- Annotated tag: `v0.3.0` — `NOT CREATED`
- Tag object SHA: `PENDING`
- Tag target commit: `PENDING`
- GitHub Release ID: `PENDING`
- Published at: `PENDING`

Publication details are intentionally left pending. They may only be filled from verified GitHub state after the separate human publication gate completes.
