# Custom Fields R3 — implementation scope

## Canonical baseline
- `documentation/ui-reference/r3/custom-fields-r3-approved.md`
- `documentation/ui-reference/r3/custom-fields-r3-approved.svg`

## Base checkpoint
`main @ c18ab09a7aceaf2e66f34019a1fd0129c7aa3c7e`

## Existing product surface
- `/operator/admin/custom-fields`
- `/operator/admin/custom-fields/new`
- `/operator/admin/custom-fields/:definitionId`
- `/operator/admin/custom-fields/:definitionId/versions/new`

## Existing API contract
- `GET /api/v1/admin/custom-fields`
- `GET /api/v1/admin/custom-fields/:definitionId`
- `POST /api/v1/admin/custom-fields`
- `POST /api/v1/admin/custom-fields/:definitionId/versions`
- `POST /api/v1/admin/custom-fields/:definitionId/versions/:versionId/activate`
- `PATCH /api/v1/admin/custom-fields/:definitionId`
- permission `custom_fields.admin`

## Contract preserved
- targets remain exactly `CLAIM`, `RENEWAL`, `COLLECTION`
- value types remain exactly `STRING`, `NUMBER`, `BOOLEAN`, `DATE`, `ENUM`
- sensitivity remains exactly `PUBLIC_SAFE`, `STAFF_ONLY`
- version states remain exactly `DRAFT`, `ACTIVE`, `RETIRED`
- directory remains page/pageSize only, page size 25
- `fieldKey` + `targetType` remain stable definition identity
- new definition remains disabled with first DRAFT
- historical version content remains immutable
- new version always remains DRAFT
- only DRAFT exposes activation
- activation and definition enable/disable preserve `expectedDefinitionVersion`
- HTTP 409 refetches authoritative projection without blind retry
- protected keys remain API authority and are not replicated in UI
- no delete, search, filters, inline historical edit or new target/value families are introduced

## Visual productization
- reconcile visible copy to Spanish while retaining contract enum values and technical names where useful
- preserve `fieldKey` as primary definition identity
- move full definition/version IDs behind secondary technical disclosure
- express optimistic concurrency as an operational status instead of raw request-field prominence
- keep `sourceClassification` semantically opaque while giving it a readable label
- preserve DRAFT as the only actionable version state
- keep enable/disable distinct from version activation
- make Custom Fields navigation `ready` only for roles already owning `custom_fields.admin`
- introduce a Custom Fields-only final CSS layer after the existing `custom-field-admin.css`
- validate 1366x768, 1280x720, 1024x768 and 390x844 viewports
- mobile interactive targets at least 44px and no positive horizontal overflow

## Explicit non-scope
- backend, auth, RBAC, API or OpenAPI changes
- custom-field value assignment CRUD
- protected-key discovery UI
- arbitrary executable validation
- local-only search/filter simulations
- delete, rename or target mutation
- Visual Functional Review baseline reconciliation
