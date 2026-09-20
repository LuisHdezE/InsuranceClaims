# R3 Release Publication Lineage Reconciliation

## Purpose

Reconcile the permanent `R3 Release Formalization 0.3.0` workflow with the fact that Gate B already completed and `v0.3.0` is now a published historical release.

This is a governance-only reconciliation. It does not republish, retag, move, overwrite or recreate `v0.3.0`. It changes no product behavior, API contract, persistence, RBAC, runtime configuration, package version or historical release payload.

## Current reconciliation base

This reconciliation starts after PR #135:

- current `main`: `8145a401f4e09c99758cc42effcabd695a69b75e`
- PR #135: R3 Full Product Technical Closure lineage reconciliation

The product has continued to evolve after `v0.3.0`; the published release itself must remain immutable history rather than forcing the current product tree to look exactly like the release-day tree.

## Historical release formalization remains immutable

PR #92 performed Gate A release formalization:

- formalization baseline: `47e1745ad5cbe65c9a1b54dcae236bad7205d92b`
- PR #92 candidate head: `23cf9e812198e90036beb3555885198fe35e4546`
- formalization merge / immutable release commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- candidate version: `0.3.0`
- previous published release: `v0.2.0`
- contract: `api-v1-r3`
- effective REST surface: 90 operations / 76 paths / 16 families
- productized web surfaces: 22
- Blueprint consumer: `0.5.2`
- delivery mode: `GREENFIELD`
- legacy coexistence: `SIMULATED`

The historical formalization boundary remains exactly the 16 files approved by PR #92. This reconciliation validates those files at the historical commit instead of requiring today's product files to remain byte-equivalent to the release candidate forever.

## Historical publication gate remains immutable

PR #93 performed Gate B:

- PR #93 candidate head: `63780befd251358bdd16d03f9a111462edf5dd69`
- publication-gate merge: `8425dcab54c3998f9580a7e29773550f1e8bce8f`
- immutable release target: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- annotated tag: `v0.3.0`
- release name: `Insurance Claims Legacy Modernization — R3 Full Product v0.3.0`

The historical publication-gate boundary remains exactly four files:

1. `.github/workflows/release-formalization-0.3.0.yml`
2. `documentation/portfolio/GITHUB_RELEASE_BODY_v0.3.0.md`
3. `documentation/portfolio/R3_RELEASE_PUBLICATION_GATE_0.3.0.md`
4. `scripts/validate-release-formalization-0.3.0.mjs`

## Publication actually completed

The `push` created by merging PR #93 executed:

- workflow: `R3 Release Formalization 0.3.0`
- run: `34792695296`
- result: `SUCCESS`
- publication-gate merge: `8425dcab54c3998f9580a7e29773550f1e8bce8f`

The published remote identity is:

- annotated tag: `v0.3.0`
- tag object: `20c9d933e89854229259819ccbbb71b1a72a08fc`
- peeled commit: `014b2a4c4c38d94b07346aaa54bc32a8bbb7c5f9`
- GitHub Release ID: `388080952`
- release name: `Insurance Claims Legacy Modernization — R3 Full Product v0.3.0`
- published at: `2026-09-14T00:27:06Z`
- draft: `false`
- prerelease: `false`

This is the state the permanent workflow must now preserve.

## Why the old sentinel became red

The workflow and validator were designed for the period before Gate B had executed. They correctly required:

- `v0.3.0` to be absent;
- no GitHub Release to exist yet;
- current package manifests to still look like the original formalization candidate;
- every path changed after the formalization merge to equal the four-file publication-gate boundary.

Those assertions were correct before publication. After publication and later governed product evolution, they became historically stale:

- `v0.3.0` now exists by design;
- the GitHub Release now exists by design;
- later governed product work legitimately changed package/runtime/product files;
- PRs #94 onward intentionally advanced the repository beyond the four-file publication gate.

The red state therefore does not indicate that `v0.3.0` was corrupted. It indicates that a pre-publication preflight continued running after its one-time publication event had completed.

## Reconciled permanent semantics

The workflow now becomes a read-only publication-integrity sentinel.

It must prove:

1. the historical PR #92 formalization boundary is still exact;
2. the historical PR #93 publication-gate boundary is still exact;
3. the release-day package identity at `014b2a4c...` is exactly `0.3.0` and differs from the `0.2.0` baseline only by governed release identity metadata;
4. historical release documentation remains preserved;
5. `v0.2.0` still peels to its original release commit;
6. `v0.3.0` is an annotated tag with the exact historical tag object and peels to `014b2a4c...`;
7. the remote GitHub Release exists with the governed name, target, body and public/non-prerelease state;
8. the current workflow has no release-creation job and no `contents: write` permission.

The workflow must perform no publication side effects.

## Separation from later product evolution

`v0.3.0` is a historical immutable release, not a permanent freeze of `main`.

Later governed product/API/runtime evolution must not make the historical publication sentinel red merely because the current tree differs from release day. Those later changes are governed by their own current-product gates, including Release Gate lineage, Operations lineage, VFR and R3 Full Product Technical Closure.

Conversely, later product evolution must never be allowed to retarget or rewrite `v0.3.0`.

## Current side-effect boundary

After this reconciliation:

- the workflow has read-only repository permissions;
- no job creates tags or GitHub Releases;
- no branch or product checkpoint is advanced by this release sentinel;
- publication integrity is verified against historical commits plus remote tag/release identity;
- any mismatch in the published `v0.3.0` identity remains fail-closed.

## Merge boundary

Preparation and CI success do not authorize merge. This reconciliation must stop at Ready for Review and requires a separate explicit merge approval from Luis Hernández.
