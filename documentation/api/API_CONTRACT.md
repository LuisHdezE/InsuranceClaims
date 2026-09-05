# API Contract — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Status: READY_FOR_REVIEW
Contract revision: `api-v1-r1`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

This artifact freezes the first authoritative HTTP contract before implementation. It is derived from approved Requirements, Interface Scope Baseline and Architecture/Security/Data/Audit contracts. It does not describe or infer FAR Seguros internal APIs, data models or processes.

OpenAPI will later formalize this exact contract during the Blueprint OpenAPI boundary. No controller/endpoint implementation is authorized until `api_contract_ready = PASS` and the corresponding PR is merged.

---

## 1. Contract scope

The initial business API contains eight REST operations plus two operational health routes.

Business operations:

1. `verifyPolicyVehicle`
2. `createClaim`
3. `trackClaim`
4. `authenticateOperator`
5. `listClaims`
6. `getClaimDetail`
7. `downloadClaimEvidence`
8. `transitionClaimStatus`

Operational routes:

9. `getLiveness`
10. `getReadiness`

The MCP tool `get_claim_status` is also frozen in this boundary as a separate Presentation contract, but it is not an OpenAPI REST operation.

Explicitly excluded from the v1 contract:

- internal operator notes;
- workshop directory/search/maps;
- workshop MCP tools;
- claim reopening;
- post-submission evidence amendments;
- multiple operator roles;
- refresh tokens;
- customer authentication accounts;
- real insurer integration;
- payments, quoting or policy issuance.

---

## 2. Global HTTP conventions

### 2.1 Versioning

Business routes use URL major versioning:

`/api/v1/...`

Health routes remain operational and unversioned:

- `/health/live`
- `/health/ready`

### 2.2 Content types

Default JSON request/response:

`application/json`

Problem Details:

`application/problem+json`

Claim creation with evidence:

`multipart/form-data`

Evidence retrieval returns the allowlisted stored media type:

- `image/jpeg`
- `image/png`
- `application/pdf`

### 2.3 Correlation

Request header:

`X-Request-Id`

Policy:

- a syntactically acceptable caller-provided value may be propagated;
- otherwise the server generates one;
- every business response includes `X-Request-Id`;
- the value is propagated to Application context, structured logs, applicable durable audit and the legacy adapter;
- it is not authentication or authorization material.

### 2.4 Authentication

Protected operator routes use:

`Authorization: Bearer <JWT>`

JWT contract:

- access token only;
- target lifetime: 900 seconds;
- no refresh token;
- no server logout endpoint;
- client logout means token disposal;
- minimal claims only: operator subject, `CLAIMS_OPERATOR` role, issued/expiry metadata;
- signing secret/key comes from runtime secret configuration.

Password verification is performed with the approved Argon2id Infrastructure adapter.

### 2.5 Authorization

API/Application authorization is authoritative. Hiding UI controls never substitutes for server enforcement.

Permission intents:

- `claims.intake.create`
- `claims.tracking.read`
- `claims.backoffice.read`
- `claims.backoffice.transition`
- `claims.mcp.status.read`

The first release has one authenticated business role: `CLAIMS_OPERATOR`.

### 2.6 No internal identifier leakage

Public customer operations never expose the internal claim UUID.

Public responses may expose only the approved opaque tracking code and customer-safe synthetic data.

Operator routes may use internal UUID claim/evidence identifiers because the caller is authenticated and authorized.

---

## 3. RFC 9457 Problem Details contract

Every non-binary error response uses RFC 9457 Problem Details.

Required fields:

```json
{
  "type": "urn:insuranceclaims:problem:validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/public/claims",
  "code": "VALIDATION_ERROR",
  "requestId": "01H...",
  "errors": {
    "field": ["message"]
  }
}
```

`errors` is optional and only appears for field-level validation.

Public error payloads never include:

- stack traces;
- SQL/Prisma details;
- JWT/token values;
- authorization headers;
- raw legacy DTOs;
- filesystem/storage paths;
- password/hash details;
- raw evidence bytes.

### 3.1 Stable error codes

