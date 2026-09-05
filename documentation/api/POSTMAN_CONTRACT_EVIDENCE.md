# Postman Contract Evidence — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Boundary: `postman_contract`
Gate: `postman_ready`
Status: APPROVED

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Purpose

This evidence proves the three canonical Blueprint obligations for the Postman Operational Contract boundary:

- `api.postman_collection`
- `api.postman_environment`
- `api.postman_coverage`

The Postman artifacts operationalize the already-approved REST contract without expanding scope or claiming API QA execution.

## 2. Generated artifacts

Canonical files:

- `postman/InsuranceClaims.postman_collection.json`
- `postman/InsuranceClaims.local.postman_environment.json`

Collection schema:

`Postman Collection v2.1`

REST operationIds represented exactly once:

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

`MCP:get_claim_status` remains intentionally outside the REST Postman collection.

## 3. Operational environment

The local environment contains configurable values for:

- `baseUrl`
- `requestId`
- `idempotencyKey`
- `policyReference`
- `vehicleReference`
- `trackingCode`
- `operatorLogin`
- `operatorPassword`
- `bearerToken`
- `claimId`
- `evidenceId`
- `expectedFromStatus`
- `toStatus`

Security properties:

- `operatorPassword` is committed empty and typed as `secret`;
- `bearerToken` is committed empty and typed as `secret`;
- no live credentials, tokens or FAR data are stored.

## 4. Operational chaining

Successful responses may populate reusable environment values:

- `authenticateOperator` -> `bearerToken`
- `createClaim` -> `trackingCode`
- `listClaims` -> first `claimId` when present
- `getClaimDetail` -> first `evidenceId` when present

This makes the collection manually operable while keeping runtime behavior downstream of this static contract boundary.

## 5. Static coverage validation

Workflow:

`.github/workflows/postman-contract.yml`

Validator:

`scripts/validate-postman-contract.mjs`

The validator checks:

- Postman Collection v2.1 declaration;
- exact 10/10 REST operation coverage;
- no extra/fake MCP REST operation;
- HTTP method and route alignment with `API_ENDPOINT_INVENTORY.json`;
- bearer/noauth behavior;
- `X-Request-Id` coverage on business operations;
- required `Idempotency-Key` on `createClaim`;
- JSON/form-data body mode alignment;
- complete multipart field set for `createClaim`;
- expected query-variable wiring;
- safe operational capture scripts;
- required environment variables;
- empty committed operator password and bearer token.

## 6. Exact-head CI evidence before approval

Review candidate:

`807c3a2c0f6d71a79975c6f0be41448fa443ac60`

Runs:

- Postman Contract `33998724806` = SUCCESS
- OpenAPI Validation regression `33998724767` = SUCCESS
- API Implementation regression `33998724781` = SUCCESS

## 7. Exact-head CI evidence after approval

Approved final head before this documentation-only evidence refresh:

`fd175a3635ae2e445ca685a94d2c7461f7c900da`

Runs:

- Postman Contract `33999659965` = SUCCESS
- OpenAPI Validation regression `33999659848` = SUCCESS
- API Implementation regression `33999659876` = SUCCESS

The backend regression passed locked dependency installation, Prisma contract emit, TypeScript typecheck, backend tests, architecture conformance and build.

## 8. Human approval

Luis Hernández explicitly approved:

> Apruebo Postman Ready

Approval evidence:

`documentation/api/POSTMAN_READY_APPROVAL.md`

## 9. Scope integrity

This boundary does not:

- claim positive/negative API QA execution;
- claim runtime contract validation against deployed PostgreSQL/legacy simulator;
- claim security QA or audit QA completion;
- change REST operation implementation;
- expose MCP as REST;
- modify Blueprint Master;
- claim FAR Seguros internal systems, APIs, workflows or infrastructure.

## 10. Blueprint disposition

- `api.postman_collection = PASS`
- `api.postman_environment = PASS`
- `api.postman_coverage = PASS`
- `postman_contract = COMPLETE`
- `postman_ready = PASS`

API QA may begin only after PR #8 receives separate merge authorization, is merged, and `main` is verified post-merge.
