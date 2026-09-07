# Insurance Claims Legacy Modernization

Technical case study for incrementally modernizing insurance claims workflows over a **simulated legacy core**.

> Unofficial technical case study inspired by publicly observable insurance workflows. There is no affiliation with FAR Seguros. All policy, claim, operator and operational data in this repository are synthetic/demo data.

## Release candidate scope

The Blueprint 0.5.2 MVP contains three accepted React web slices:

- `digital-claim-intake/web`
- `customer-claim-tracking/web`
- `claims-backoffice/web`

The modern boundary also includes:

- NestJS REST API;
- read-only MCP claim-status tool;
- PostgreSQL 18 authoritative modern workflow persistence;
- private filesystem-backed synthetic evidence storage behind a port;
- separate HTTP legacy simulator used only for synthetic policy/vehicle eligibility.

Architecture remains Clean Architecture + Ports & Adapters. React and MCP never access PostgreSQL directly, and the web client never calls the legacy simulator directly.

## Toolchain

- Node.js 24
- npm lockfile installation with `npm ci`
- PostgreSQL 18 for real persistence/runtime QA
- React 19 + Vite 7
- NestJS 12
- Prisma 8 contract/tooling

## Local configuration

Copy `.env.example` to a local `.env`-style environment and replace demo secrets locally. Do not commit real credentials.

Required runtime variables are documented in `.env.example`, including `DATABASE_URL`, `LEGACY_SIMULATOR_URL`, `JWT_SECRET`, `EVIDENCE_STORAGE_DIR` and synthetic operator credentials.

## Install and verify

```bash
npm ci
npm run contract:emit
npm run typecheck
npm test
npm run architecture:check
npm --workspace @insurance/web test
npm --workspace @insurance/web run build
```

## Run the local composition

With PostgreSQL available and the configured schema/seed prepared, run the services in separate terminals:

```bash
npm run start:legacy
npm run start:api
npm run start:mcp
npm --workspace @insurance/web run dev
```

Default ports from `.env.example` are API `3000`, MCP `3100`, legacy simulator `3200`; Vite chooses its configured development port.

## Contracts and QA

- REST contract: `openapi.yaml`
- Postman: `postman/`
- architecture/security/data documentation: `documentation/`
- executable QA: `qa/` and `scripts/`
- Blueprint state: `.blueprint/status.yaml`
- accepted slice contracts: `.blueprint/functional-slices/`

The Integration QA workflow exercises PostgreSQL, the simulated legacy HTTP dependency, the production API composition, all three web API clients, real Chrome journeys, security behavior, accessibility/responsive behavior and degraded/offline transport behavior.

## Release documentation

See `documentation/release/RELEASE_READINESS.md` for release scope, security acceptance aggregation, recoverability proof, limitations and release/rollback posture.

## Intentional limitations

This is a portfolio modernization MVP, not a production deployment of an insurer. It does not claim FAR infrastructure, production topology, regulatory retention policy, production HA/replication, production backup scheduling or cloud object storage. Legacy coexistence is simulated by design.
