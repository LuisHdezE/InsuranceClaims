# Operations Lineage Reconciliation

## Purpose

Reconcile the permanent `Operations State` validator with the governed product evolution that occurred after the original Blueprint 0.5.2 Operations & Maintenance completion, without rewriting the historical Operations evidence or pretending that the 2026-09-07 observability proof directly covered later R2/R3/demo/productization work.

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

### API evolution

- `API-IMPACT-001`: `api-v1-r1` -> `api-v1-r2`, `platform_cross_cutting`, `RESOLVED`
- `API-IMPACT-002`: `api-v1-r2` -> `api-v1-r3`, `platform_cross_cutting`, `RESOLVED`
- `api.change_impact_analysis = PASS`
- `api.affected_consumer_revalidation = PASS`

### R3 release

- R3 release commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- Annotated tag: `v0.3.0`
- Effective REST contract: 90 operations / 76 paths / 16 families

## Prior Operations lineage reconciliation - PR #134

PR #134 first reconciled the historical Operations clock with the governed R2/R3 and post-release state available at that time:

- Prior governed product checkpoint: `b2f089476559795f30a3c0eec2b05fd0ac32531f`
- PR #134 exact review head: `18c9b20428ec8a0c83cb21bb76615cc26d73f098`
- PR #134 merge: `ac555d064cf8a9a68fe4c10e04ec625396f94a6b`
- Prior browser-reviewed product commit: `a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a`
- Current-product Operations Observability on the preceding PR #133 review head: `35482185068` - SUCCESS

That checkpoint remains part of the audit trail and ancestry requirements. It no longer supplies the active product boundary after later governed product evolution.

## Product evolution after the prior checkpoint

After `b2f08947...`, the repository continued through separately governed product increments, including release/publication reconciliation, portfolio reconciliation, Guidance R3 productization, operator-login containment work and a fresh global VFR.

The Operations sentinel correctly turned red once product files changed beyond its old checkpoint. On PR #141 exact head it failed with:

`product/API/runtime drift detected after governed Operations checkpoint: .github/workflows/guidance-r3-viewport.yml`

That failure is evidence that the fail-closed boundary worked as designed. This reconciliation does not add Guidance or other product files to a permanent allowlist.

## Fresh visual/product revalidation - PR #140

The current product was revalidated through the fresh PR #140 global VFR:

- PR #139 merge with operator-login containment fix: `20a842de8868fe96ed0010b9a22a68ba0d2a6b30`
- Fresh browser-reviewed product commit: `1f774dc4f3c0ce4a02b3c3caa664c78f304e7de1`
- Browser evidence commit: `68fcc89f9c722159529e95e71b3924b8b5bb0e59`
- Browser evidence run: `35525301921` - SUCCESS
- Evidence: 12/12 screenshots
- Explicit approval: `Apruebo VFR fresco PR #140`
- PR #140 approval-recording head: `21013d13d874664c2022db1e20d07fbbc9346d8a`
- PR #140 merge / current governed product checkpoint: `c107703e5d1f41058fb18b878cc1833afb9d85ff`

The prior PR #132 VFR-reviewed commit `a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a` remains preserved as historical lineage.

## Release Gate reconciliation - PR #141

PR #141 then reconciled the Release Gate clock without changing product behavior:

- PR #141 exact review head: `bbb5a67a7757742b6ccc87e097dab91895eb324e`
- PR #141 merge: `50c77fec8482e87295ec7cfd4b800a132557a728`
- Release Gate Ready State run: `35530711021` - SUCCESS
- Release Gate Evidence run: `35530711008` - SUCCESS

The Release Gate product checkpoint remains `c107703e5d1f41058fb18b878cc1833afb9d85ff`; the PR #141 merge is governance lineage layered on top of that product checkpoint.

## Fresh Operations observability revalidation

Crucially, Operations capability was re-executed on the current post-VFR product lineage during PR #141:

- Exact revalidation head: `bbb5a67a7757742b6ccc87e097dab91895eb324e`
- Operations Observability Evidence run: `35530710935` - SUCCESS

That run passed:

- production typecheck;
- ephemeral PostgreSQL bootstrap;
- operational liveness and readiness health checks;
- request-correlation behavior;
- safe error behavior;
- durable runtime QA signals;
- durable audit-correlation invariants;
- committed/runtime secret-leakage rejection;
- evidence artifact publication.

This fresh execution does not rewrite the historical `34102498663` evidence. It proves that the operational capability still works on the evolved, human-revalidated product.

## Current governed Operations product checkpoint

The governed product checkpoint for Operations lineage is now:

`c107703e5d1f41058fb18b878cc1833afb9d85ff`

This is the PR #140 merged product state. It is not a new Operations phase completion event and not a new human Operations gate; Blueprint 0.5.2 defines no separate Operations gate.

The current governance chain additionally requires the Release Gate reconciliation merge:

`50c77fec8482e87295ec7cfd4b800a132557a728`

The validator therefore applies four linked rules:

1. preserve the historical Operations evidence, runbook and phase state exactly;
2. preserve the prior PR #134 governed checkpoint as audit history and ancestry;
3. require the fresh PR #140 VFR-approved product and the current Operations observability revalidation;
4. reject new product/API/runtime drift after `c107703e...` unless a later explicit product reconciliation advances that checkpoint.

## Fail-closed boundary after the checkpoint

After `c107703e...`, governance/evidence maintenance may proceed without being misclassified as product drift. Product/API/runtime changes remain fail-closed.

Changes that must still invalidate Operations lineage until explicitly revalidated include, among others:

- `apps/**`
- `packages/**`
- `openapi.yaml`
- `.env.example`
- runtime composition/configuration
- persistence or authorization behavior
- authoritative API contract surfaces
- product-specific QA/workflow additions that accompany new behavior

Documentation and validator maintenance for Release, Operations and R3 technical-closure governance may advance without implying a product change.

## Separation from R3 Full Product Technical Closure

This reconciliation deliberately does not change `scripts/validate-r3-full-product-closure.mjs`, its lineage document or its governed product checkpoint.

On PR #141 exact head, the R3 technical suite passed install, contract emit, backend typecheck/build/tests, architecture, web typecheck/tests/build, runtime reconciliation, OpenAPI zero drift, Postman zero drift and inherited API R3 closure, then failed only at `Validate full-product closure boundary`.

That boundary belongs to the next separate governance PR.

## Merge boundary

Preparation and CI success do not authorize merge. Merge remains a separate explicit human decision by Luis Hernández.
