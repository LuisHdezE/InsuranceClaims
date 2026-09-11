# R3 Web Productization — Increment 12

## Scope

Increment 12 productizes **Automation Administration** for the existing R3 platform-administration contract.

Baseline before implementation:

- repository: `LuisHdezE/InsuranceClaims`
- canonical branch: `main`
- canonical main SHA: `48154250d2e8d09df65044917809e3f591068ed3`
- Blueprint consumer baseline: `0.5.2`
- delivery mode: GREENFIELD with SIMULATED legacy coexistence
- synthetic/demo data only

The increment does not modify Blueprint Master, API controllers, application/domain behavior, persistence, OpenAPI, historical readiness evidence, release metadata, tags, or versions.

## Productized routes

1. `/operator/admin/automations`
2. `/operator/admin/automations/new`
3. `/operator/admin/automations/:definitionId`
4. `/operator/admin/automations/:definitionId/versions/new`

All routes are presentation-gated by `automations.admin`. The API remains authoritative.

## Frozen R3 operations consumed

- `listAutomations`
- `getAutomation`
- `createAutomation`
- `createAutomationVersion`
- `activateAutomationVersion`
- `updateAutomationState`

No execution-history or runtime-action UI is invented because this admin surface is limited to the published definition/version administration contract.

## Definition lifecycle

A new Automation definition contains:

- stable `key`
- definition-level `displayName`
- `enabled = false`
- no active version initially
- authoritative definition `version`
- first immutable DRAFT version

Configuration changes never edit historical versions in place. They create a new DRAFT version.

Activation and enable/disable are separate operations.

Version creation, activation and state changes submit the current authoritative definition `version` as `expectedDefinitionVersion`.

A 409/version conflict causes an authoritative refetch. The web does not blind-retry stale mutations.

## Rule content

Each immutable version contains exactly the published rule model:

- `when`
- `if`
- `wait`
- `then`
- `sourceClassification`

### Trigger allowlist

The editor exposes only:

- `CLAIM_CREATED`
- `CLAIM_STATE_TRANSITIONED`
- `CLAIM_TASK_COMPLETED`
- `COMMUNICATION_DELIVERED`
- `INBOUND_EVENT_PROCESSED`
- `SCHEDULED_CHECK`

No custom event names are accepted by the UI.

### Conditions

The editor supports at most 20 conditions.

Published operators:

- `EQ`
- `NEQ`
- `IN`
- `NOT_IN`
- `EXISTS`
- `NOT_EXISTS`

Condition fields use the published stable-key pattern.

Scalar values preserve their R3 type:

- string
- number
- boolean
- null

`IN` and `NOT_IN` are represented as explicit scalar lists, bounded to 1–20 items. The UI does not flatten them into comma-delimited strings.

`EXISTS` and `NOT_EXISTS` send no value.

### Wait

Wait is optional.

When enabled, `delaySeconds` must be an integer from:

- minimum: 60 seconds
- maximum: 2,592,000 seconds (30 days)

### Actions

Each version contains 1–20 actions.

The editor exposes only the published action types:

- `CREATE_TASK`
- `MOVE_OPERATIONAL_STAGE`
- `REQUEST_COMMUNICATION`
- `ADD_OPERATIONAL_TAG`
- `NOTIFY_OPERATOR`
- `PAUSE_AUTOMATION`
- `UPDATE_APPROVED_FIELD`
- `SCHEDULE_CHECK`

Action keys use the stable-key pattern and must be unique within a version.

Action parameters are represented as explicit key/scalar rows. R3 does not publish a per-action parameter schema, so the web does not invent required parameters, business vocabulary, target relationships, or execution semantics.

The published safety boundary is preserved:

- maximum 20 parameters per action
- parameter keys remain stable keys
- parameter keys associated with URL/URI, SQL, script/code, secret, token, or password categories are rejected
- string scalars that contain `javascript:` or start with `http://` or `https://` are rejected
- numbers must be finite

The API remains the final validator.

## Source classification

`sourceClassification` is presented as an opaque configured value with the published 80-character bound.

The UI does not infer governance, insurer, compliance, provenance, or security meaning from its contents.

## Directory boundary

The R3 list contract exposes server pagination only.

The web therefore does not fabricate search/filter behavior for:

- key
- display name
- trigger
- action type
- enabled state
- version status

This avoids misleading partial client-side filtering of only the current page.

## Access boundary

`PLATFORM_ADMIN` owns `automations.admin` in the existing presentation grant mirror.

`CLAIMS_OPERATOR` and `CLAIMS_SUPERVISOR` do not.

Productizing Automation Administration does not grant Platform Admin:

- `claims.backoffice.read`
- `claims.backoffice.transition`
- `claims.tasks.read/manage`
- Customer/Policy permissions
- Renewals permissions
- Collections permissions

Platform Admin remains a platform administrator, not an implicit business-operations superuser.

## Navigation and Workspace

The Operator Shell adds a permission-aware `Automations` navigation item.

The Workspace replaces the planned Automations capability with a live card linking to `/operator/admin/automations`.

`Platform Next` is narrowed to the final remaining R3 web-productization block: **Governed Imports**.

`r3-mobile-nav-containment.css` remains the final stylesheet import so the existing mobile overflow containment continues to govern the expanded navigation.

## Interface inventory

Living route-level inventory changes:

- before Increment 12: 42 routes
- after Increment 12: 46 routes

The historical 10-interface MVP inventory is not rewritten.

## Files in the increment

Expected cut: 17 files.

New:

- `apps/web/src/api/automation-admin-types.ts`
- `apps/web/src/api/automation-admin.ts`
- `apps/web/src/api/automation-admin.test.ts`
- `apps/web/src/components/AutomationRuleEditor.tsx`
- `apps/web/src/pages/AdminAutomationsPage.tsx`
- `apps/web/src/pages/AdminAutomationCreatePage.tsx`
- `apps/web/src/pages/AdminAutomationDetailPage.tsx`
- `apps/web/src/pages/AdminAutomationVersionCreatePage.tsx`
- `apps/web/src/automation-admin.css`
- `documentation/web-productization/R3_WEB_INCREMENT_12.md`

Modified:

- `apps/web/src/App.tsx`
- `apps/web/src/auth/staff-access.ts`
- `apps/web/src/auth/staff-access.test.ts`
- `apps/web/src/components/OperatorShell.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/pages/StaffWorkspacePage.tsx`
- `documentation/interface-inventory/INTERFACE_INVENTORY_R3_WEB_PRODUCTIZATION.md`

## Validation expectations

Before HUMAN GATE the exact PR head must pass the established functional matrix, including:

- strict web typecheck
- web tests
- production build
- real-API client integration
- API implementation/QA evidence
- interface inventory validation
- responsive/accessibility browser journey
- offline/degraded browser behavior
- PostgreSQL/persistence checks
- architecture checks

Historical Operations/Release/VFR sentinels are expected to remain visible and must not be rewritten merely to make CI green.

## Merge governance

No merge is authorized by ordinary continuation language.

After exact-head CI and review/comment/thread reconciliation, Increment 12 must stop at HUMAN GATE.

Only explicit approval such as `Apruebo merge PR #NN` authorizes merge.

Merge method remains `merge`, not squash/rebase.

No tag, release, version bump, or publication is part of this increment.
