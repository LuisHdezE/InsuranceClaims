# Task 12 — Full-system R3 reconciliation note

## Baseline

Task 12 starts only after the governed parallel-lane integration landed on `main` at:

`3c28b3b2606dbb27d5c5d99abf0ebc2ae799d8aa`

The reconciliation is presentation-focused. It does not expand R3 scope, change the Blueprint Master, redefine API contracts, alter RBAC grants or duplicate business logic in the web client.

## Canonical criteria reviewed

- `documentation/ui-reference/r3/README.md`
- `documentation/ui-reference/r3/staff-workspace-r3-approved.md`
- `documentation/ui-reference/r3/recovery-operations-approved.md`
- Current `App.tsx` route guards
- Current presentation access matrix in `apps/web/src/auth/staff-access.ts`
- Current global `OperatorShell` and `StaffWorkspacePage`

The governing UI rules remain: Spanish visible to the user, compact operational hierarchy, role-aware navigation, authoritative API behavior, technical identifiers visually secondary, and no invented capabilities.

## Reconciliation findings and decisions

### 1. Global shell language drift — corrected

The integrated shell mixed Spanish navigation with English labels such as `Workspace`, `Dashboard`, `Claims`, `Tasks`, `Analytics`, `Guidance`, `Automations`, `Imports` and `Recovery`.

Task 12 reconciles those user-facing labels to Spanish while preserving the same routes, permissions and capabilities. Technical nouns explicitly retained by the approved references, such as `pipeline`, `dry-run`, `commit` and `dead-letter`, remain where they carry contract meaning.

### 2. Staff Workspace language drift — corrected

The role-aware launchpad used mixed English/Spanish titles, kickers and actions. Task 12 reconciles the visible copy to Spanish and shows the human role label instead of the raw role code in the access-principles strip.

The capability filtering logic is unchanged.

### 3. Claim Detail shell context — corrected

The global shell recognized only the exact `/operator/claims` path, so Claim Detail inherited the generic workspace context. The context now applies consistently to the Claims route family without changing routing or authorization.

### 4. Recovery entry permission boundary — reviewed and intentionally unchanged

`AdminRecoveryPage` can degrade individual panels according to `operations.integration.read` and `operations.dead_letters.read`, while the canonical Staff Workspace entry explicitly requires both read permissions for the Recovery capability.

Therefore Task 12 does **not** weaken the route or navigation guard. `PLATFORM_ADMIN` continues to receive both read permissions under the frozen R3 presentation matrix, and the dead-letter detail keeps its dedicated read guard.

## Regression protection

`OperatorShell.test.tsx` and `StaffWorkspacePage.test.tsx` now assert the reconciled Spanish labels while preserving role filtering and the existing authorization boundaries.

## Explicit non-changes

- No API endpoint changes.
- No backend or persistence changes.
- No RBAC grant changes.
- No new routes.
- No new business actions.
- No fabricated data or UI-only business semantics.
- No Blueprint Master changes.

The branch must still pass exact-head technical QA and desktop/mobile visual review before human merge approval.
