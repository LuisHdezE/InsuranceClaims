# R3 Web Productization - Increment 09

## Claims Analytics

Increment 09 productizes the frozen R3 Claims Analytics read model as a standalone, permission-aware web surface.

### Baseline

- Blueprint consumer baseline: `0.5.2`
- expected repository baseline before mutation: `6c7caa35dc8942daf68fceb9facfe4f5b5611a86`
- delivery mode: GREENFIELD with legacy coexistence SIMULATED
- data policy: synthetic/demo only

## Product surface

### `/operator/analytics`

Access:

- requires `claims.analytics.read` only;
- Claims Supervisor has access;
- Platform Admin has access;
- Claims Operator does not have access.

The page uses the existing `getClaimsOperationalMetrics` client against:

`GET /api/v1/operator/analytics/claims?from=<RFC3339>&to=<RFC3339>`

No new API client contract is introduced.

## Published metrics only

The UI displays exactly the metrics returned by R3:

- `openClaims`
- `reportedInWindow`
- `claimsByStatus`
- `claimsByOperationalStage`
- `evidencePendingReviewClaims`
- `openTasks`
- `overdueTasks`
- `closedClaims`
- `window.from`
- `window.to`
- `window.semantics`
- `generatedAt`

The UI does not derive rates, percentages, averages, SLAs, trends, deltas, forecasts, severity, financial impact, or other inferred KPIs.

## Window semantics

The page offers bounded 7, 30, and 90 day presets as a client convenience. Each preset serializes exact RFC 3339 `from` and `to` values.

The server response remains authoritative and the UI displays the published `[from,to)` semantics.

An important distinction is surfaced explicitly:

- `reportedInWindow` is calculated from Claim `createdAt` inside `[from,to)`;
- the other aggregate values are snapshots calculated against the repository state at `generatedAt`.

The browser does not pretend those snapshots are window totals.

## Authorization boundary

Increment 09 closes the presentation gap where Platform Admin owned `claims.analytics.read` but could not use Analytics without entering the business Dashboard.

The new route does **not** grant Platform Admin:

- `claims.backoffice.read`
- `claims.tasks.read`
- Customer read
- Policy read
- Renewals read/manage
- Collections read/manage

The page contains no links to individual Claim or Task records and performs no business mutations.

## Navigation

A dedicated `Analytics` navigation item appears only when `claims.analytics.read` is present.

The Workspace Analytics card becomes live and links to `/operator/analytics`.

Default landing behavior is unchanged:

- Claims Operator -> Dashboard
- Claims Supervisor -> Dashboard
- Platform Admin -> Workspace

The Analytics route is available as an explicit deep link to Supervisor and Platform Admin.

## Productization inventory

Increment 09 adds one route-level interface:

- `/operator/analytics`

The living R3 inventory therefore moves from 33 to 34 route-level interfaces.

The historical 10-interface MVP inventory remains immutable.

## Files in the increment

New:

- `apps/web/src/pages/OperatorAnalyticsPage.tsx`
- `apps/web/src/claims-analytics.css`
- `documentation/web-productization/R3_WEB_INCREMENT_09.md`

Updated:

- `apps/web/src/App.tsx`
- `apps/web/src/auth/staff-access.ts`
- `apps/web/src/auth/staff-access.test.ts`
- `apps/web/src/components/OperatorShell.tsx`
- `apps/web/src/pages/StaffWorkspacePage.tsx`
- `apps/web/src/main.tsx`
- `documentation/interface-inventory/INTERFACE_INVENTORY_R3_WEB_PRODUCTIZATION.md`

## Validation expectations

Exact-head validation must prove:

- strict web typecheck;
- web tests;
- production web build;
- existing real-API integration;
- full Integration QA including responsive/accessibility and degraded behavior;
- API/OpenAPI regression safety;
- interface inventory and design-system checks.

Historical Operations/VFR/Release Ready sentinels remain immutable and may continue to report expected post-closure drift.

## Governance

No merge is permitted without explicit human approval after exact-head CI and review reconciliation.
