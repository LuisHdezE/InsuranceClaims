# Claims Operations Experience — Release Formalization 0.2.0

## Status

**Release status: `RELEASED`**

This artifact records the completed release formalization and publication of the already reviewed Claims Operations Experience increment as project version `0.2.0`. It does **not** rewrite or reopen the historical `0.1.0` MVP Release Gate.

The formalization was merged through PR #32. The separate human-governed publication gate was then completed by creating annotated tag `v0.2.0` and publishing the GitHub Release from that exact tag.

## Release identity

- Project: `LuisHdezE/InsuranceClaims`
- Release name: `Insurance Claims Legacy Modernization — Claims Operations Experience v0.2.0`
- Released version: `0.2.0`
- Historical baseline version: `0.1.0`
- Blueprint consumer baseline: `0.5.2`
- Delivery model: `GREENFIELD` with legacy coexistence `SIMULATED`
- Source baseline for formalization: `531828a18babaca563c83dd76df56b725d6105f0`
- Source baseline meaning: merge of the human-approved Claims Operations Increment Review, PR #31
- Formalization branch: `blueprint/claims-operations-release-0.2.0`
- Formalization PR: `#32`
- Formalization merge commit: `9265417849f398f5d1efa56b7cd8ff365b950dbb`
- Annotated tag: `v0.2.0`
- Annotated tag object SHA: `1a946e7fc4a20d20b97876826e6a699ec8412f28`
- Tag target commit: `9265417849f398f5d1efa56b7cd8ff365b950dbb`
- GitHub Release ID: `384441015`
- GitHub Release published at: `2026-09-08T04:09:58Z`
- GitHub Release page: [v0.2.0](https://github.com/LuisHdezE/InsuranceClaims/releases/tag/v0.2.0)

**Caso técnico no oficial · No oficial · Sin afiliación**

All business data used by this case study are synthetic/demo data. This repository does not claim FAR production processes, insurer-specific rules, private infrastructure, production data, or organizational affiliation.

## Governed evidence chain

The `0.2.0` release derives from already accepted post-MVP evidence rather than by mutating `0.1.0` evidence:

1. **Human-approved Claims Operations increment**
   - PR #31 approved and merged.
   - Review evidence: `documentation/claims-operations/CLAIMS_OPERATIONS_INCREMENT_REVIEW.md`.
   - Machine evidence: `documentation/claims-operations/review/generated/claims-operations-increment-review.json`.
   - Candidate version in the frozen increment review: `0.2.0`.
   - Baseline version: `0.1.0`.
   - Fresh screenshots: `12`.
   - Browser: Chrome 152.
   - Historical MVP evidence preserved: `true`.

2. **Post-MVP API governance**
   - Contract revision: `api-v1-r2`.
   - Effective API composition: `10` base operations + `5` additive operations = `15` operations.
   - API impact artifact: `.blueprint/api-impact/API-IMPACT-001.json`.
   - Impact classification: `platform_cross_cutting`.
   - Revalidation policy: `platform`.
   - Unrelated accepted evidence must remain preserved.

3. **Fresh end-to-end validation**
   - PostgreSQL 18.
   - simulated legacy adapter.
   - real API and React client.
   - Chrome 152 curated journey.
   - desktop and `390×844` mobile evidence.
   - customer-safe Public Tracking verified after an explicit Claim transition.

4. **Release formalization and publication**
   - PR #32 explicitly human-approved and merged.
   - Monorepo package identity aligned to `0.2.0`.
   - Annotated tag `v0.2.0` created after merge from exact release commit `9265417849f398f5d1efa56b7cd8ff365b950dbb`.
   - Remote tag verified to resolve to the same exact commit.
   - GitHub Release published from `v0.2.0` after the separate publication approval.

## Functional release scope

`0.2.0` adds the Claims Operations Experience on top of the historical MVP:

- operations Dashboard;
- Claims Workspace with a Kanban operational projection;
- Claim Operations Detail;
- Tasks Workspace;
- `ClaimTask` lifecycle;
- Claim Timeline as an Application read projection;
- Evidence Attention derived from the Claim evidence-set and real `EVIDENCE_REVIEW` tasks;
- customer-safe Public Tracking continuity;
- mobile disclosure continuity and responsive Claim Detail stabilization.

The Kanban remains a projection only. It is not the authoritative Claim lifecycle and does not introduce free drag/drop lifecycle mutation.

## Business correctness preserved

The reviewed journey proves the required separation of concerns:

- before evidence review: `1` pending evidence attention item and `2` open tasks;
- after completing `EVIDENCE_REVIEW`: `0` pending evidence attention items and `1` open task;
- Claim status after task completion remains `RECEIVED`;
- only an explicit server-authoritative lifecycle transition changes the Claim to `UNDER_REVIEW`;
- Public Tracking then reports `UNDER_REVIEW` without exposing task internals, audit internals, or operator-only data.

Completing a ClaimTask never changes Claim Status automatically.

## Version metadata formalized

This release aligns the monorepo package identity to `0.2.0` across:

- root `package.json`;
- `apps/api`;
- `apps/web`;
- `apps/mcp`;
- `apps/legacy-simulator`;
- `packages/domain`;
- `packages/application`;
- `packages/infrastructure`;
- root `package-lock.json` workspace metadata.

Internal workspace dependency versions are aligned to `0.2.0`. The lockfile was regenerated with Node.js 24 so the formalization is reproducible rather than a cosmetic version edit.

## Historical evidence preservation

The following historical `0.1.0` evidence remains frozen and must not be changed by this release formalization or post-release closure:

- `.blueprint/status.yaml`;
- `.blueprint/ui/interface-inventory.json`;
- historical Visual Functional Review evidence;
- historical Release Gate readiness/evidence/approval;
- historical Operations state/evidence;
- historical `api-v1-r1` contract and inventory;
- accepted MVP evidence referenced by those artifacts.

The known historical red locks remain intentional historical signals:

- `Release Gate Ready State`;
- `Operations State`;
- `Visual Functional Review Ready - Web`.

They must not be made green by rewriting frozen evidence. The fresh Claims Operations increment review, release formalization and publication record are the governed evidence for this post-MVP cut.

## Mechanical release checks

`Claims Operations Release Formalization 0.2.0` CI verified on the formalization PR head that:

- every monorepo package version is `0.2.0`;
- all internal workspace dependency versions are `0.2.0`;
- lockfile root/workspace versions are `0.2.0`;
- the fresh increment review identifies candidate `0.2.0` over baseline `0.1.0`;
- the increment review reports 12 screenshots and historical evidence preservation;
- `api-v1-r2` composes 15 effective operations;
- `API-IMPACT-001` classifies the change as `platform_cross_cutting` with platform revalidation and preservation of unrelated evidence;
- the frozen historical paths remain byte-for-byte unchanged relative to baseline `531828a18babaca563c83dd76df56b725d6105f0`.

## Human gates

### Gate A — merge formalization PR

**Status: COMPLETE**

PR #32 was explicitly approved and merged. The resulting `main` commit is:

`9265417849f398f5d1efa56b7cd8ff365b950dbb`

### Gate B — publish tag and GitHub Release

**Status: COMPLETE**

After merge, `main` was re-verified at the exact release commit. Following separate explicit human publication approval:

1. annotated tag `v0.2.0` was created;
2. the remote tag was verified to resolve exactly to `9265417849f398f5d1efa56b7cd8ff365b950dbb`;
3. GitHub Release `v0.2.0` was published from that tag;
4. the release was verified as `draft: false` and `prerelease: false`.

The release tag is now the immutable release pointer for version `0.2.0`. Post-release documentation closure must not move, delete or recreate it.

## Publication source

Release-note source: `documentation/portfolio/RELEASE_NOTES_v0.2.0.md`.

## Closure state

`Claims Operations Experience v0.2.0` is technically published and release-governance complete. This post-release documentation closure only synchronizes the repository documentation with the already completed publication state; it does not alter product code, API contracts, historical evidence, the release tag or the published release payload.
