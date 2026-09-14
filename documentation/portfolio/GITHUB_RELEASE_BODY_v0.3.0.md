# Insurance Claims Legacy Modernization — R3 Full Product v0.3.0

R3 turns the project from a focused Claims Operations increment into a broader insurance-claims modernization case study with a governed full-product slice across public journeys, operator work, customer and policy views, commercial/financial follow-up, administration, automation, imports, async recovery and observability.

## Release identity

- Version: `0.3.0`
- Contract: `api-v1-r3`
- Blueprint consumer baseline: `0.5.2`
- Delivery model: `GREENFIELD`
- Legacy coexistence: `SIMULATED`
- Release commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`

## R3 product scope

The accepted web product contains 22 productized views/capability surfaces:

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

Three capabilities remain deliberately outside standalone R3 UI productization: Authenticated Customer Portal UI, Operator Communications UI and Standalone Bulk Actions UI. These are explicit product boundaries, not missing screens to be invented around authorization or contract constraints.

## API and contract closure

`api-v1-r3` closes with:

- **90** effective REST operations;
- **76** paths;
- **16** operation families;
- **15** inherited operations;
- **75** new operations;
- **7** changed existing operations;
- deterministic runtime reconciliation at **90/90**;
- OpenAPI zero drift;
- Postman semantic coverage at **90/90**.

The historical read-only MCP `get_claim_status` tool remains a separate presentation contract and is not counted as a REST operation.

## Architecture

The release preserves Clean Architecture + Ports & Adapters:

`Presentation -> Application -> Ports <- Infrastructure`

Business authority stays server-side. React does not own lifecycle rules, persistence or legacy integration. PostgreSQL and the simulated legacy service remain behind infrastructure boundaries.

## Security and reliability

Accepted R3 evidence includes:

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

The released product is backed by:

- backend baseline of **91 tests**;
- architecture-boundary validation;
- real PostgreSQL 18 API QA;
- full-system Integration QA with real API/web runtime;
- browser responsive and accessibility journeys;
- offline/degraded browser behavior;
- OpenAPI and Postman zero-drift checks;
- exact-head R3 Full Product Technical Closure;
- governed release formalization with immutable historical-release preservation.

## Portfolio intent

This repository is designed as a technical modernization case study that demonstrates architecture, API evolution, CI governance, productization, testing and release discipline in one coherent system.

**Caso técnico no oficial · No oficial · Sin afiliación**

All business data are synthetic/demo data. This repository does not represent production insurer infrastructure, private organizational processes, production data or an official implementation for a real insurer.

## Key evidence

- `documentation/portfolio/CASE_STUDY.md`
- `documentation/product-closure/r3/FULL_PRODUCT_TECHNICAL_CLOSURE_R3.md`
- `documentation/api-implementation/r3/FINAL_CLOSURE_INCREMENT_22.md`
- `documentation/release/R3_RELEASE_FORMALIZATION_0.3.0.md`
- `documentation/portfolio/R3_RELEASE_PUBLICATION_GATE_0.3.0.md`
