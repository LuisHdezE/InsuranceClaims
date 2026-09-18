# Tasks Operational R3 — implementation scope

Status: CANDIDATE / visual review pending

Canonical references:

- `documentation/ui-reference/r3/tasks-operational-approved.svg`
- `documentation/ui-reference/r3/tasks-operational-approved.md`

## Scope of this visual increment

- preserve the existing authoritative `/api/v1/operator/tasks` contract
- preserve Task workflow independence from ClaimStatus
- retain the current server-representable scopes instead of inventing an unsupported `unassigned` query
- compact the operational heading, scope navigation, filters, queue and inline context
- preserve desktop master-detail composition
- stack workspace and dedicated task detail below desktop workspace width
- keep mobile interactive targets at least 44 px
- activate the existing Tasks navigation item only within this candidate branch
- add permanent viewport QA for both `/operator/tasks` and `/operator/tasks/:taskId`

## Deliberate non-changes

- no backend changes
- no auth or RBAC changes
- no API contract changes
- no synthetic Task-to-ClaimStatus coupling
- no client-side approximation of an authoritative unassigned queue
- no new task notes or operator directory features without a canonical API contract

## Review rule

This candidate remains Draft until viewport QA is green and Luis gives explicit visual approval. Visual approval does not authorize merge.
