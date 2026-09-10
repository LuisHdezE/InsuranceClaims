# API Implementation R3 — Increment 19: OpenAPI Formalization & Validation

**Status:** READY_FOR_REVIEW  
**Blueprint:** 0.5.2  
**Contract revision:** `api-v1-r3`  
**Canonical endpoint inventory:** `documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json`  
**Frozen effective REST operation count:** 90  
**Frozen distinct path count:** 76  
**Frozen operation-family count:** 16  
**Base main:** `ec9582b8c454a0cb05eee8cd0b8e38f77975aa0b`

## 1. Purpose

Increment 19 formalizes the already-approved and already-reconciled R3 REST surface as an executable OpenAPI 3.1 description.

This increment does not create API scope. The source of truth remains the frozen R3 contract and endpoint inventory. `openapi.yaml` and the generated fragments under `openapi/r3/` are deterministic derived artifacts.

The historical MCP `get_claim_status` tool remains intentionally outside REST OpenAPI counting.

## 2. Frozen scope

The generated effective OpenAPI contract preserves exactly:

- 90 REST operations;
- 76 distinct REST paths;
- 16 operation families;
- the approved `operationId`, HTTP method and path of each inventory tuple;
- authentication context;
- permission intent;
- request contract name;
- success contract;
- requirements and use-case traceability;
- durable audit obligation;
- idempotency semantics;
- concurrency semantics;
- rate-limit metadata;
- `X-Request-Id` correlation semantics.

No new route or operation is introduced and no approved operation is renamed.

## 3. Security contexts

OpenAPI formalizes the frozen authentication boundaries as separate security schemes:

- staff bearer JWT;
- customer bearer JWT;
- HMAC integration authentication using `X-Integration-Key`, `X-Event-Id`, `X-Event-Timestamp` and `X-Event-Signature`.

The staff and customer JWT contexts remain distinct. OpenAPI documentation does not widen RBAC and the API remains the authoritative authorization boundary.

## 4. Error and request semantics

Modeled REST errors use `application/problem+json` with the existing RFC 9457-style Problem Details contract and request correlation.

The formalization also preserves frozen high-value constraints where they are explicitly supported by the R3 contract, including:

- `Idempotency-Key` bounds and required use where frozen;
- `CreateClaimRequest` evidence bounded to a maximum of five binary files;
- `ExecuteBulkOperationRequest.items` bounded to 1–100 entries;
- `MoveOperationalStageRequest` requiring both target stage and expected version;
- required optimistic-concurrency fields where frozen.

Where R3 freezes only a named request/response contract and does not freeze field-level structure, the generated schema remains deliberately open. Increment 19 does not invent insurer-specific fields, validation rules or production data semantics.

## 5. Deterministic generation

The root commands are:

```text
npm run openapi:generate:r3
npm run openapi:check:r3
npm run openapi:validate:r3
```

`scripts/generate-openapi-r3.mjs` builds the semantic R3 specification from the canonical endpoint inventory.

`scripts/materialize-openapi-r3.mjs` deterministically materializes:

- root `openapi.yaml`;
- generated modular fragments under `openapi/r3/`.

The generated fragments are stored outside `documentation/api/r3/` deliberately. Canonical R3 documentation remains the source contract; `openapi/r3/` remains a reproducible derivative and cannot masquerade as a second canonical input.

`openapi:check:r3` compares the tracked generated artifact byte-for-byte with a fresh deterministic materialization and also verifies the exact generated fragment inventory.

## 6. Validation stack

`.github/workflows/openapi-validation.yml` validates the contract with read-only repository permissions and performs:

1. deterministic zero-drift check;
2. OpenAPI 3.1 lint with Redocly;
3. bundle and full dereference of the modular specification;
4. semantic validation against the canonical R3 endpoint inventory;
5. final Git diff assertion proving the tracked OpenAPI artifact was not modified during validation;
6. upload of the validated OpenAPI artifact as CI evidence.

`scripts/validate-openapi-r3.mjs` rejects:

- operation-count drift;
- missing or unexpected operation IDs;
- method/path drift;
- authentication-context drift;
- permission, audit, idempotency or concurrency metadata drift;
- missing required HMAC/idempotency/correlation headers;
- path-parameter drift;
- wrong request media types;
- missing success contracts;
- non-Problem-Details modeled REST errors;
- accidental inclusion of the historical MCP operation in REST OpenAPI.

A successful semantic run reports `90/90` effective REST operations validated against `api-v1-r3`.

## 7. Historical client compatibility

The three implemented web functional slices were originally bound to the approved R1 subset of operations. That binding is historical and remains valid.

The effective root contract is now R3, while the Client Architecture validator verifies that every inherited R1 `operationId` required by those slices is still present inside the modular R3 contract. Client bindings are therefore preserved rather than rewritten to pretend they were originally authored against R3.

## 8. Boundaries

Increment 19 deliberately does not:

- modify runtime API behavior;
- add, remove or rename approved routes;
- alter permissions or authentication policy;
- invent business fields or insurer rules not frozen by R3;
- formalize or regenerate the R3 Postman pack;
- mutate Blueprint Master;
- create a tag, release or publication;
- introduce real FAR or insurer data.

Postman R3 formalization remains Increment 20.

## 9. Completion criteria

Increment 19 becomes review-ready only when:

- deterministic OpenAPI generation has zero drift;
- Redocly OpenAPI 3.1 lint passes;
- the modular contract bundles and dereferences successfully;
- semantic validation reports 90/90 REST operations against `api-v1-r3`;
- Client Architecture validates inherited R1 bindings inside effective R3;
- Postman and existing API/QA workflows remain unaffected;
- all substantive exact-head CI is green except the three already-established historical readiness locks;
- the branch is compacted to one logical commit over exact approved `main`;
- PR review threads/comments contain no unresolved implementation blocker.

Only after those conditions are satisfied may PR #56 be marked Ready for Review and presented at the human merge gate.
