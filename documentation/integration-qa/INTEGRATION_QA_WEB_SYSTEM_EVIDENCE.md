# Integration & System QA — Web Platform Evidence

Evidence ID: **EVD-INTEGRATION-QA-WEB-SYSTEM-001**

## Scope

- Blueprint baseline: **0.5.2**
- Pinned Blueprint commit: `737556e24195aa909117790f2d7ff0be2fe0a474`
- Gate: `integration_qa_pass`
- Evaluation scope: `interface_slice_platform`
- Platform: `web`
- Reviewed commit: `7828b6220500a6d7a8cdb5c1815dbbd06f49ea06`
- Successful workflow: **Integration QA - Web Slices**
- Successful run: **34037324011**
- Job: **101497660841**
- Runtime artifact: `integration-qa-web-7828b6220500a6d7a8cdb5c1815dbbd06f49ea06`
- Artifact ID: `9990598242`
- Artifact digest: `sha256:145c15ab959a5147b168f281c6762546bfb87adb5b33249c82b91d212cba2fbe`

## Runtime composition

The exact reviewed commit was exercised as an integrated system using PostgreSQL 18, the production Nest API composition, a separate simulated legacy HTTP dependency, the React/Vite web client, the actual Axios API client functions and Google Chrome `152.0.7977.64`. All identities, claims, policy/vehicle references and evidence used by the tests were synthetic/demo data.

The browser never communicates directly with PostgreSQL or the simulated legacy service. All web flows use the approved REST API boundary.

## Canonical Integration QA checks

All required Blueprint 0.5.2 checks passed for all three web slices:

- `qa.functional`
- `qa.real_api_transport`
- `qa.integration`
- `qa.security`
- `qa.responsive`
- `qa.accessibility`
- `qa.e2e`
- `qa.offline` (applicable and REQUIRED for all three web slices)

`qa.idempotency` passed for `digital-claim-intake/web`, where `createClaim` requires `Idempotency-Key`. It is correctly `N/A` for the read-only tracking slice and for backoffice, where `expectedFromStatus` is a concurrency guard rather than an idempotency protocol.

## Cross-system evidence

The successful run proved, in one isolated environment:

1. locked dependency installation, Prisma contract emission, backend/web typechecks and tests;
2. executable Clean Architecture conformance and production backend/web builds;
3. PostgreSQL schema bootstrap and synthetic operator seed;
4. positive, negative, security, RFC 9457, rate-limit, idempotency and stale-state concurrency runtime QA;
5. durable audit/persistence assertions in PostgreSQL;
6. production dependency audit with **0 high / 0 critical / 0 total** production advisories;
7. the real Intake Axios client against the API, including successful tracking-code creation, idempotent replay and inactive eligibility rejection;
8. the real Tracking Axios client, including customer-safe projection, indistinguishable invalid-proof 404 and explicit authoritative refresh;
9. the real Backoffice Axios client, including 900-second bearer session, protected reads/evidence, transition commit and stale-transition 409 refresh;
10. a Chrome-rendered cross-interface journey spanning Intake → Tracking → Backoffice with responsive and accessibility assertions;
11. deliberate loss of the SPA `/api` transport in Chrome while the loaded client remained alive, proving fail-closed network/degraded behavior for all three slices.

## QA harness findings resolved before evidence acceptance

Two earlier runs were not accepted as Integration QA evidence:

- Run `34036839814`: failed because the workflow killed only the npm wrapper while the `tsx` API child retained in-memory rate-limit state. The process lifecycle was corrected; no product behavior changed.
- Run `34037034785`: all normal integration checks passed, but Chrome's broad offline emulation did not reliably model the loopback Vite proxy. The harness was corrected to block only the actual SPA `/api` transport using Chrome DevTools `Network.setBlockedURLs`; no product behavior changed.

The accepted run `34037324011` passed after both harness defects were removed.

## Guardrails and downstream state

This evidence supports machine/evidence readiness only. It does **not** constitute human approval of Integration QA, Human Acceptance, Release Gate or deployment.

At this stage:

- all three slice lifecycles remain `FUNCTIONAL`;
- Visual & Functional Review remains `PASS` with human completion already recorded;
- Integration QA may advance only to `READY_FOR_REVIEW` until the explicit scoped human decision is recorded;
- Human Acceptance remains `PENDING`;
- Release Gate has not started.
