# InsuranceClaims Demo Deployment Readiness

## Purpose

This document defines the governed deployment contract for the public synthetic InsuranceClaims demo. It does not create provider resources, DNS records or production credentials.

Target topology:

```text
claims.eliasworks.uy
        |
        v
React 19 + Vite static frontend
        |
        v
api.claims.eliasworks.uy
        |
        v
NestJS API on Render Free
        |
        v
Neon PostgreSQL 18
```

The minimal demo does not deploy the standalone legacy simulator, worker or MCP service.

## Demo composition

Set:

```text
DEMO_MODE=true
```

In demo mode:

- policy verification uses the synthetic in-process policy verification adapter;
- `LEGACY_SIMULATOR_URL` is not required;
- evidence bytes use memory storage rather than a local filesystem;
- governed import source bytes use memory storage rather than a local filesystem;
- PostgreSQL remains the persistent system of record for supported demo data.

Outside demo mode, the normal production composition is preserved and `LEGACY_SIMULATOR_URL` remains mandatory.

Evidence upload and governed imports are not part of the minimum public demo contract because their byte storage is intentionally non-persistent in demo mode. Worker-dependent processing is also outside the minimum public demo contract.

## API environment

Required runtime variables for the demo API:

```text
NODE_ENV=production
DEMO_MODE=true
DATABASE_URL=<provider database URL>
STAFF_JWT_SECRET=<minimum 32 characters>
CUSTOMER_JWT_SECRET=<separate minimum 32 characters>
CORS_ALLOWED_ORIGINS=<exact frontend origin>
```

Optional defaults remain available for staff/customer JWT issuer and audience values.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact `http` or `https` origins. Paths, credentials, query strings and fragments are rejected.

## Frontend environment

The Vite build accepts:

```text
VITE_API_BASE_URL=https://api.claims.eliasworks.uy
```

The value may point to a temporary provider URL during pre-domain validation.

## Database initialization

The demo database initializer is intentionally one-shot and fail-closed.

Required values:

```text
DEMO_MODE=true
DATABASE_URL=<fresh empty demo database>
DEMO_DB_INIT_CONFIRM=INSURANCECLAIMS_DEMO_INIT
```

Run:

```bash
npm run demo:db:init
```

The command:

1. requires the `psql` client;
2. verifies that the PostgreSQL `public` schema has zero base tables;
3. aborts if the database is not empty;
4. applies the same baseline and selected R3 schema files used by PostgreSQL runtime QA;
5. never acts as an automatic deploy-time migration hook.

This command must not be run repeatedly against an initialized database.

## Synthetic demo seed

Required values:

```text
DEMO_MODE=true
DATABASE_URL=<initialized demo database>
DEMO_OPERATOR_PASSWORD=<minimum 16 characters>
DEMO_SEED_CONFIRM=INSURANCECLAIMS_DEMO_SEED
```

Run:

```bash
npm run demo:seed
```

Default synthetic staff logins:

```text
demo.operator@eliasworks.invalid
demo.supervisor@eliasworks.invalid
demo.admin@eliasworks.invalid
```

A customer portal identity is seeded only when `DEMO_CUSTOMER_PASSWORD` is explicitly provided.

The seed applies the established synthetic renewals, collections and bulk-action scenarios plus a demo-only operational workload. The deployment-readiness guard requires the resulting database to contain, at minimum:

- three active staff identities;
- three Claims;
- three OPEN claim Tasks, including at least one overdue Task;
- one OPEN renewal case;
- one OPEN collection case;
- three active policies.

This keeps the operator dashboard, Claims, Tasks, Customers/Policies, Renewals and Collections areas visibly populated without using real insurer/customer information.

No real insurer/customer data or provider secrets may be committed to the repository.

## API build and start

Current compatible provider commands:

```bash
npm ci --include=dev
npm run contract:emit
npm run build
npm run start:api
```

`tsx` remains a development dependency and is currently used by `start:api`. Moving the production start command to compiled JavaScript is a separate hardening item and is not required for the first demo deployment.

## Minimum demo services

Required:

- one PostgreSQL 18 database;
- one API web service;
- one static frontend host.

Not required for the minimum demo:

- standalone legacy simulator;
- background worker;
- MCP server;
- external email/WhatsApp provider;
- persistent filesystem;
- object storage.

## Deployment sequence

1. Merge this readiness increment after CI and human approval.
2. Create the PostgreSQL demo database.
3. Run `demo:db:init` exactly once against the fresh database.
4. Run `demo:seed`.
5. Deploy the API using a temporary provider URL.
6. Validate health, authentication and representative read/write endpoints.
7. Build/deploy the frontend with the temporary API URL.
8. Validate cross-origin behavior and end-to-end navigation.
9. Configure `claims.eliasworks.uy` and `api.claims.eliasworks.uy` only after temporary URLs are proven.

## Explicit non-goals of this increment

This readiness increment does not:

- create Neon, Render or DNS resources;
- alter domain rules or API endpoint contracts;
- enable a free background worker;
- make local filesystem storage durable;
- expose real production credentials;
- merge itself into `main`.
