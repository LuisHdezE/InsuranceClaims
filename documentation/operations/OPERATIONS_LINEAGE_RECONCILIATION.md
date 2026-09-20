# Operations Lineage Reconciliation

## Purpose

Reconcile the permanent `Operations State` validator with the governed product evolution that occurred after the original Blueprint 0.5.2 Operations & Maintenance completion, without rewriting the historical Operations evidence or pretending that the 2026-09-07 observability proof directly covered later R2/R3/demo work.

This is a governance-only reconciliation. It changes no product behavior, API contract, persistence schema, RBAC, demo fixtures, runtime configuration or R3 Full Product Technical Closure evidence.

## Historical Operations completion remains immutable

The original Operations completion remains the historical decision recorded through PR #21:

- Release baseline: `49c52a380e3a5c40ec1c1ee72e5c114b5607019f`
- Operations candidate: `2a10afc8e1b99d8e656ea5511c334235df444e69`
- Operations merge: `b450204d8fbed14660dde90a900c21211875e5d7`
- Evidence ID: `EVD-OPERATIONS-OBSERVABILITY-001`
- Machine-tested evidence commit: `175dd7ed599954c48487193489c4c842662e955a`
- Successful historical workflow run: `34102498663`
- Exact-head PR #21 Operations State run: `34119017625`
- Exact-head PR #21 regression: `18/18 SUCCESS`

The canonical historical evidence remains `documentation/operations/OPERATIONS_OBSERVABILITY_EVIDENCE.md` and the runbook remains `documentation/operations/OPERATIONS_RUNBOOK.md`.

Nothing in this reconciliation modifies those historical facts or upgrades the original evidence into a claim about future product versions.

## Governed evolution after historical Operations

The product subsequently evolved through explicit Blueprint governance rather than unrecorded drift.

### API evolution

- `API-IMPACT-001`: `api-v1-r1` -> `api-v1-r2`, `platform_cross_cutting`, `RESOLVED`
- `API-IMPACT-002`: `api-v1-r2` -> `api-v1-r3`, `platform_cross_cutting`, `RESOLVED`
- `api.change_impact_analysis = PASS`
- `api.affected_consumer_revalidation = PASS`

### R3 release

- R3 release commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- Annotated tag: `v0.3.0`
- Effective REST contract: 90 operations / 76 paths / 16 families

### Fresh visual/product revalidation

PR #132 refreshed browser evidence against the current product:

- Fresh browser-reviewed product commit: `a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a`
- PR #132 merge: `db9d8092d9ed34be283bef0b1908aa7c7a6c8ab9`
- Fresh VFR run: `35478752855`
- Explicit approval: `Apruebo VFR fresco PR #132`

### Release Gate lineage reconciliation

PR #133 preserved the historical Release Gate and taught its validator to distinguish later governed evolution from unexplained product drift:

- PR #133 exact review head: `d7a04d679fa21bd5700cefd731a59abf2f8fc907`
- PR #133 merge: `b2f089476559795f30a3c0eec2b05fd0ac32531f`
- Release Gate Ready State run: `35482185098` — SUCCESS
- Release Gate Evidence run: `35482185059` — SUCCESS
- Operations Observability Evidence run on the same exact review head: `35482185068` — SUCCESS

That exact-head Operations Observability success is important: the executable observability proof still passes after the governed R2/R3/demo evolution. It does not replace the historical evidence; it revalidates the operational capability on the evolved product.

## Current governed Operations checkpoint

The governed repository checkpoint for Operations lineage is now:

`b2f089476559795f30a3c0eec2b05fd0ac32531f`

This SHA is not a new Operations phase completion event and is not a new human gate. Blueprint 0.5.2 defines no separate Operations gate. It is the exact repository checkpoint through which the historical Operations baseline plus subsequent governed product evolution and current observability revalidation have been reconciled.

The permanent validator therefore applies two separate rules:

1. preserve and verify the historical Operations evidence, runbook and phase state exactly;
2. reject new product/API/runtime drift after the current governed checkpoint unless a later explicit reconciliation advances that checkpoint.

## Fail-closed boundary after the checkpoint

After `b2f08947...`, governance/evidence maintenance may proceed without being misclassified as product drift. Product/API/runtime changes remain fail-closed.

Changes that must still invalidate Operations lineage until explicitly revalidated include, among others:

- `apps/**`
- `packages/**`
- `openapi.yaml`
- `.env.example`
- runtime composition/configuration
- persistence or authorization behavior
- authoritative API contract surfaces

Documentation and validator maintenance for Release, Operations and R3 technical-closure governance may advance without implying a product change.

## Separation from R3 Full Product Technical Closure

This reconciliation deliberately does not change `scripts/validate-r3-full-product-closure.mjs` or its baseline.

The R3 Full Product Technical Closure sentinel must continue to report its own historical boundary independently. At the time this reconciliation was prepared, that lane still failed on `.env.example` after all backend/web tests, architecture, builds, R3 endpoint reconciliation, OpenAPI and Postman checks passed.

That issue belongs to a separate PR.

## Merge boundary

Preparation and CI success do not authorize merge. Merge remains a separate explicit human decision by Luis Hernández.