| HTTP | `code` | Meaning |
|---:|---|---|
| 400 | `MALFORMED_REQUEST` | JSON/multipart/request syntax cannot be parsed |
| 401 | `AUTHENTICATION_REQUIRED` | Protected route has no valid bearer token |
| 401 | `INVALID_CREDENTIALS` | Operator login failed; no username/password validity detail |
| 403 | `FORBIDDEN` | Authenticated caller lacks required permission |
| 404 | `CLAIM_NOT_FOUND` | Operator claim absent, or generic public tracking miss |
| 404 | `EVIDENCE_NOT_FOUND` | Evidence absent or does not belong to authorized claim |
| 409 | `INVALID_STATE_TRANSITION` | Requested transition is illegal from actual current state |
| 409 | `CLAIM_STATE_CONFLICT` | `expectedFromStatus` is stale versus actual current state |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same key reused with a different request fingerprint |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Same idempotency identity is still being processed |
| 413 | `PAYLOAD_TOO_LARGE` | Transport-level total/file limits exceeded before normal validation |
| 415 | `UNSUPPORTED_CONTENT_TYPE` | Request content type is not accepted |
| 422 | `VALIDATION_ERROR` | Request fields fail contract validation |
| 422 | `POLICY_VEHICLE_NOT_ELIGIBLE` | Synthetic policy/vehicle pair fails verification |
| 422 | `EVIDENCE_VALIDATION_FAILED` | Evidence count/size/MIME contract fails |
| 429 | `RATE_LIMITED` | Abuse/rate policy triggered |
| 503 | `SERVICE_DEPENDENCY_UNAVAILABLE` | Required dependency such as the simulated legacy service is unavailable |
| 503 | `AUTHENTICATION_TEMPORARILY_UNAVAILABLE` | Valid login cannot complete safely, including required success-audit failure |
| 503 | `CLAIM_SUBMISSION_TEMPORARILY_UNAVAILABLE` | Claim cannot commit atomically with required history/audit |
| 503 | `CLAIM_TRANSITION_TEMPORARILY_UNAVAILABLE` | Transition cannot commit atomically with required history/audit |

For public tracking, invalid tracking code, invalid policy reference and mismatched pair all collapse to the same `404 CLAIM_NOT_FOUND` contract. The response must not reveal which input was valid.

---

## 4. Rate-limit contract

Rate limits are MVP abuse-control policy, not insurer policy.

| Operation | Limit |
|---|---|
| `verifyPolicyVehicle` | 20 requests/minute/IP |
| `createClaim` | 5 requests/minute/IP |
| `trackClaim` | 20 requests/minute/IP |
| `authenticateOperator` | 5 requests/minute/IP and 10 requests/15 minutes/normalized login |
| protected claim reads | 120 requests/minute/operator |
| evidence download | 60 requests/minute/operator |
| transition mutation | 60 requests/minute/operator |
| MCP `get_claim_status` | 20 tool calls/minute/IP or equivalent transport identity |

`429` responses include `Retry-After` when the limiter can supply a meaningful value.

The limiter must not log raw passwords, bearer tokens or full tracking proof pairs.

---

# 5. Operation contracts

## 5.1 `verifyPolicyVehicle`

```text
POST /api/v1/public/policy-verifications
```

Authentication: anonymous.

Permission intent: `claims.intake.create`.

Request:

```json
{
  "policyReference": "SYN-POL-001",
  "vehicleReference": "SYN-VEH-001"
}
```

Validation:

- both fields required;
- string length `1..80`;
- values remain synthetic and are treated as untrusted input.

Successful response `200`:

```json
{
  "policyReference": "SYN-POL-001",
  "vehicleReference": "SYN-VEH-001",
  "eligible": true,
  "customerLabel": "Synthetic Customer A"
}
```

`customerLabel` may be null when the simulator does not provide a safe display label.

The web client cannot use this result as proof that later claim submission may skip server verification. `createClaim` revalidates the pair server-side before mutation.

Relevant errors:

- `422 POLICY_VEHICLE_NOT_ELIGIBLE`
- `429 RATE_LIMITED`
- `503 SERVICE_DEPENDENCY_UNAVAILABLE`

Durable audit: not required.

---

## 5.2 `createClaim`

```text
POST /api/v1/public/claims
Idempotency-Key: <16..128 chars>
Content-Type: multipart/form-data
```

Authentication: anonymous.

Permission intent: `claims.intake.create`.

