# Web R3 Productization Increment 06 - Pipeline Administration

## Scope

Increment 06 productizes the frozen R3 Pipeline Administration contract for Platform Admin without changing the API or historical readiness evidence.

Baseline at implementation start:

`13f7f84072afe20b3a9a63d96be26dec529961eb`

Blueprint consumer baseline remains `0.5.2`.

## Why Pipeline Administration

Claims Analytics and Pipeline Administration were compared as the next dependency-correct productization vertical.

Claims Analytics currently exposes one authoritative read operation over an explicit `[from,to)` window. It remains a valid later dashboard increment.

Pipeline Administration exposes a complete self-contained administrative lifecycle:
- list definitions;
- read definition/version history;
- create a definition with first DRAFT version;
- create a new immutable DRAFT version;
- activate an eligible DRAFT version;
- enable/disable a definition with optimistic concurrency.

That makes Pipeline Administration the stronger standalone Increment 06 while preserving role boundaries.

## Routes

- `/operator/admin/pipelines`
- `/operator/admin/pipelines/new`
- `/operator/admin/pipelines/:definitionId`
- `/operator/admin/pipelines/:definitionId/versions/new`

All routes require the presentation permission `pipelines.admin`. The API remains the authorization authority.

## Frozen R3 operations used

- `GET /api/v1/admin/pipelines`
- `GET /api/v1/admin/pipelines/:definitionId`
- `POST /api/v1/admin/pipelines`
- `POST /api/v1/admin/pipelines/:definitionId/versions`
- `POST /api/v1/admin/pipelines/:definitionId/versions/:versionId/activate`
- `PATCH /api/v1/admin/pipelines/:definitionId`

No new endpoint, consumer type, version status, transition semantic, reporting semantic, or configuration state was added.

## Configuration model

The UI preserves the R3 model:
- consumer type is restricted to `CLAIM`, `RENEWAL`, or `COLLECTION`;
- versions are treated as immutable;
- a new definition starts disabled with version 1 in DRAFT;
- later edits are represented as a newly created DRAFT version;
- stage content contains `stageKey`, `displayName`, `sortOrder`, `reportingFlags`, and `allowedNextStageKeys`;
- `sourceClassification` and reporting flag keys remain opaque configuration values;
- activating a version and changing enabled state are explicit separate operations.

## Concurrency

Definition mutation uses the server-projected definition `version` as `expectedDefinitionVersion`.

A 409 response triggers a refetch of the authoritative pipeline projection. The web does not silently retry a stale administrative mutation.

## UX

The directory summarizes:
- definition count;
- enabled definitions on the current page;
- definitions with an active version;
- consumer type;
- current definition version;
- version count and DRAFT count.

The detail surface shows immutable version history, stage topology, allowed next stage keys, reporting flags, source classification and activation/retirement timestamps.

The version editor initializes from the latest server version as an editing convenience, but saving always creates a new DRAFT. No existing version is mutated.

## Access boundary

`PLATFORM_ADMIN` owns `pipelines.admin`.

Claims Operator and Claims Supervisor do not receive Pipeline Administration access through navigation, protected routes, or deep-link restoration.

Platform Admin still does not inherit Claims, Customer, Policy, Renewal, or Collection business-operation permissions.

## Evidence boundary

This increment updates only the living R3 productization inventory. It does not rewrite:
- historical 10-interface inventory;
- historical readiness locks;
- historical VFR evidence;
- Blueprint Master.

Any historical sentinel failure caused by legitimate post-closure product drift must remain visible.
