# Pipelines R3 — Implementation Scope

## Base checkpoint

`main @ f0fb6439b4f186b263dfd70755f1ab2ca5973ac7`

## Canonical visual baseline

- `documentation/ui-reference/r3/pipelines-admin-approved.md`
- `documentation/ui-reference/r3/pipelines-admin-approved.svg`

## Existing contract preserved

- `GET /api/v1/admin/pipelines`
- `GET /api/v1/admin/pipelines/:definitionId`
- `POST /api/v1/admin/pipelines`
- `POST /api/v1/admin/pipelines/:definitionId/versions`
- `POST /api/v1/admin/pipelines/:definitionId/versions/:versionId/activate`
- `PATCH /api/v1/admin/pipelines/:definitionId`
- permission: `pipelines.admin`

## Productization scope

- Preserve the reusable `OperatorShell`; no page-local sidebar/topbar/bottom bar.
- Mark Pipelines as `ready` in centralized operator navigation without widening RBAC.
- Keep directory, definition creation, detail and new-version routes.
- Reconcile visible administrative copy to Spanish while preserving contract enum values.
- De-emphasize UUIDs and internal keys without hiding authoritative configuration data.
- Keep immutable version history visually explicit.
- Keep version activation separate from definition enable/disable.
- Preserve optimistic concurrency behavior and authoritative refetch on HTTP 409.
- Keep the only supported consumer values: `CLAIM`, `RENEWAL`, `COLLECTION`.
- Preserve 1–50 stage constraint and boolean reporting flags.
- Preserve published stage keys and `allowedNextStageKeys`; do not invent display names for keys the API does not publish.

## Explicit non-scope

- No backend changes.
- No authentication changes.
- No RBAC or permission changes.
- No API/OpenAPI contract changes.
- No mutable editing of existing or active versions.
- No delete pipeline action.
- No extra filters, metrics, stage types, consumer types or workflow semantics.
- No rebinding or repair of historical global Visual Functional Review evidence.

## QA contract

Permanent Pipelines R3 browser QA must cover:

- Login with a synthetic `PLATFORM_ADMIN` identity.
- Sidebar navigation to `/operator/admin/pipelines`.
- Directory and definition detail at 1366×768, 1280×720, 1024×768 and 390×844.
- No page-level horizontal overflow.
- No internal overflow in definition cards or stage maps.
- Compact title/directory density.
- Responsive stage map and version facts.
- Visible separation of definition state, active version and immutable version history.
- Full version UUID hidden behind secondary `Detalles técnicos` disclosure.
- No unsupported consumer value in create form.
- Creation/new-version screens keep mobile controls at least 44px tall.
- Existing version cards expose activation only for DRAFT versions.
- Definition enable/disable remains separate from DRAFT activation.
- Severe browser console errors fail the gate.
- Screenshots are uploaded from the exact PR head SHA.
