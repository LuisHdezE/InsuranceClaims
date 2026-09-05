# Postman Operational Contract Evidence — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Boundary: `postman_contract`
Gate: `postman_ready`
Status: READY_FOR_REVIEW

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Purpose

This evidence proves the three canonical Blueprint obligations for the Postman Operational Contract boundary:

- `api.postman_collection`
- `api.postman_environment`
- `api.postman_coverage`

It does not claim API QA execution. Runtime positive, negative, security, contract and audit validation remain downstream in the `api_qa` boundary.

## 2. Generated artifacts

Collection:

`postman/InsuranceClaims.postman_collection.json`

Environment:

`postman/InsuranceClaims.local.postman_environment.json`

Validation script:

`scripts/validate-postman-contract.mjs`

CI workflow:

`.github/workflows/postman-contract.yml`

## 3. REST coverage

The collection contains exactly one canonical request for each approved REST operationId:

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

`MCP:get_claim_status` remains intentionally outside this REST Postman collection.

Static coverage is therefore 10/10 approved REST operations with no extra request pretending to be an approved operation.

## 4. Operational chaining

The collection is arranged for manual and later automated execution using environment variables rather than committed business truth.

Successful responses may populate:

- `authenticateOperator` -> `bearerToken`
- `createClaim` -> `trackingCode`
- `listClaims` -> first `claimId` when present
- `getClaimDetail` -> first `evidenceId` when present

The environment also exposes synthetic/configurable inputs for:

- `baseUrl`
- policy and vehicle references
- idempotency key
- event data
- pagination/status filter
- transition states

The optional evidence file part is present but disabled by default because a portable repository cannot safely commit a machine-local file path.

## 5. Secret handling

Committed environment values deliberately contain no operator password and no bearer token.

Both variables are typed as Postman `secret` values with empty committed contents:

- `operatorPassword`
- `bearerToken`

The operator login uses the synthetic `.invalid` address already approved for this case study.

## 6. Static contract validation

The validator checks:

- Postman Collection v2.1 schema declaration;
- exact request count against `API_ENDPOINT_INVENTORY.json`;
- operationId identity through canonical request names;
- method and normalized route alignment;
- no unexpected REST operations;
- no MCP tool represented as REST;
- required `X-Request-Id` on business routes;
- required `Idempotency-Key` on `createClaim`;
- bearer auth only on approved protected operations;
- `noauth` on public/operational requests;
- JSON versus multipart body mode;
- required multipart field presence;
- required query variables;
- operational capture of token/tracking/claim/evidence identifiers;
- required environment variables;
- local `baseUrl`;
- absence of committed password/token values;
- valid example idempotency-key bounds.

## 7. Exact-head evidence

Initial candidate:

`5093b5c7f109c13b69f7f4c67f8c8dddd4929328`

Postman Contract workflow:

- run `33998631294`
- conclusion: **SUCCESS**
- `Validate Postman collection and environment coverage`: PASS

Regression evidence on the same SHA:

- OpenAPI Validation run `33998631232`: **SUCCESS**
- API Implementation run `33998631248`: **SUCCESS**

The regression run again passed locked dependency installation, Prisma contract emit, TypeScript typecheck, backend tests, architecture conformance and build.

## 8. Boundary integrity

This boundary does not:

- execute positive/negative API QA scenarios;
- classify dependency advisories for Security QA;
- claim runtime audit-event verification;
- add or change REST operations;
- change the OpenAPI contract;
- add client interfaces;
- modify Blueprint Master;
- claim FAR Seguros internal API/process/infrastructure details.

## 9. Blueprint disposition

Evidence supports:

- `api.postman_collection = PASS`
- `api.postman_environment = PASS`
- `api.postman_coverage = PASS`
- `postman_ready = READY_FOR_REVIEW`

The gate must not become `PASS` until explicit human approval is recorded. Gate approval and PR merge authorization remain separate decisions.
