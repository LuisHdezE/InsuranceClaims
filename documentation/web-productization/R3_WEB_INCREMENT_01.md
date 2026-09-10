# R3 Web Productization - Increment 01

**Project:** `LuisHdezE/InsuranceClaims`  
**Blueprint consumer baseline:** `0.5.2`  
**API contract:** `api-v1-r3`  
**Frozen main SHA:** `007312a8360fa6ca883f28bde5f9af9adce19914`  
**Increment:** Staff Identity, Permissions and Client Contract Foundation  
**Status:** `IMPLEMENTED_PENDING_EXACT_HEAD_CI_AND_HUMAN_REVIEW`

> Caso técnico no oficial. No afiliado a FAR Seguros. Todos los datos de negocio son sintéticos/demo.

## 1. Purpose

This increment starts post-R3 web productization without rewriting historical MVP/UI evidence.

The goal is to make the existing React client safe to expand across the R3 surface by first correcting staff identity assumptions, introducing presentation permission awareness, exposing newer Claim/Task projections, and improving the operational experience without inventing business data.

## 2. Staff identity and presentation access

R3 staff roles are now represented in the web client:

- `CLAIMS_OPERATOR`
- `CLAIMS_SUPERVISOR`
- `PLATFORM_ADMIN`

`apps/web/src/auth/staff-access.ts` mirrors the frozen R3 role grants for presentation decisions only.

This mirror is not an authorization boundary. API/Application permission checks remain authoritative.

A critical invariant is preserved:

`PLATFORM_ADMIN` does not receive an implicit Claim lifecycle superuser bypass.

The web router now protects existing operational routes by the permissions actually required by their current API calls.

## 3. Role-aware workspace

A new `/operator/workspace` route provides a safe landing for every valid R3 staff role.

The workspace:

- shows the authenticated role;
- exposes only capability groups supported by that role;
- links only to UI that is already implemented;
- labels API-backed but not-yet-productized areas as planned UI;
- avoids dead navigation links;
- provides a stable destination for `PLATFORM_ADMIN` before admin modules are implemented.

A separate `/operator/forbidden` presentation explains denied client navigation without escalating privileges.

## 4. Navigation

The operational shell now renders navigation by presentation permission.

Current live links are:

- Workspace for every authenticated staff role;
- Dashboard for staff with both Claims read and Tasks read;
- Claims for staff with Claims read;
- Tasks for staff with Tasks read.

Future R3 modules are not added as dead sidebar links.

## 5. Claims client reconciliation

`listClaims` web input now represents the R3 additive query surface:

- `page`
- `pageSize`
- `status`
- `stage`
- `search`
- `sort`

The Claim summary projection now includes:

- `operationalStage`
- `operationalWorkItemVersion`

The Claims workspace adds server-side search and allowlisted sorting and displays the server-projected operational stage.

The approved four-column Kanban remains a visual grouping by Claim status. It is not reinterpreted as the authoritative Pipeline WorkItem lifecycle.

## 6. Tasks client reconciliation

The web Task model now recognizes the R3 lifecycle:

`OPEN -> COMPLETED | CANCELLED`

The Tasks workspace adds runtime-backed priority and overdue filtering, shows assignment identity, and distinguishes cancelled tasks from completed tasks.

Text search is explicitly described as local search over the loaded result set so the UI does not imply an API search contract that does not exist.

## 7. Contract observation: listTasks query drift

A consumer-local contract observation was found before implementation.

The frozen/generated R3 OpenAPI for `listTasks` exposes assignment/queue query names that do not fully match the registered controller implementation.

Observed OpenAPI query parameters include:

- `assigneeId`
- `queueKey`
- `priority`
- `overdue`

Observed runtime controller input includes:

- historical `type`
- historical `claimId`
- `priority`
- `assignedOperatorId`
- `overdue`

The narrative R3 contract says `listTasks` receives additive assignment/priority/overdue filters while inherited operation identity remains stable.

This web increment does not mutate the frozen R3 API contract or silently pretend the parameter drift is resolved. It preserves the server-supported historical filters and uses runtime-supported R3 filters needed by the UI.

A later API/OpenAPI conformance correction should explicitly reconcile naming and compatibility before formal API parameter parity is declared.

## 8. Visual direction

The increment preserves the approved Claims Operations visual target:

- deep navy operational navigation;
- white/light work surfaces;
- cyan primary interaction;
- controlled yellow emphasis;
- compact SaaS density;
- rounded cards and restrained shadows;
- responsive behavior;
- visible non-affiliation/synthetic-data disclosure.

New visual elements include:

- role-aware workspace hero;
- capability cards;
- role identity treatment in the top bar;
- richer Claims filters;
- operational-stage pills;
- richer Task filters and assignment pills;
- dedicated forbidden state;
- refreshed staff login treatment.

No visual KPI or business fixture is invented for decoration.

## 9. Historical evidence boundary

This increment does not rewrite the historical 10-interface MVP inventory.

The repository already evolved beyond that inventory with the Claims Operations Dashboard and Tasks Workspace. R3 productization now adds staff workspace/access surfaces.

A new post-R3 interface inventory revision should be created as its own governed productization increment after the foundational routing/navigation model is accepted.

## 10. Validation gate

Before merge, the exact increment head must pass applicable repository checks, including web typecheck/tests/build and existing architecture/integration regressions.

Machine success does not authorize merge. Human approval remains required.
