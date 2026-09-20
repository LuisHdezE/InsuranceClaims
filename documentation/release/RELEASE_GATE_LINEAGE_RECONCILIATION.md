# Release Gate Lineage Reconciliation

## Purpose

Reconcile the `Release Gate Ready State` validator with the governed product evolution that occurred after the original MVP Release Gate approval, without rewriting or reinterpreting that historical human decision.

This reconciliation advances the fail-closed lineage checkpoint after PR #140. It changes no product behavior, API contract, auth, RBAC, demo fixtures, runtime configuration, Operations evidence or R3 Full Product Technical Closure evidence.

## Historical Release Gate remains immutable

The original project Release Gate remains the historical decision recorded on 2026-09-07:

- Historical accepted baseline: `ba7f519f36567b142604e213f50e13de4732348d`
- Historical approved release candidate: `05bb93081248c02ecfb93b7b77477bd4862d3281`
- Historical approval record commit: `56ca960b68139e052813bd2929adb1fd033fb8b2`
- Approval evidence: `EVD-RELEASE-GATE-APPROVAL-001`
- Approval document: `documentation/release/RELEASE_GATE_APPROVAL.md`
- Approver: Luis Hernández
- Approval time: `2026-09-07T05:09:00-03:00`

Nothing in this reconciliation changes those values or claims that the original Release Gate directly approved later R2, R3, demo-hardening or VFR work.

## Governed evolution after the historical gate

The product subsequently evolved through explicit, versioned governance rather than unrecorded drift.

### R1 -> R2

- Impact record: `.blueprint/api-impact/API-IMPACT-001.json`
- Revision: `api-v1-r1` -> `api-v1-r2`
- Classification: `platform_cross_cutting`
- Revalidation policy: `platform`
- Current Blueprint status: `RESOLVED`

### R2 -> R3

- Impact record: `.blueprint/api-impact/API-IMPACT-002.json`
- Revision: `api-v1-r2` -> `api-v1-r3`
- Classification: `platform_cross_cutting`
- Revalidation policy: `platform`
- Current Blueprint status: `RESOLVED`

The Blueprint status also records `api.change_impact_analysis = PASS` and `api.affected_consumer_revalidation = PASS`, preserving the original historical evidence while explicitly validating affected web consumers after the API evolution.

### R3 release chain

R3 was separately closed and released rather than being retroactively folded into the September 7 gate:

- R3 Full Product Technical Closure merge: `54f791707d6a4e2f9425f57d0a18e20e139fb518`
- R3 release commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- Published annotated tag: `v0.3.0`
- Published release name: `Insurance Claims Legacy Modernization — R3 Full Product v0.3.0`
- Effective contract: `api-v1-r3`
- Effective REST surface: 90 operations / 76 paths / 16 families

The published `v0.3.0` release records PostgreSQL 18 QA, Integration QA, backup/restore, observability, OpenAPI/Postman zero drift and R3 full-product closure as part of its accepted evidence chain.

## Prior governed checkpoint - PR #132

The first post-release lineage reconciliation was established after the fresh PR #132 VFR:

- PR #132 merge / prior governed checkpoint: `db9d8092d9ed34be283bef0b1908aa7c7a6c8ab9`
- Fresh browser-reviewed product commit: `a3f3d05656b1e5d8cd35368deec2e6b0e599fa7a`
- Browser evidence commit: `9703deeac7e96988b6a3bb290537f058df46151a`
- Browser evidence run: `35478752855` - SUCCESS
- Explicit approval statement: `Apruebo VFR fresco PR #132`

That checkpoint remains preserved as audit history and as an ancestry requirement. It no longer supplies the active fail-closed boundary after later governed product evolution.

## Product evolution after PR #132

After the PR #132 checkpoint, the repository continued through separately reviewed product and visual increments, including Guidance productization and the operator-login demo-persona containment fix. Those increments were not silently inherited by the historical Release Gate: the Release Gate sentinel correctly turned red once product drift occurred beyond `db9d8092...`.

The current product was then revalidated through PR #140:

- PR #139 merge with operator-login containment fix: `20a842de8868fe96ed0010b9a22a68ba0d2a6b30`
- PR #140 browser-reviewed commit: `1f774dc4f3c0ce4a02b3c3caa664c78f304e7de1`
- PR #140 browser evidence commit: `68fcc89f9c722159529e95e71b3924b8b5bb0e59`
- PR #140 browser evidence run: `35525301921` - SUCCESS
- Browser: Chrome `152.0.7977.82`
- Fresh evidence: 12/12 screenshots
- Explicit approval statement: `Apruebo VFR fresco PR #140`
- VFR approval recording HEAD: `21013d13d874664c2022db1e20d07fbbc9346d8a`
- PR #140 merge / current governed checkpoint: `c107703e5d1f41058fb18b878cc1833afb9d85ff`
- Fresh VFR reconciliation: `documentation/visual-functional-review/VFR_APPROVAL_RECONCILIATION.md`

On the exact PR #140 approval HEAD, `Visual Functional Review Ready - Web`, API Implementation, API QA, Integration QA, all three governed functional slices, OpenAPI validation, OpenAPI Post-MVP R2, Postman Contract, Design System, Interface Inventory, Operator Navigation Integration, CI QA Hardening, Operations Observability Evidence and Release Gate Evidence all passed. The VFR gate specifically verified the exact human approval binding, ancestry and zero product drift after the browser-reviewed commit.

## Current governed lineage checkpoint

The Release Gate lineage checkpoint is now:

`c107703e5d1f41058fb18b878cc1833afb9d85ff`

This SHA is **not a new historical Release Gate approval**. It is the exact repository checkpoint through which the later product evolution has now been explicitly reviewed, browser-validated, regression-tested, human-approved at VFR and merged under governed review.

The validator therefore applies three linked rules:

1. preserve and verify the historical Release Gate decision against its original baseline and evidence;
2. preserve the prior PR #132 governed checkpoint as ancestry and audit history;
3. reject any new product/API/runtime drift after `c107703e...` unless a later explicit reconciliation advances the checkpoint.

## Fail-closed boundary after the checkpoint

After `c107703e...`, governance/evidence-only maintenance may proceed without being classified as product drift. Product/API/runtime changes remain fail-closed.

Examples that must continue to invalidate the Release Gate lineage until separately reconciled include changes under:

- `apps/**`
- `packages/**`
- `openapi.yaml`
- runtime/environment configuration such as `.env.example`
- authoritative API contract/runtime surfaces

This does not weaken the sentinel. It moves the closed boundary to the latest product state that has already completed the required governed revalidation.

## Separation from the next governance lanes

This reconciliation does **not** fix or weaken:

- `Operations State`
- `R3 Full Product Technical Closure`

Those remain separate lanes with their own baselines and evidence. A green `Release Gate Ready State` after this reconciliation means only that the historical Release Gate is preserved, PR #132 remains preserved in lineage, all governed evolution through `c107703e...` is explicitly checkpointed, and future product drift is again fail-closed.

## Merge boundary

Preparation and CI success do not authorize merge. Merge of the reconciliation PR remains a separate explicit human decision by Luis Hernández.
