# OpenAPI Validation Evidence — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Boundary: `openapi_validation`
Gate: `openapi_valid`
Status: READY_FOR_REVIEW

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Purpose

This evidence proves the two canonical Blueprint obligations for the OpenAPI Validation boundary:

- `api.openapi`
- `api.openapi_validation`

The generated REST description formalizes approved contract revision `api-v1-r1`. It does not introduce new business operations and does not represent MCP as REST.

## 2. OpenAPI artifact

Canonical file:

`openapi.yaml`

Specification version:

`OpenAPI 3.1.0`

REST operationIds:

1. `verifyPolicyVehicle`
2. `createClaim`
3. `trackClaim`
4. `authenticateOperator`
5. `listClaims`
6. `getClaimDetail`
7. `downloadClaimEvidence`
8. `transitionClaimStatus`
9. `getLiveness`
10. `getReadiness`

`MCP:get_claim_status` remains intentionally outside the OpenAPI REST surface.

## 3. Contract coverage represented

The OpenAPI description formalizes the already approved contract for:

- URL major versioning under `/api/v1`;
- unversioned `/health/live` and `/health/ready` operational routes;
- bearer JWT security on operator routes;
- public proof-bound tracking without operator authentication;
- RFC 9457 `application/problem+json` errors;
- `X-Request-Id` correlation contract;
- `Idempotency-Key` bounds and create-claim replay semantics;
- multipart claim creation with at most five JPEG/PNG/PDF evidence files, maximum 5 MiB each by contract;
- allowlisted binary evidence response media types;
- claim lifecycle enum and transition request/response schemas;
- pagination/status query parameters;
- permission, rate-limit, durable-audit, requirement and interface traceability extensions on business operations.

## 4. Structural validation

Workflow:

`.github/workflows/openapi-validation.yml`

Tool:

`@redocly/cli@2.51.2`

Command:

```text
npx --yes @redocly/cli@2.51.2 lint --extends=spec openapi.yaml
```

This validates the description against the OpenAPI specification-focused Redocly ruleset.

Exact-head proof candidate:

- commit: `58bb71841ac498bb59170a58913a9428dc796c3e`
- workflow: `OpenAPI Validation`
- run: `33997086546`
- step `Validate OpenAPI 3.1 structure`: PASS

## 5. Semantic validation against approved inventory

The workflow creates a dereferenced JSON bundle and executes:

```text
node scripts/validate-openapi-contract.mjs .runtime/openapi.bundle.json documentation/api/API_ENDPOINT_INVENTORY.json
```

The validator rejects:

- missing or extra REST operationIds;
- route or HTTP method drift;
- required business permission/rate/audit metadata drift;
- bearer-security mismatch;
- missing required headers, query parameters or path parameters;
- missing approved success status;
- request content-type mismatch;
- non-Problem-Details error responses on `/api/v1` operations;
- `Idempotency-Key` bounds outside `16..128`;
- claim evidence contract drift from max five binary files;
- missing JPEG/PNG/PDF evidence download representations;
- accidental exposure of `MCP:get_claim_status` as REST.

Exact-head proof candidate:

- commit: `58bb71841ac498bb59170a58913a9428dc796c3e`
- run: `33997086546`
- step `Bundle OpenAPI for semantic checks`: PASS
- step `Validate approved contract coverage`: PASS
- run conclusion: SUCCESS

## 6. Failure-before-pass evidence

The first OpenAPI run, `33997015148`, correctly failed semantic validation while structural OpenAPI validation passed.

The failures exposed two validation-harness issues rather than hidden contract drift:

1. reusable local parameters were still `$ref` objects in the bundle, so the semantic validator could not see `X-Request-Id` and path parameters;
2. the machine inventory contains formatting differences for one rate-limit label and operational health metadata that are not mandatory REST extension fields.

Corrections:

- the CI bundle is now dereferenced before semantic validation;
- business rate/audit metadata comparisons remain enforced, with semantic whitespace/hyphen normalization;
- health operations are still checked for exact path, method, operationId and success status, while optional operational traceability extensions are not fabricated solely for the validator.

The corrected run `33997086546` passed without disabling structural or business-contract checks.

## 7. Scope integrity

This boundary does not:

- create Postman artifacts;
- run API positive/negative/security/audit QA;
- change any REST operation implementation;
- add client interfaces;
- modify Blueprint Master;
- claim any FAR Seguros internal API, data model or infrastructure.

## 8. Blueprint disposition

Evidence status:

- `api.openapi = PASS`
- `api.openapi_validation = PASS`
- `openapi_valid = READY_FOR_REVIEW`

The gate must not become `PASS` until the project records the required human gate decision. Gate approval does not authorize merging the pull request; merge remains a separate explicit decision.
