# API Implementation R3 — Increment 20: Postman Contract Pack

**Status:** READY_FOR_REVIEW  
**Blueprint:** 0.5.2  
**Contract revision:** `api-v1-r3`  
**Canonical endpoint inventory:** `documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json`  
**Effective OpenAPI:** `openapi.yaml` + `openapi/r3/`  
**Frozen REST operations:** 90  
**Frozen operation families:** 16  
**Base main:** `238e9acede729105ed444a2f2e340a6bc8cc3863`

## 1. Purpose

Increment 20 formalizes the already-approved R3 REST surface as a deterministic Postman Collection v2.1 and a local synthetic/demo environment.

This increment does not create API scope, business rules or runtime behavior. The authoritative inputs remain the frozen R3 endpoint inventory and the effective OpenAPI R3 contract produced by Increment 19.

The historical MCP `get_claim_status` tool remains intentionally outside REST Postman counting.

## 2. Effective pack

The active files are:

- `postman/InsuranceClaims.postman_collection.json`;
- `postman/InsuranceClaims.local.postman_environment.json`.

The collection contains exactly:

- 90 REST requests;
- 16 top-level folders matching the frozen R3 operation families;
- one request per frozen `operationId`;
- no unexpected REST request;
- no MCP request.

Each request carries machine-reviewable descriptions for contract revision, authentication context, permission intent, request/success contract, requirements, use cases, audit, idempotency and concurrency.

## 3. Deterministic generation

`scripts/generate-postman-r3.mjs` reads:

1. `documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json`;
2. the effective modular `openapi.yaml` / `openapi/r3/` contract.

It locally dereferences the generated OpenAPI files and produces the R3 collection and environment deterministically.

`scripts/enrich-postman-r3-historical.mjs` then preserves the already-frozen R1 request bodies for `verifyPolicyVehicle`, `trackClaim` and `transitionClaimStatus`. This is intentionally narrow: those bodies were previously frozen at field level, while the effective R3 OpenAPI keeps parts of those inherited schemas deliberately open. The compatibility step restores existing contract knowledge rather than inventing fields.

`scripts/materialize-postman-r3.mjs` composes both stages and is the only root materialization entry point.

Root commands:

```text
npm run postman:generate:r3
npm run postman:check:r3
npm run postman:validate:r3
```

`postman:check:r3` materializes the expected pack in a temporary directory and performs byte-for-byte comparison with the tracked artifacts. An OpenAPI, inventory or inherited-body compatibility change that is not reflected in Postman therefore fails CI instead of silently drifting.

## 4. Authentication boundaries

The Postman pack preserves the R3 authentication separation:

- anonymous/credential bootstrap requests use no transport auth;
- staff routes use `{{staffBearerToken}}`;
- Customer Portal routes use the distinct `{{customerBearerToken}}`;
- Integration ingestion uses the four frozen HMAC headers.

`authenticateOperator` captures a successful access token into `staffBearerToken`.

`authenticateCustomer` captures a successful access token into `customerBearerToken`.

A staff token is never reused as the customer token variable and vice versa.

## 5. HMAC integration helper

`ingestIntegrationEvent` includes a local Postman prerequest helper that:

- loads CryptoJS through Postman `pm.require`;
- reads the runtime-only `integrationSecret` environment variable;
- computes SHA-256 of the resolved raw body;
- builds the frozen canonical signing input `<timestamp>\n<eventId>\n<SHA256(rawBody)>`;
- computes lowercase hexadecimal HMAC-SHA256;
- writes `integrationTimestamp` and `integrationSignature` into the active environment.

The committed environment intentionally leaves `integrationKey`, `integrationSecret` and `integrationSignature` empty where runtime material is required. No real integration credentials are introduced.

## 6. Correlation and idempotency

All `/api/v1/*` requests include `X-Request-Id: {{$guid}}`.

Operations whose frozen R3 idempotency contract requires `Idempotency-Key` use the shared `{{idempotencyKey}}` variable. Its committed synthetic example satisfies the frozen 16–128 character bound.

The collection does not invent idempotency on operations where the R3 inventory does not require it.

## 7. Request bodies and variables

