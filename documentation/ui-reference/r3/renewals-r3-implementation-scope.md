# Renewals R3 — Implementation scope

Base checkpoint: `main @ da1499b28b82b1dcd542caee119b129867df6ee0`

## Canonical baseline
- `renewals-approved.md`
- `renewals-approved.svg`

## Existing contract preserved
- `GET /api/v1/operator/renewals`
- `GET /api/v1/operator/renewals/:renewalId`
- `POST /api/v1/operator/renewals/:renewalId/transitions`
- `POST /api/v1/operator/renewals/:renewalId/operational-transitions`
- `renewals.read` / `renewals.manage`

## Candidate visual scope
- compact renewal case directory
- compact case detail without duplicating Customer 360 or Policy 360
- lifecycle and operational pipeline remain independent authorities
- visible Spanish copy
- Customer 360 and Policy 360 links remain permission-aware
- 409 concurrency behavior remains refetch-based
- Renovaciones becomes `ready` in the reusable operator navigation only in this candidate
- permanent viewport and exact 1024px containment QA

## Explicit non-goals
- no backend, auth, RBAC, API or domain changes
- no create/delete renewal actions
- no invented filters
- no invented premium, offers, quotes, metrics or policy commercial data
- no invented display names for next pipeline stages when the contract only publishes keys
- no new lifecycle or pipeline transitions
- no duplicated Customer 360 / Policy 360 content

## Responsive rule
Desktop keeps the compact table. At 1100px and below the directory becomes a card/grid presentation so the operator never depends on internal horizontal scrolling. Mobile interaction targets remain at least 44px.
