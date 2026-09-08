# Evidence Attention / Review UX

## Objective

Turn protected Claim evidence from a passive attachment list into an operational review surface without introducing insurer-specific adjudication rules, duplicate Claim state, or a second evidence source of truth.

## Scope

- keep `claim_evidence` as the durable evidence source already associated to the Claim
- use `ClaimTask` as the human-work authority for evidence review work
- project evidence attention from durable evidence metadata plus open/completed `EVIDENCE_REVIEW` tasks
- make evidence review visible inside Claim Detail and discoverable from the Tasks workspace / Dashboard
- preserve protected evidence download behavior
- preserve Claim lifecycle independence: reviewing evidence does not transition the Claim
- preserve Operator Timeline / Audit Log / Public Tracking separation

## Evidence attention model

Initial operational states are projections, not a new persisted evidence state machine:

- `PENDING_REVIEW`: evidence has an open `EVIDENCE_REVIEW` task
- `REVIEWED`: the corresponding `EVIDENCE_REVIEW` task is completed
- `AVAILABLE`: evidence exists but no review task can be correlated

No `APPROVED`, `REJECTED`, fraud, coverage, liability, damage-severity, or insurer-decision semantics are introduced in this increment.

## Correlation

The automatic `EVIDENCE_REVIEW` task created during Claim intake remains the durable unit of work. The read projection correlates it to Claim evidence using durable task source/correlation metadata already present in the ClaimTask model. If exact per-file correlation is not represented durably, the UX must present review attention at Claim-evidence-group level rather than inventing per-file review truth.

## UI target

Claim Detail Evidence panel should show:

- protected file metadata
- review-attention badge derived from durable task state
- related task status and operator/completion metadata when available
- protected download action
- a clear path to complete the related evidence-review task when permitted

Dashboard / Tasks should continue using server-side task filtering for accurate attention counts.

## Acceptance criteria

1. Evidence review attention is derived from durable data only.
2. Completing evidence review work completes `ClaimTask` only and does not change Claim status.
3. Timeline projects the resulting `TASK_COMPLETED` fact through its existing projection.
4. Public tracking exposes no evidence-review task state or internal review metadata.
5. Protected evidence download remains JWT/RBAC controlled.
6. Responsive desktop/mobile browser QA remains free of horizontal overflow.
7. Historical v0.1.0 evidence and Blueprint Master remain untouched.

## Non-goals

- insurer adjudication decisions
- evidence approve/reject workflow
- document classification or OCR
- fraud scoring
- policy coverage determination
- generic document-management subsystem
- communication automation
- AI review
