# Claims Operations Experience — Release Formalization 0.2.0

## Status

**Release formalization candidate: `0.2.0`**

This artifact formalizes the already reviewed Claims Operations Experience increment as the next project version. It does **not** rewrite or reopen the historical `0.1.0` MVP Release Gate.

The formalization becomes part of `main` only after the release PR is explicitly approved and merged. Creation of an annotated `v0.2.0` tag and GitHub Release remains a separate human-governed publication action.

## Release identity

- Project: `LuisHdezE/InsuranceClaims`
- Release name: `Insurance Claims Legacy Modernization — Claims Operations Experience v0.2.0`
- Candidate version: `0.2.0`
- Historical baseline version: `0.1.0`
- Blueprint consumer baseline: `0.5.2`
- Delivery model: `GREENFIELD` with legacy coexistence `SIMULATED`
- Source baseline for this formalization: `531828a18babaca563c83dd76df56b725d6105f0`
- Source baseline meaning: merge of the human-approved Claims Operations Increment Review, PR #31
- Formalization branch: `blueprint/claims-operations-release-0.2.0`

**Caso técnico no oficial · No oficial · Sin afiliación**

All business data used by this case study are synthetic/demo data. This repository does not claim FAR production processes, insurer-specific rules, private infrastructure, production data, or organizational affiliation.

## Governed evidence chain

The `0.2.0` release candidate derives from already accepted post-MVP evidence rather than by mutating `0.1.0` evidence:

1. **Human-approved Claims Operations increment**
   - PR #31 approved and merged.
   - Review evidence: `documentation/claims-operations/CLAIMS_OPERATIONS_INCREMENT_REVIEW.md`.
   - Machine evidence: `documentation/claims-operations/review/generated/claims-operations-increment-review.json`.
   - Candidate version: `0.2.0`.
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

Internal workspace dependency versions are aligned to `0.2.0`. The lockfile is regenerated with Node.js 24 so the formalization is reproducible rather than a cosmetic version edit.

## Historical evidence preservation

The following historical `0.1.0` evidence remains frozen and must not be changed by this release formalization:

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

They must not be made green by rewriting frozen evidence. The fresh Claims Operations increment review and its release formalization are the governed evidence for this post-MVP cut.

## Mechanical release checks

`Claims Operations Release Formalization 0.2.0` CI must verify on the exact PR head that:

- every monorepo package version is `0.2.0`;
- all internal workspace dependency versions are `0.2.0`;
- lockfile root/workspace versions are `0.2.0`;
- the fresh increment review still identifies candidate `0.2.0` over baseline `0.1.0`;
- the increment review still reports 12 screenshots and historical evidence preservation;
- `api-v1-r2` still composes 15 effective operations;
- `API-IMPACT-001` still classifies the change as `platform_cross_cutting` with platform revalidation and preservation of unrelated evidence;
- the frozen historical paths remain byte-for-byte unchanged relative to baseline `531828a18babaca563c83dd76df56b725d6105f0`.

## Human gates

### Gate A — merge formalization PR

Before merge:

1. verify the PR is open and mergeable;
2. verify its exact head SHA;
3. verify current CI for that exact head;
4. distinguish the three known historical red locks from any new/current failure;
5. require explicit human approval from Luis.

`adelante`, `continua` or `seguimos` are not merge approval.

### Gate B — publish tag and GitHub Release

After the merge, re-verify `main` and the resulting merge SHA. Then, and only after a separate explicit human publication approval if required, create the annotated tag `v0.2.0` from the verified release commit and create the GitHub Release from that exact tag.

No tag or GitHub Release is created by this formalization PR.

## Publication source

Release-note source: `documentation/portfolio/RELEASE_NOTES_v0.2.0.md`.