The multipart body contains these named parts:

| Part | Type | Required |
|---|---|---|
| `policyReference` | string `1..80` | yes |
| `vehicleReference` | string `1..80` | yes |
| `eventType` | string `1..60` | yes |
| `occurredAt` | RFC 3339/ISO 8601 date-time | yes |
| `locationText` | string `1..300` | yes |
| `description` | string `1..4000` | yes |
| `evidence` | zero to five binary files | no |

No closed event-type enum is invented in v1 because approved requirements define the field but not insurer-style categories. The contract therefore treats it as a bounded synthetic descriptor.

Evidence validation:

- maximum 5 files;
- maximum 5 MiB per file;
- MIME allowlist JPEG/PNG/PDF;
- raw filename is never a storage key;
- private storage only;
- customer evidence is immutable after successful submission.

Server mutation sequence must preserve the approved architecture invariants:

1. validate request;
2. verify synthetic policy/vehicle through `PolicyVerificationPort`;
3. resolve idempotency identity;
4. stage permitted evidence privately;
5. atomically persist Claim + evidence metadata + initial `NULL -> RECEIVED` history + `CLAIM_CREATED` audit + idempotency completion;
6. clean staged orphan evidence on failed commit where applicable.

Successful response `201`:

```json
{
  "trackingCode": "opaque-server-generated-value",
  "status": "RECEIVED",
  "submittedAt": "2026-09-05T21:00:00Z",
  "nextSteps": [
    "Keep the tracking code for future status checks."
  ]
}
```

No internal claim UUID is returned.

Relevant errors:

- `400 MALFORMED_REQUEST`
- `409 IDEMPOTENCY_KEY_REUSED`
- `409 IDEMPOTENCY_IN_PROGRESS`
- `413 PAYLOAD_TOO_LARGE`
- `415 UNSUPPORTED_CONTENT_TYPE`
- `422 VALIDATION_ERROR`
- `422 POLICY_VEHICLE_NOT_ELIGIBLE`
- `422 EVIDENCE_VALIDATION_FAILED`
- `429 RATE_LIMITED`
- `503 SERVICE_DEPENDENCY_UNAVAILABLE`
- `503 CLAIM_SUBMISSION_TEMPORARILY_UNAVAILABLE`

Durable audit: `CLAIM_CREATED`, mandatory and atomic with Claim/history persistence.

### Idempotency contract

Header: `Idempotency-Key`.

Rules:

