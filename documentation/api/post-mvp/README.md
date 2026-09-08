# API Contract Revision `api-v1-r2`

`api-v1-r2` is the first governed post-MVP REST contract revision for the Claims Operations increment.

## Composition

The accepted MVP contract remains immutable:

- `openapi.yaml` = `api-v1-r1`
- `documentation/api/API_ENDPOINT_INVENTORY.json` = `api-v1-r1`

The effective r2 contract is composed as:

`api-v1-r2 = api-v1-r1 + openapi-v1-r2-additions.yaml`

The r2 manifest pins the Git blob SHA of both historical r1 artifacts and CI rejects any drift or route/operation override.

## Additive operations

- `listTasks`
- `listClaimTasks`
- `completeClaimTask`
- `getClaimTimeline`
- `getClaimEvidenceAttention`

These operations reflect already-implemented, already-runtime-tested behavior. This contract change does not add new production behavior.

## Blueprint impact

`.blueprint/api-impact/API-IMPACT-001.json` follows the Blueprint 0.5.2 `api-impact.schema.json` contract. It is classified `platform_cross_cutting`, requires web-platform revalidation, and explicitly preserves unrelated accepted evidence.

The canonical schema snapshot in this directory is retained only to make consumer CI deterministic. Its source repository and exact Git blob SHA are pinned in `API_CONTRACT_REVISION_R2.json`.

## Safety boundary

This remains an unofficial technical case study using synthetic data. The revision does not introduce insurer-specific adjudication rules, coverage decisions, fraud rules, liability decisions, or production FAR processes.
