# R3 Web Productization Increment 10 — Custom Field Administration

## Status

Implementation candidate prepared from the post-PR #68 baseline. Human approval remains mandatory before merge.

## Frozen baseline

- repository: `LuisHdezE/InsuranceClaims`
- base branch: `main`
- base SHA: `849c592084b2a5aac61f664753c9a961d86c9660`
- Blueprint consumer baseline: `0.5.2`
- delivery mode: GREENFIELD with SIMULATED legacy coexistence
- data policy: synthetic/demo only
- Blueprint Master: unchanged

## Goal

Productize the frozen R3 Custom Field Administration contract without expanding the API, inventing filters, weakening protected-field rules, or elevating business-operation permissions.

## Routes

1. `/operator/admin/custom-fields`
2. `/operator/admin/custom-fields/new`
3. `/operator/admin/custom-fields/:definitionId`
4. `/operator/admin/custom-fields/:definitionId/versions/new`

All routes require `custom_fields.admin`.

## Authoritative operations

The web uses only:

- `GET /api/v1/admin/custom-fields`
- `GET /api/v1/admin/custom-fields/:definitionId`
- `POST /api/v1/admin/custom-fields`
- `POST /api/v1/admin/custom-fields/:definitionId/versions`
- `POST /api/v1/admin/custom-fields/:definitionId/versions/:versionId/activate`
- `PATCH /api/v1/admin/custom-fields/:definitionId`

No API/OpenAPI mutation is part of this increment.

## Contract vocabulary

### Target types

- `CLAIM`
- `RENEWAL`
- `COLLECTION`

### Value types

- `STRING`
- `NUMBER`
- `BOOLEAN`
- `DATE`
- `ENUM`

### Sensitivity classifications

- `PUBLIC_SAFE`
- `STAFF_ONLY`

### Version states

- `DRAFT`
- `ACTIVE`
- `RETIRED`

## Definition lifecycle

A new definition:

- has a stable `fieldKey`;
- has a stable `targetType`;
- starts disabled;
- starts with definition version `1`;
- receives its first immutable DRAFT configuration version;
- has no active version until explicit activation.

`fieldKey` and `targetType` are identity and are not editable in later versions.

## Version content

Each version contains:

- `valueType`;
- `displayName`;
- `validationMetadata`;
- `enumValues`;
- `sensitivityClassification`;
- `sourceClassification`;
- immutable version metadata and lifecycle timestamps.

The web never edits an existing version. Configuration change means creating a new DRAFT.

## ENUM handling

The UI mirrors the R3 bounds:

- ENUM requires at least one value;
- maximum 100 values;
- maximum 160 characters per value;
- values must be unique;
- non-ENUM versions submit `enumValues: []`.

No enum vocabulary is invented by the web.

## validationMetadata handling

The editor represents metadata as explicit rows:

- stable key;
- scalar type `STRING`, `NUMBER`, or `BOOLEAN`;
- scalar value.

Bounds:

- maximum 20 entries;
- stable-key pattern is mirrored for basic UX validation;
- string values remain bounded;
- numbers must be finite.

The server remains the authority for the protected metadata deny-list. The web intentionally does not copy that deny-list because doing so would create a second authorization/configuration source that could drift.

## Protected field boundary

R3 rejects custom fields that collide with protected domain, identity, security, authentication or sensitive-data concepts.

The UI does not hardcode the internal protected-field set. It sends a syntactically valid stable key and surfaces the authoritative API validation error when the key is forbidden.

This preserves one source of truth.

## Source classification

`sourceClassification` remains an opaque bounded string. The UI does not infer provenance, insurer meaning, confidentiality, or policy from its value.

## Activation and enable/disable

- only DRAFT can be activated;
- activation uses the current definition `version` as `expectedDefinitionVersion`;
- enable/disable uses the same optimistic-concurrency token;
- enable is blocked client-side until `activeVersionId` exists;
- disabling an active definition can retire its active version;
- a retired version is not presented as directly reactivatable.

## Concurrency

All mutations are explicit and non-retrying.

If the API returns 409:

- the definition projection is refetched;
- the stale mutation is not replayed;
- the administrator sees the authoritative state before another action.

## Directory boundary

The list contract publishes pagination only.

The UI therefore does not fabricate:

- search by field key;
- target filter;
- value-type filter;
- enabled/status filter;
- local partial filtering that could be mistaken for server-complete discovery.

Page size is fixed to 25 for the productized directory.

## Access model

`PLATFORM_ADMIN` owns `custom_fields.admin`.

Claims Operator and Claims Supervisor do not.

This increment does not grant Platform Admin any of:

- Claims record read/transition;
- Tasks read/manage;
- Customer/Policy access;
- Renewals operation;
- Collections operation.

Presentation access remains a mirror for navigation only. API authorization stays authoritative.

## Workspace and navigation

Increment 10:

- adds `Campos` to Platform Admin navigation;
- turns the Custom Fields capability card into a live route;
- removes Custom Fields from the generic `Platform Next` pending bucket;
- leaves Automations, Guidance, and Imports pending.

The mobile navigation containment stylesheet remains last in CSS import order.

## Productization inventory

Before Increment 10: 34 route-level interfaces.

After Increment 10: 38 route-level interfaces.

The earlier historical 10-interface MVP evidence remains untouched.

## Explicit non-goals

This increment does not:

- edit the API or OpenAPI;
- change Blueprint Master;
- add Custom Field values to Claim/Renewal/Collection business screens;
- infer how any particular custom field should be rendered outside administration;
- invent validation semantics for `validationMetadata`;
- productize Automations, Guidance, or Imports;
- repair historical readiness/VFR sentinel evidence;
- create release/tag/version publication.

## Validation target

Before HUMAN GATE the branch must prove:

- strict web typecheck;
- web tests;
- production build;
- real-API integration;
- Integration QA;
- responsive/accessibility;
- offline/degraded behavior;
- interface inventory validation;
- exact-head CI reconciliation.

Historical post-closure/readiness sentinels remain visible and must not be rewritten merely to obtain green CI.
