# Insurance Claims Legacy Modernization — Claims Operations Experience v0.2.0

## Release identity

- Project version: `0.2.0`
- Historical baseline: `0.1.0`
- Intended annotated Git tag after governed publication approval: `v0.2.0`
- Release name: `Insurance Claims Legacy Modernization — Claims Operations Experience v0.2.0`
- Blueprint consumer baseline: `0.5.2`
- Delivery model: `GREENFIELD` modernization with legacy coexistence `SIMULATED`
- Post-MVP API contract: `api-v1-r2`
- Release formalization status in this PR: `CANDIDATE`

> Publication note: this PR formalizes project/package version `0.2.0`; it does not create a Git tag or GitHub Release. Publication must target the verified `main` commit after explicit human approval.

## What changed since 0.1.0

### Claims Operations Experience

The operator experience now includes:

- operations Dashboard;
- Claims Workspace with operational Kanban projection;
- Claim Operations Detail;
- Tasks Workspace;
- real ClaimTask lifecycle;
- Claim Timeline read projection;
- Evidence Attention projection;
- customer-safe Public Tracking continuity;
- responsive Claim Detail and mobile case-study disclosure continuity.

The Claims Workspace does not replace the authoritative Claim lifecycle. Status mutation remains server-authoritative and uses explicit transitions.

### Task lifecycle is separate from Claim lifecycle

Completing an `EVIDENCE_REVIEW` task updates the task, Evidence Attention and Timeline, but does not change Claim Status.

The curated review proved:

- open tasks: `2 → 1`;
- pending evidence attention: `1 → 0`;
- Claim status after task completion: `RECEIVED`;
- Claim status after explicit lifecycle transition: `UNDER_REVIEW`;
- Public Tracking after transition: `UNDER_REVIEW`.

### API revision r2

`api-v1-r2` preserves the immutable `api-v1-r1` base and adds five governed operator operations:

1. `listTasks`
2. `listClaimTasks`
3. `completeClaimTask`
4. `getClaimTimeline`
5. `getClaimEvidenceAttention`

The effective API surface is `15` operations: `10` historical base operations plus `5` additive operations.

`API-IMPACT-001` classifies this as `platform_cross_cutting`, requires web-platform revalidation, and requires unrelated accepted `0.1.0` evidence to remain preserved.

## Fresh verification evidence

The Claims Operations increment review exercised the real application journey with:

- PostgreSQL 18;
- simulated legacy coexistence;
- real API;
- real React client;
- Chrome 152;
- desktop and mobile coverage including `390×844`;
- 12 committed screenshots.

Journey:

`Home → public Claim with evidence → operator login → Dashboard → Claims Workspace → Claim Detail → complete Evidence Review → refresh Dashboard/Tasks → explicit Claim transition → customer-safe Public Tracking`

The machine review reached `machine_review_ready: true`, required human review, and preserved historical MVP evidence. Human acceptance of the increment was subsequently captured through the explicitly approved and merged PR #31.

## Version alignment

The release formalization aligns the complete npm monorepo to `0.2.0`:

- root package;
- API;
- web client;
- MCP boundary;
- legacy simulator;
- Domain;
- Application;
- Infrastructure;
- internal workspace dependency references;
- package-lock workspace metadata.

The lockfile is regenerated under Node.js 24 to preserve package metadata consistency.

## Historical evidence remains immutable

Version `0.2.0` does not rewrite the historical `0.1.0` Release Gate, Operations State, Visual Functional Review, interface inventory, `.blueprint/status.yaml`, or `api-v1-r1` evidence.

The three known historical red locks remain intentional and are not converted to green by mutating historical evidence:

- `Release Gate Ready State`;
- `Operations State`;
- `Visual Functional Review Ready - Web`.

Fresh post-MVP review evidence is used instead.

## Architecture and boundaries

The project continues to enforce Clean Architecture + Ports & Adapters across:

- Domain;
- Application;
- API/presentation;
- Infrastructure;
- React client;
- MCP;
- simulated legacy integration.

The UI is not authoritative for business lifecycle decisions.

## Case-study disclosure

**Caso técnico no oficial · No oficial · Sin afiliación**

This is a portfolio technical case study. All business data are synthetic/demo data. It does not represent FAR production infrastructure, private processes, insurer rules, production data, or an official FAR implementation.

## Evidence references

- [Claims Operations increment review](../claims-operations/CLAIMS_OPERATIONS_INCREMENT_REVIEW.md)
- [Generated increment review](../claims-operations/review/generated/claims-operations-increment-review.json)
- [API contract revision r2](../api/post-mvp/API_CONTRACT_REVISION_R2.json)
- [Release formalization evidence](../release/CLAIMS_OPERATIONS_RELEASE_0.2.0.md)
- [Historical v0.1.0 release notes](RELEASE_NOTES_v0.1.0.md)

## Publication governance

After the formalization PR is merged:

1. verify the resulting `main` SHA;
2. verify there are no unexpected open PRs or unexplained current CI failures;
3. obtain the required explicit human publication approval;
4. create annotated tag `v0.2.0` from that exact verified commit;
5. verify the tag resolves to that commit;
6. create the GitHub Release targeting exactly `v0.2.0` using this file as its release-note source.

The tag and GitHub Release are deliberately outside this PR and remain human-gated actions.
