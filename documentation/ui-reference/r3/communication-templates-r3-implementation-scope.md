# Communication Templates R3 - Implementation Scope

## Base checkpoint

`main @ fc45c63fea1faa39d60c5d213a3b3cf0b15d169b`

## Canonical visual baseline

- `documentation/ui-reference/r3/communication-templates-r3-approved.md`
- `documentation/ui-reference/r3/communication-templates-r3-approved.svg`

## Contract reviewed

- `GET /api/v1/admin/communication-templates`
- `GET /api/v1/admin/communication-templates/:definitionId`
- `POST /api/v1/admin/communication-templates`
- `POST /api/v1/admin/communication-templates/:definitionId/versions`
- `POST /api/v1/admin/communication-templates/:definitionId/versions/:versionId/activate`
- `PATCH /api/v1/admin/communication-templates/:definitionId`
- permission `communications.admin`

## Visual lane scope

This lane productizes the already implemented Communication Templates administration screens without changing backend, authentication, RBAC, API contracts or OpenAPI.

Covered screens:

1. Communication Templates directory.
2. New template definition.
3. Communication Template detail and immutable version history.
4. New immutable version.

## UI changes

- Align visible hierarchy with the approved R3 reference.
- Keep the template `key` as the primary visual identity.
- Keep channel and enabled state as compact read-only badges.
- Move full definition/version IDs behind secondary technical disclosures.
- Keep DRAFT visually distinct and as the only version exposing `Activar DRAFT`.
- Humanize visible Spanish copy while preserving API enum values.
- Keep definition enable/disable separate from version activation.
- Keep concurrency visible as a compact operational note rather than exposing `expectedDefinitionVersion` as dominant copy.
- Promote the existing navigation item from visual `pending` to `ready` only for roles already owning `communications.admin`.
- Preserve the reusable `OperatorShell` and centralized `operator-navigation` catalog.

## Contract invariants preserved

- Channels remain exactly `EMAIL` and `WHATSAPP`.
- Version states remain exactly `DRAFT`, `ACTIVE`, `RETIRED`.
- Variable types remain exactly `STRING`, `NUMBER`, `BOOLEAN`.
- Directory query remains page/pageSize only, with page size 25.
- Creating a definition still creates it disabled with its first DRAFT version.
- EMAIL still requires subject; WHATSAPP does not publish subject semantics.
- Body remains required with an 8000-character maximum.
- `sourceClassification` remains opaque to the UI.
- Historical versions remain immutable.
- New versions are created as DRAFT and are prefilled from active/latest content.
- Version creation, activation and definition state changes keep `expectedDefinitionVersion` concurrency.
- A 409 conflict still refreshes the authoritative projection without blind retry.
- A definition cannot be enabled without a valid active version.
- Disabling may retire the active version according to the server contract.

## Explicit exclusions

This lane does not add:

- search or directory filters;
- editing existing versions;
- deletion of definitions or versions;
- message sending or `communications.send` behavior;
- test-send or real delivery preview;
- delivery/open/send metrics;
- channels outside EMAIL/WHATSAPP;
- variable types outside STRING/NUMBER/BOOLEAN.

## QA evidence

A permanent browser gate validates the productized lane at:

- 1366x768
- 1280x720
- 1024x768
- 390x844

The gate checks directory density, responsive containment, detail version-history hierarchy, collapsed technical IDs, DRAFT-only activation, exact channel and variable-type catalogs, mobile touch targets and absence of horizontal overflow.

## Global VFR note

The historical global VFR gates remain outside this visual lane. Their reviewed evidence predates current R3 productization and must not be rebound or rewritten in this PR merely to obtain green global status.
