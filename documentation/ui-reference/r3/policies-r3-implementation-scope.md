# Policies R3 — implementation scope

Base checkpoint: `main @ 402ee7bcf239c0bc5da6625fbd60b6b183e295db`

## Canonical references
- `policy-directory-approved.svg`
- `policy-directory-approved.md`
- `policy-360-approved.svg`
- `policy-360-approved.md`

## Contract preserved
- `GET /api/v1/operator/policies`
- `GET /api/v1/operator/policies/:policyId`
- `PolicyListItem` / `PolicyDetail`
- `policies.read`

## Visual/productization scope
- compact Policy Directory density
- explicit row-to-card transformation for tablet/mobile to avoid internal horizontal scrolling
- compact Policy 360 identity, facts, customer context, operational metadata, assets and related claims
- permission-aware Customer 360 and Claim Detail navigation
- Policies sidebar item becomes `ready` only in the candidate branch
- permanent Policies R3 viewport QA at 1366x768, 1280x720, 1024x768 and 390x844

## Out of scope
- backend/auth/RBAC/API contract changes
- create/edit/delete/export/bulk policy actions
- unsupported filters
- premium, effective dates, product/branch, currency, payment method or commercial coverages not present in R3
- documents or communication actions not backed by authoritative operations
- reinterpretation of opaque operational metadata

## Governance
The reusable `OperatorShell` remains the only shell authority. No page duplicates Sidebar, Topbar or BottomBar structures. Keep the pull request Draft until viewport QA is green and Luis gives explicit visual approval. Merge requires separate explicit authorization.
