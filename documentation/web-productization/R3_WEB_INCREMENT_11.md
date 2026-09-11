# R3 Web Productization Increment 11 — Guidance Administration

## Status

Implementation prepared on top of frozen InsuranceClaims baseline `cac7cc681ac09c3617ca14b35fa6b4eedb4795b5`.

This increment productizes the existing R3 Guidance administration contract only. It does not modify the API, OpenAPI, Blueprint Master, historical readiness evidence, or business-operation permissions.

## Goal

Expose a complete administrator-facing Guidance lifecycle without inventing insurer vocabulary, proprietary process detail, or hidden semantics for configured fields.

## Access boundary

All new routes require `guidance.admin`.

- `PLATFORM_ADMIN`: presentation access allowed.
- `CLAIMS_OPERATOR`: no Guidance admin access.
- `CLAIMS_SUPERVISOR`: no Guidance admin access.
- API authorization remains authoritative.
- Platform Admin does not gain Claims, Tasks, Customer, Policy, Renewals, Collections, or other business-record permissions.

## Routes

1. `/operator/admin/guidance`
   - server-paginated Guidance directory.
2. `/operator/admin/guidance/new`
   - new definition plus first DRAFT version.
3. `/operator/admin/guidance/:definitionId`
   - definition state, immutable version history, activation, enable/disable.
4. `/operator/admin/guidance/:definitionId/versions/new`
   - create a new immutable DRAFT version.

The living R3 route-level inventory moves from 38 to 42 interfaces.

## Frozen R3 contract used

The web uses only:

- `GET /api/v1/admin/guidance`
- `GET /api/v1/admin/guidance/:definitionId`
- `POST /api/v1/admin/guidance`
- `POST /api/v1/admin/guidance/:definitionId/versions`
- `POST /api/v1/admin/guidance/:definitionId/versions/:versionId/activate`
- `PATCH /api/v1/admin/guidance/:definitionId`

No new endpoint is introduced.

## Definition identity

A Guidance definition exposes:

- `definitionId`
- stable `key`
- `enabled`
- `activeVersionId`
- definition `version`
- timestamps
- immutable version history

The `key` belongs to definition identity. Later versions do not edit it.

## Version content

Each version projects only the published R3 fields:

- `insurerContextReference`
- `guidanceCategory`
- `documentCategories`
- `instructions`
- `assistanceMetadata`
- `sourceClassification`
- version status and audit timestamps

Version statuses remain exactly:

- `DRAFT`
- `ACTIVE`
- `RETIRED`

## Semantic discipline

R3 does not publish a closed vocabulary for insurer context, guidance category, document categories, assistance metadata values, or source classification.

Therefore the web:

- treats those values as configured opaque strings;
- does not invent insurer-specific names or workflows;
- does not infer required documents from a category;
- does not turn assistance metadata into executable behavior;
- does not assign business meaning to source classification;
- does not add filters that the list contract does not expose.

## Editor bounds

The UI mirrors only the published transport bounds:

- stable definition key pattern and maximum 80 characters;
- insurer context reference: 1–80 characters;
- guidance category: 1–80 characters;
- document categories: maximum 20, each 1–80 characters;
- instructions: maximum 20, each 1–1000 characters;
- assistance metadata: maximum 20 entries;
- metadata keys use the published stable-key pattern;
- metadata values: 1–500 characters;
- source classification: 1–80 characters.

The editor uses explicit list rows and key/value rows rather than free-form JSON.

## Version lifecycle

A new definition starts:

- disabled;
- with definition version `1`;
- with its first Guidance version in `DRAFT`.

Historical content is immutable. Configuration changes create a new DRAFT version.

Activation is a separate operation from definition enable/disable.

Only server-projected DRAFT versions receive an activation control.

Enabling is disabled client-side until `activeVersionId` exists, while the API remains the authority.

Disabling an active definition may retire the active version according to server behavior. The web renders the resulting authoritative projection rather than pretending that retired content remains active.

## Optimistic concurrency

The following operations submit the authoritative definition `version` as `expectedDefinitionVersion`:

- create new version;
- activate DRAFT version;
- enable/disable definition.

A 409/version conflict triggers a refetch of the current definition. The web never blindly retries a stale mutation.

## Directory behavior

The directory exposes only server pagination because R3 publishes no Guidance search/filter contract.

No local partial filter is presented for key, context, category, state, source classification, or version status.

## Workspace and navigation

Platform Admin receives:

- a `Guidance` navigation entry gated by `guidance.admin`;
- a live Guidance capability card in Workspace.

The remaining `Platform Next` card is narrowed to Automations + Imports.

`r3-mobile-nav-containment.css` remains the final stylesheet import so the existing mobile navigation containment fix stays authoritative.

## Explicitly excluded

- API/OpenAPI changes.
- Blueprint Master changes.
- Guidance consumption inside Claims workflows.
- Insurer-specific vocabulary or proprietary guidance content.
- Automations administration.
- Governed Imports productization.
- Operator Communications template-discovery redesign.
- Tags, releases, version bumps, or publication.

## Governance

- Blueprint consumer baseline remains `0.5.2`.
- delivery remains GREENFIELD with SIMULATED legacy coexistence.
- synthetic/demo data only.
- historical readiness evidence remains immutable.
- merge requires exact-head CI, review reconciliation, and explicit human approval.