- required;
- 16 to 128 characters after transport validation;
- stored as a hash, not raw key;
- scope = `createClaim`;
- retention = 24 hours in the demo;
- request fingerprint includes normalized scalar fields and deterministic evidence identity derived from safe file metadata/content hashing, never raw file bytes in the idempotency table;
- same key + same fingerprint + completed request replays the original `201` response and adds response header `Idempotency-Replayed: true`;
- same key + different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`;
- same key while first request is in progress returns `409 IDEMPOTENCY_IN_PROGRESS`;
- replay does not create a second Claim, history entry, evidence set or `CLAIM_CREATED` audit event.

---

## 5.3 `trackClaim`

```text
POST /api/v1/public/claim-tracking
```

`POST` is deliberately used for this read query so the tracking proof pair does not live in URL/query-string logs.

Authentication: anonymous tracking proof.

Permission intent: `claims.tracking.read`.

Request:

```json
{
  "trackingCode": "opaque-tracking-code",
  "policyReference": "SYN-POL-001"
}
```

Validation:

- both required;
- each `1..80` characters;
- neither value is logged in full.

Successful response `200`:

```json
{
  "trackingCode": "opaque-tracking-code",
  "summary": {
    "vehicleReference": "SYN-VEH-001",
    "eventType": "Synthetic incident",
    "occurredAt": "2026-09-05T12:00:00Z"
  },
  "status": "UNDER_REVIEW",
  "timeline": [
    {
      "status": "RECEIVED",
      "occurredAt": "2026-09-05T12:15:00Z"
    },
    {
      "status": "UNDER_REVIEW",
      "occurredAt": "2026-09-05T14:20:00Z"
    }
  ],
  "nextSteps": ["Continue to use this tracking reference for status updates."]
}
```

Public timeline excludes actor IDs, audit metadata and internal technical details.

Relevant errors:

- `404 CLAIM_NOT_FOUND` for every invalid/mismatched proof case;
- `429 RATE_LIMITED`;
- generic `500`/Problem Details only if an unexpected safe failure occurs.

Durable audit: not required; structured security/technical telemetry may record masked failure metrics.

---

## 5.4 `authenticateOperator`

```text
POST /api/v1/operator/auth/login
```

Request:

```json
{
  "login": "operator@example.invalid",
  "password": "demo-password"
}
```

Validation:

- login required, max 160 characters;
- password required, max 256 transport characters;
- password never logged or returned.

Successful response `200`:

```json
{
  "accessToken": "<JWT>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "operator": {
    "id": "uuid",
    "login": "operator@example.invalid",
    "role": "CLAIMS_OPERATOR"
  }
}
```

Critical audit rule:

- valid credentials do not receive a JWT unless durable `AUTH_LOGIN_SUCCEEDED` persistence succeeds;
- failed credentials remain denied even if `AUTH_LOGIN_FAILED` audit persistence fails;
- failure-audit persistence failure emits a sanitized high-severity technical log but never grants access.

Relevant errors:

- `401 INVALID_CREDENTIALS`
- `429 RATE_LIMITED`
- `503 AUTHENTICATION_TEMPORARILY_UNAVAILABLE`

No refresh or logout endpoint exists in the first release.

---

## 5.5 `listClaims`

```text
GET /api/v1/operator/claims?page=1&pageSize=20&status=UNDER_REVIEW
```

Authentication: bearer JWT.

Permission: `claims.backoffice.read`.

Query contract:

- `page`: integer >= 1, default 1;
- `pageSize`: integer 1..100, default 20;
- `status`: optional exact lifecycle value.

No free-text search is required in v1.

Successful response `200`:

```json
{
  "items": [
    {
      "claimId": "uuid",
      "trackingCode": "opaque-tracking-code",
      "status": "UNDER_REVIEW",
      "occurredAt": "2026-09-05T12:00:00Z",
      "policyReference": "SYN-POL-001",
      "vehicleReference": "SYN-VEH-001",
      "createdAt": "2026-09-05T12:15:00Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "totalItems": 1,
  "totalPages": 1
}
```

Relevant errors:

- `401 AUTHENTICATION_REQUIRED`
- `403 FORBIDDEN`
- `422 VALIDATION_ERROR`

Durable audit: not required.

---

## 5.6 `getClaimDetail`

```text
GET /api/v1/operator/claims/{claimId}
```

Authentication: bearer JWT.

Permission: `claims.backoffice.read`.

Successful response `200` includes:

```json
{
  "claimId": "uuid",
  "trackingCode": "opaque-tracking-code",
  "policyReference": "SYN-POL-001",
  "vehicleReference": "SYN-VEH-001",
  "verifiedCustomerLabel": "Synthetic Customer A",
  "eventType": "Synthetic incident",
  "occurredAt": "2026-09-05T12:00:00Z",
  "locationText": "Synthetic location",
  "description": "Synthetic description",
  "status": "UNDER_REVIEW",
  "allowedTransitions": ["OBSERVED", "APPROVED"],
  "evidence": [
    {
      "evidenceId": "uuid",
      "mediaType": "image/jpeg",
      "sizeBytes": 1024,
      "displayFilename": "example.jpg",
      "createdAt": "2026-09-05T12:10:00Z"
    }
  ],
  "history": [
    {
      "fromStatus": null,
      "toStatus": "RECEIVED",
      "actorType": "SYSTEM",
      "actorId": null,
      "occurredAt": "2026-09-05T12:15:00Z"
    }
  ],
  "auditEvents": [
    {
      "eventCode": "CLAIM_CREATED",
      "occurredAt": "2026-09-05T12:15:00Z",
      "actorType": "CUSTOMER_PUBLIC",
      "actorId": null,
      "outcome": "SUCCESS",
      "requestId": "01H..."
    }
  ],
  "createdAt": "2026-09-05T12:15:00Z",
  "updatedAt": "2026-09-05T14:20:00Z"
}
```

`allowedTransitions` is computed server-side from the Domain lifecycle. It is presentation guidance only; `transitionClaimStatus` still revalidates legality and concurrency.

Audit metadata returned here is allowlisted. Arbitrary audit JSON metadata is not exposed by default.

Relevant errors:

- `401 AUTHENTICATION_REQUIRED`
- `403 FORBIDDEN`
- `404 CLAIM_NOT_FOUND`

---

## 5.7 `downloadClaimEvidence`

```text
GET /api/v1/operator/claims/{claimId}/evidence/{evidenceId}
```

Authentication: bearer JWT.

Permission: `claims.backoffice.read`.

Authorization checks both the claim and evidence relationship. An evidence UUID from another claim cannot be used as a cross-claim shortcut.

Successful `200` response:

- body = binary file bytes;
- `Content-Type` = stored allowlisted media type;
- `Content-Disposition` uses a sanitized display filename;
- no filesystem path/storage key is returned;
- response still carries `X-Request-Id`.

Relevant errors:

- `401 AUTHENTICATION_REQUIRED`
- `403 FORBIDDEN`
- `404 EVIDENCE_NOT_FOUND`

Durable audit: not required in the mandatory catalog.

---

## 5.8 `transitionClaimStatus`

```text
POST /api/v1/operator/claims/{claimId}/transitions
```

Authentication: bearer JWT.

Permission: `claims.backoffice.transition`.

Request:

```json
{
  "expectedFromStatus": "RECEIVED",
  "toStatus": "UNDER_REVIEW"
}
```

Both values use the approved lifecycle enum:

- `RECEIVED`
- `UNDER_REVIEW`
- `OBSERVED`
- `APPROVED`
- `IN_REPAIR`
- `CLOSED`

Concurrency rule:

- `expectedFromStatus` is mandatory;
- if actual current state differs, return `409 CLAIM_STATE_CONFLICT` before applying a transition;
- if expected state matches actual but transition is illegal, return `409 INVALID_STATE_TRANSITION`;
- Domain remains authoritative for transition legality.

Successful response `200`:

```json
{
  "claimId": "uuid",
  "fromStatus": "RECEIVED",
  "toStatus": "UNDER_REVIEW",
  "status": "UNDER_REVIEW",
  "allowedTransitions": ["OBSERVED", "APPROVED"],
  "transitionedAt": "2026-09-05T14:20:00Z"
}
```

Atomic mutation contract:

- update Claim status;
- append exactly one status-history record;
- append exactly one `CLAIM_STATE_TRANSITIONED` durable audit event;
- commit all or none.

Relevant errors:

- `401 AUTHENTICATION_REQUIRED`
- `403 FORBIDDEN`
- `404 CLAIM_NOT_FOUND`
- `409 CLAIM_STATE_CONFLICT`
- `409 INVALID_STATE_TRANSITION`
- `422 VALIDATION_ERROR`
- `503 CLAIM_TRANSITION_TEMPORARILY_UNAVAILABLE`

No internal-note/comment field exists in this request because notes are deferred.

---

## 5.9 Health operations

### `getLiveness`

```text
GET /health/live
```

Purpose: process-level liveness only.

Success `200`:

```json
{
  "status": "ok"
}
```

It must not require PostgreSQL or the simulator to be healthy, otherwise an external dependency outage could turn liveness into restart churn.

### `getReadiness`

```text
GET /health/ready
```

Purpose: readiness for serving required application traffic.

The implementation may verify PostgreSQL and other mandatory local dependencies according to service responsibility. It returns only sanitized component state labels, never credentials, URLs with secrets or internal stack details.

---

# 6. Permission matrix

| Operation | Guest | Claims Operator | Permission |
|---|---:|---:|---|
| `verifyPolicyVehicle` | yes | yes | `claims.intake.create` capability intent |
| `createClaim` | yes | yes | `claims.intake.create` capability intent |
| `trackClaim` | yes | yes | `claims.tracking.read` proof-bound capability |
| `authenticateOperator` | yes | n/a | none before authentication |
| `listClaims` | no | yes | `claims.backoffice.read` |
| `getClaimDetail` | no | yes | `claims.backoffice.read` |
| `downloadClaimEvidence` | no | yes | `claims.backoffice.read` |
| `transitionClaimStatus` | no | yes | `claims.backoffice.transition` |
| health routes | yes | yes | operational only |
| MCP `get_claim_status` | protocol client | protocol client | `claims.mcp.status.read` read-only capability |

The public capability labels are traceability identifiers, not bearer privileges. Anonymous callers still have to satisfy request/proof/validation rules and rate limits.

---

# 7. Audit event mapping

| Operation/outcome | Durable audit | Transaction/failure rule |
|---|---|---|
| successful `authenticateOperator` | `AUTH_LOGIN_SUCCEEDED` | JWT not issued unless audit persists |
| failed credentials | attempt `AUTH_LOGIN_FAILED` | access always denied; audit failure does not grant access |
| successful `createClaim` | `CLAIM_CREATED` | atomic with Claim + initial history |
| successful `transitionClaimStatus` | `CLAIM_STATE_TRANSITIONED` | atomic with status update + history |
| policy verification | none mandatory | structured technical telemetry only |
| tracking lookup | none mandatory | masked security metrics/logging only |
| claim reads/evidence reads | none mandatory | structured technical logging only |
| health | none | operational telemetry only |
| MCP status read | none mandatory | structured tool/correlation telemetry only |

The API exposes no endpoint to create/update/delete audit events directly.

---

# 8. Idempotency matrix

| Operation | Idempotency requirement |
|---|---|
| `createClaim` | REQUIRED via `Idempotency-Key`, 24h retention |
| `verifyPolicyVehicle` | not required, no mutation |
| `trackClaim` | not required, no mutation |
| `authenticateOperator` | not idempotent; protected by rate limit/audit |
| claim reads | not applicable |
| `transitionClaimStatus` | no key; mandatory `expectedFromStatus` provides stale-state protection |
| health | not applicable |
| MCP status | not applicable, read-only |

---

# 9. REST schema definitions

These definitions are the human-authoritative intent that later OpenAPI must reproduce exactly.

## 9.1 Claim status enum

```text
RECEIVED
UNDER_REVIEW
OBSERVED
APPROVED
IN_REPAIR
CLOSED
```

Allowed state transitions remain exactly the approved Requirements/Domain matrix.

## 9.2 `PolicyVehicleVerificationRequest`

- `policyReference`: required string `1..80`
- `vehicleReference`: required string `1..80`

## 9.3 `PolicyVehicleVerificationResponse`

- `policyReference`: string
- `vehicleReference`: string
- `eligible`: literal `true` on success
- `customerLabel`: nullable string, max 160

Ineligible pairs use the Problem Details error contract rather than a successful `eligible:false` business response.

## 9.4 `CreateClaimRequest`

Multipart fields defined in operation 5.2.

No client-supplied status, claim ID, tracking code, audit fields or storage key is accepted.

## 9.5 `CreateClaimResponse`

- `trackingCode`: opaque string max 80
- `status`: `RECEIVED`
- `submittedAt`: date-time
- `nextSteps`: array of customer-safe strings

## 9.6 `TrackClaimRequest`

- `trackingCode`: required string `1..80`
- `policyReference`: required string `1..80`

## 9.7 `CustomerClaimStatusResponse`

- `trackingCode`
- `summary.vehicleReference`
- `summary.eventType`
- `summary.occurredAt`
- `status`
- `timeline[]` with only `status`, `occurredAt`
- `nextSteps[]`

No operator identity, durable-audit metadata, internal UUID or storage information.

## 9.8 `OperatorLoginRequest`

- `login`: required string max 160
- `password`: required string max 256 transport chars

## 9.9 `OperatorLoginResponse`

- `accessToken`
- `tokenType = Bearer`
- `expiresIn = 900`
- `operator.id`
- `operator.login`
- `operator.role = CLAIMS_OPERATOR`

## 9.10 `ClaimsPageResponse`

- `items[]`: claim summary with internal `claimId`, tracking code, state, occurrence timestamp, synthetic policy/vehicle refs, created timestamp
- `page`
- `pageSize`
- `totalItems`
- `totalPages`

## 9.11 `OperatorClaimDetailResponse`

Contains the authorized Claim detail, server-computed `allowedTransitions`, evidence metadata, status history and allowlisted audit-event summary.

It does not expose password data, JWT material, raw audit metadata JSON, storage keys or filesystem paths.

## 9.12 `TransitionClaimStatusRequest`

- `expectedFromStatus`: required Claim status enum
- `toStatus`: required Claim status enum

## 9.13 `TransitionClaimStatusResponse`

- `claimId`
- `fromStatus`
- `toStatus`
- `status`
- `allowedTransitions[]`
- `transitionedAt`

## 9.14 `HealthResponse`

Minimum success shape:

```json
{"status":"ok"}
```

Readiness may add sanitized component labels without secret-bearing values.

---

# 10. MCP tool contract

Canonical tool name:

`get_claim_status`

Transport: stateless Streamable HTTP through the official TypeScript MCP SDK v2 line approved by Architecture.

Input:

```json
{
  "trackingCode": "opaque-tracking-code",
  "policyReference": "SYN-POL-001"
}
```

Output semantic shape matches the customer-safe projection of `trackClaim`:

- tracking code;
- customer-safe claim summary;
- public status;
- public timeline;
- synthetic next steps.

Rules:

- read-only;
- no claim mutation tools in v1;
- no direct PostgreSQL access from MCP Presentation;
- no direct simulator access from MCP Presentation;
- same invalid-proof non-disclosure policy as public tracking;
- no audit/internal operator information;
- Origin validation and rate controls required at transport boundary.

MCP is not represented by a fake OpenAPI `operationId`; its traceability identity is `MCP:get_claim_status`.

---

# 11. Requirement / interface traceability

| Contract identity | Requirements / use cases | Interface baseline |
|---|---|---|
| `verifyPolicyVehicle` | FR-001, FR-002, BR-008, UC-001 | WEB-002 |
| `createClaim` | FR-002..FR-006, BR-004, BR-008..BR-010, UC-002 | WEB-003, WEB-004, WEB-005 |
| `trackClaim` | FR-007, FR-008, BR-007, BR-009, UC-003 | WEB-006, WEB-007 |
| `authenticateOperator` | FR-009, UC-004 | WEB-008 |
| `listClaims` | FR-010, UC-005 | WEB-009 |
| `getClaimDetail` | FR-011, UC-005 | WEB-010 |
| `downloadClaimEvidence` | FR-011, NFR-005, UC-005 | WEB-010 |
| `transitionClaimStatus` | FR-012, FR-013, BR-001..BR-006, UC-006 | WEB-010 |
| `MCP:get_claim_status` | FR-014, BR-011, UC-007 | non-visual MCP adapter |
| health operations | FR-019, NFR-009, UC-008 | non-visual operational capability |

This resolves every API need recorded in the approved Interface Scope Baseline without adding the deferred workshop/notes/reopen scope.

---

# 12. Initial API impact analysis applicability

`api.change_impact_analysis` is **not applicable** to this first contract baseline.

Reason:

- no prior `api_gate` has passed;
- no executable consumer is yet bound to an existing API revision;
- this is the initial authoritative v1 contract.

After the first API Gate, any change to `operationId`, auth, authorization, security, error/versioning or consumer-bound payload behavior must follow Blueprint impact analysis and scoped revalidation.

---

# 13. Implementation stop conditions

API implementation must not begin if any of these becomes unresolved:

- an operation lacks stable `operationId`;
- a protected operation lacks auth/permission mapping;
- `createClaim` retry semantics drift from the approved idempotency contract;
- claim transition concurrency/legality semantics are ambiguous;
- audit mapping becomes optional for required mutations;
- a public response would expose internal claim IDs, audit internals or storage paths;
- OpenAPI later disagrees with this contract rather than formalizing it;
- a client need appears that requires a new server capability but has not returned through contract review.

---

# 14. Blueprint API Contract checks

This package covers the required Blueprint checks as follows:

- `api.scope_defined` -> sections 1–2;
- `api.endpoint_inventory` -> section 5 + `API_ENDPOINT_INVENTORY.json`;
- `api.auth_contract` -> sections 2.4–2.5 and operation contracts;
- `api.permission_matrix` -> section 6;
- `api.audit_event_mapping` -> section 7;
- `api.idempotency_matrix` -> section 8;
- `api.contract_traceability` -> section 11;
- `api.change_impact_analysis` -> section 12, classified not applicable for the initial baseline.

The documentary and machine-readable evidence may be marked complete, but `api_contract_ready` remains `READY_FOR_REVIEW` until explicit human approval is recorded.
