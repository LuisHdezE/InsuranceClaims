# Claims Operations Experience — Increment Review

**Candidate version:** `0.2.0`  
**Status:** `MACHINE_REVIEW_PENDING`  
**Baseline preserved:** governed MVP `0.1.0`  
**Blueprint baseline:** `0.5.2`

## Purpose

This artifact defines the fresh review boundary for the post-MVP Claims Operations Experience increment. It does not rewrite the accepted MVP interface inventory, historical Visual & Functional Review, release gate, operations state, or human-acceptance evidence.

The package/project version remains `0.1.0` until this increment completes machine review and explicit human approval.

## Increment surfaces under review

The approved consumer-local visual target is `documentation/claims-operations/VISUAL_TARGETS.md`.

| Surface | Route | Increment target |
|---|---|---|
| Public landing continuity | `/` | prove the landing remains functional and the embedded hero renders |
| Operations Dashboard | `/operator/dashboard` | `WEB-011` target |
| Claims Workspace | `/operator/claims` | evolution of `WEB-009` |
| Claim Operations Detail | `/operator/claims/:claimId` | evolution of `WEB-010` |
| Tasks Workspace | `/operator/tasks` | `WEB-012` target |
| Public tracking continuity | `/claims/track` | prove customer-safe projection remains separate |

## Curated end-to-end review journey

The review must execute against PostgreSQL, the simulated legacy boundary, the real API, and the rendered React client.

```text
Public Home
  -> rendered embedded hero
  -> verify synthetic policy/vehicle
  -> create synthetic Claim with evidence
  -> receive tracking proof
  -> authenticate operator
  -> Dashboard sees authoritative Claim + tasks
  -> Claims Kanban sees authoritative Claim
  -> Claim Detail shows Tasks + Evidence Attention + Timeline
  -> complete EVIDENCE_REVIEW task
  -> Evidence Attention becomes REVIEWED
  -> Claim remains RECEIVED
  -> Dashboard evidence-pending count drops
  -> perform explicit Claim transition RECEIVED -> UNDER_REVIEW
  -> Timeline records STATUS_CHANGED
  -> public tracking shows customer-safe updated status
```

## Machine acceptance contract

The generated review must prove all of the following:

1. The public Home hero is actually rendered (`naturalWidth > 0`) and uses the repo-owned embedded AVIF data URI.
2. The full synthetic Claim is created through the rendered public UI, not by inserting database rows directly.
3. Protected operator routes require authentication.
4. Dashboard, Claims, Claim Detail and Tasks render the authoritative Claim/work data created in the same journey.
5. The four operational surfaces preserve the approved Claims Operations shell and visible no-affiliation/synthetic-data disclosure.
6. Desktop and 390×844 mobile views have no document-level horizontal overflow.
7. Each reviewed surface has one H1 and no unlabeled enabled form controls or images without `alt`.
8. `EVIDENCE_REVIEW` completion changes Evidence Attention from pending to reviewed while the Claim remains `RECEIVED`.
9. Only an explicit Claim transition changes the authoritative Claim lifecycle to `UNDER_REVIEW`.
10. Timeline exposes the durable task completion and later status change.
11. Customer tracking stays a separate customer-safe projection and reflects the status change without exposing internal task/audit data.
12. Browser console contains no unexpected severe errors.

## Evidence boundary

Fresh generated evidence belongs under:

`documentation/claims-operations/review/generated/`

It is increment-local evidence. It must never replace or mutate:

- `documentation/visual-functional-review/` historical MVP evidence;
- `.blueprint/ui/interface-inventory.json` accepted MVP inventory;
- `.blueprint/status.yaml` historical accepted state;
- historical release/operations/visual-review ready-state artifacts.

## Human gate

Machine success moves this increment only to `READY_FOR_HUMAN_REVIEW`.

The candidate does **not** become release-ready and the project version does **not** become `0.2.0` until Luis explicitly reviews/approves the fresh increment evidence in a governed PR.