Request structure is normally derived from effective OpenAPI R3:

- JSON contracts use raw JSON templates;
- numeric/boolean placeholders remain unquoted so Postman sends the correct JSON primitive type;
- multipart contracts use form-data;
- binary fields are represented as local file inputs;
- optional OpenAPI query/form-data fields are disabled by default;
- path and query placeholders are represented by environment variables.

Where Increment 19 intentionally kept a named request schema open because field-level business semantics were not frozen, the Postman body remains correspondingly minimal rather than inventing insurer-specific fields.

There is one explicit compatibility exception: the historical R1 baseline remains authoritative for the already-frozen bodies of `verifyPolicyVehicle`, `trackClaim` and `transitionClaimStatus`. Their active R3 Postman requests therefore preserve, respectively:

- `policyReference` + `vehicleReference`;
- `trackingCode` + `policyReference`;
- `expectedFromStatus` + `toStatus`.

The compatibility layer also guarantees that the corresponding inherited environment variables remain present. `scripts/validate-postman-r3-historical-compat.mjs` rejects drift from those archived R1 bodies.

The pack is a contract/test client, not a substitute for API QA fixtures.

## 8. Synthetic environment and secret hygiene

The local environment targets `http://localhost:3000` and uses only synthetic `.invalid` logins and synthetic placeholder values.

Committed secret variables are empty and typed `secret`, including:

- operator/admin/supervisor/customer passwords;
- staff/customer bearer tokens;
- integration secret;
- integration signature.

The validator rejects committed values for those variables.

## 9. Historical R1 preservation

Before replacing the active R1 pack, Increment 20 archived byte-identical copies under:

`postman/baselines/api-v1-r1/`

The final Postman CI verifies their Git blob hashes against the exact pre-Increment-20 `main` artifacts:

- collection: `11ea019cd242af84e77ded532153b922f15a56f7`;
- environment: `c4d64ac58ea62a7296b4fc7cd6f1386bb9623220`.

This preserves historical R1 evidence while allowing the active pack to represent the effective R3 contract.

## 10. Validation gate

`.github/workflows/postman-contract.yml` runs with `contents: read` only and performs:

1. exact historical R1 blob verification;
2. deterministic R3 zero-drift verification, including inherited-body compatibility;
3. semantic Postman R3 validation;
4. explicit historical body compatibility validation;
5. final `git diff --exit-code` proving validation does not rewrite tracked Postman artifacts;
6. upload of the validated active R3 pack as short-lived CI evidence.

`scripts/validate-postman-contract.mjs` rejects:

- operation-count drift;
- family/folder drift;
- duplicate or unexpected operation IDs;
- HTTP method/path drift;
- staff/customer bearer-context drift;
- missing HMAC headers or signing helper;
- missing `X-Request-Id`;
- missing required `Idempotency-Key`;
- request-body mode drift;
- malformed variable-backed JSON templates;
- collection references to missing environment variables;
- committed passwords, bearer tokens, integration secrets or signatures;
- accidental MCP inclusion.

A successful run reports 90/90 REST requests across 16/16 frozen families, followed by PASS for the three inherited R1 bodies.

## 11. Boundaries

Increment 20 deliberately does not:

- modify runtime API behavior;
- add, remove or rename routes;
- alter R3 permissions or authentication policy;
- invent insurer-specific business payloads where the contract remains open;
- run Postman/Newman as a replacement for the existing API QA suite;
- mutate Blueprint Master;
- create a tag, release or publication;
- introduce real FAR/insurer/customer data or credentials.

## 12. Completion criteria

Increment 20 becomes review-ready only when:

- Postman generation has zero drift;
- semantic validation reports 90/90 requests and 16/16 families;
- the three inherited R1 request bodies match the archived baseline exactly;
- historical R1 collection/environment blob checks pass;
- OpenAPI, API Implementation, API QA, Integration QA, Release Gate Evidence and existing client/visual contract workflows remain green except the established historical readiness locks;
- the branch is compacted to one logical commit over exact approved `main`;
- PR comments/reviews contain no unresolved implementation blocker.

Only after those conditions are satisfied may PR #57 be marked Ready for Review and presented at the human merge gate.
