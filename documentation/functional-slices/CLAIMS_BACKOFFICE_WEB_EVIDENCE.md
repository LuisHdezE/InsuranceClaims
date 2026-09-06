# Claims Backoffice Web Functional Slice Evidence

## Evidence identity

- Evidence ID: `EVD-FUNCTIONAL-BACKOFFICE-WEB-001`
- Blueprint baseline: **0.5.2**
- Pinned Blueprint commit: `737556e24195aa909117790f2d7ff0be2fe0a474`
- Consumer repository: `LuisHdezE/InsuranceClaims`
- Pull request: **#16**
- Base `main`: `f576b956b5d54ddbe67bc0ffaaa6fc9f231edb95`
- Slice: `claims-backoffice / web`
- Inventory: `WEB-008`, `WEB-009`, `WEB-010`
- API revision: `api-v1-r1`
- Canonical operations: `authenticateOperator`, `listClaims`, `getClaimDetail`, `downloadClaimEvidence`, `transitionClaimStatus`

## Functional boundary delivered

The slice implements the approved operator journey only:

- `/operator/login` authenticates the synthetic Claims Operator through `authenticateOperator`.
- The returned bearer token and operator identity remain in React memory only and expire from the client lifecycle using the API-provided `expiresIn = 900` seconds.
- No refresh-token, remote logout, persistent browser credential storage, direct database access, MCP call or simulated-legacy call is invented by the web client.
- `/operator/claims` uses `listClaims` with approved pagination and status filtering.
- `/operator/claims/:claimId` uses `getClaimDetail`, exposes the authorized evidence/history/audit projection, and downloads evidence only through `downloadClaimEvidence`.
- State changes use `transitionClaimStatus` with mandatory `expectedFromStatus`.
- Transition options are rendered only from server-returned `allowedTransitions`; React does not reproduce authoritative lifecycle rules.
- A `409 CLAIM_STATE_CONFLICT` clears the pending decision, refetches authoritative detail and requires a new explicit operator choice. Mutations are never auto-replayed.

## Security and session behavior

- Protected REST calls emit `Authorization: Bearer <token>` only for the operator functions.
- Intake functions remain anonymous and retain their required `Idempotency-Key` behavior only for `createClaim`.
- Backoffice functions do not emit `Idempotency-Key`; idempotency is therefore **N/A** for this slice and `expectedFromStatus` remains a concurrency guard rather than a second idempotency protocol.
- Local sign-out, token expiry and `401` remove the protected React Query cache identified by the `operator` key prefix.
- `403` remains server-authoritative; the UI does not promote or reinterpret permissions.
- Evidence is fetched as protected binary data, exposed through a temporary object URL only for the user-triggered download, and that URL is revoked immediately afterward.

## Error, accessibility and responsive states

The client has explicit presentation/recovery for network/offline, `401`, `403`, `404`, `409`, `422`, `429` and temporary service failure. Runtime and UI guardrails preserve request correlation where returned, do not fabricate cached business truth offline, and do not silently retry state transitions.

The operational shell follows the approved Design System rather than the public marketing layout. The claims table uses semantic table markup at wider layouts and converts to labeled row cards on compact screens. Existing project-wide visible focus behavior is preserved, status is communicated with text in addition to color, and async failures use accessible alert/live-region semantics.

## Real API integration evidence

The dedicated workflow starts PostgreSQL 18, emits the Prisma contract, bootstraps the ephemeral schema, creates a random synthetic operator password, seeds the synthetic Claims Operator, starts the separate simulated legacy HTTP system and the production Nest API composition, and then executes the actual web Axios client functions.

The runtime proof creates a synthetic claim with protected PNG evidence and verifies:

- successful operator authentication with bearer token, `expiresIn = 900` and role `CLAIMS_OPERATOR`;
- invalid bearer token rejected by the protected claims list with `401 AUTHENTICATION_REQUIRED`;
- authorized filtered listing returns the created claim;
- authorized detail returns current status, evidence and server `allowedTransitions`;
- protected evidence download returns non-empty `image/png` bytes;
- transition `RECEIVED -> UNDER_REVIEW` commits using the current `expectedFromStatus`;
- a stale second transition using `expectedFromStatus = RECEIVED` returns `409 CLAIM_STATE_CONFLICT`;
- authoritative refresh returns `UNDER_REVIEW`, corresponding history and `CLAIM_STATE_TRANSITIONED` audit evidence.

## Initial validator failures retained transparently

The first PR head `94068dfd4b7284a40326908ce818bce15c5d5470` produced two static validator failures while both affected real-API integration jobs succeeded:

- `Functional Slice - Claims Backoffice Web` run `34030109930`: `web-contract` failed because the new validator searched the entire shared `claims.ts` module for `Idempotency-Key`. The marker legitimately belongs to the already-approved anonymous `createClaim` function, outside the backoffice slice.
- `Functional Slice - Digital Claim Intake Web` run `34030109905`: `web-contract` failed because the existing Intake validator searched the entire shared `claims.ts` module for `Authorization`. The marker legitimately belongs to newly added protected operator functions, outside the Intake slice.

No API, runtime, authorization, idempotency or business behavior was weakened to correct these findings. The validators were narrowed to their own function boundaries:

- `fb0f2f4c7436277443b68c0a5c0dd8b70ca3ab7d` scopes backoffice assertions to operator API functions while retaining the prohibition on `Idempotency-Key` there.
- `dc60bbf4783d5a044b7d33855cea76f6b40d4e9f` scopes Intake assertions to `verifyPolicyVehicle` and `createClaim` while retaining the prohibition on operator `Authorization` there.

## Corrected exact-head validation

Corrected implementation head: `dc60bbf4783d5a044b7d33855cea76f6b40d4e9f`.

All nine applicable workflows passed on that exact head:

| Workflow | Run | Result |
|---|---:|---|
| Functional Slice - Claims Backoffice Web | `34030311102` | SUCCESS |
| Functional Slice - Customer Claim Tracking Web | `34030311099` | SUCCESS |
| Functional Slice - Digital Claim Intake Web | `34030311082` | SUCCESS |
| API QA | `34030311090` | SUCCESS |
| API Implementation | `34030311106` | SUCCESS |
| OpenAPI Validation | `34030311092` | SUCCESS |
| Postman Contract | `34030311091` | SUCCESS |
| Interface Inventory | `34030311107` | SUCCESS |
| Design System | `34030311085` | SUCCESS |

The dedicated backoffice workflow passed both `web-contract` and `real-api-integration`. Its web-contract job passed the functional validator, TypeScript, Vitest and production web build. Its runtime job passed PostgreSQL 18 + simulated legacy + production API + real web client execution.

## Definition of Done conclusion

The canonical Functional Interface Slice checks are evidenced as follows:

- routing: **PASS**
- real API: **PASS**
- auth/RBAC boundary: **PASS**
- forms/errors: **PASS**
- observability/correlation handling: **PASS**
- responsive behavior: **PASS**
- accessibility contracts: **PASS**
- tests/build: **PASS**
- traceability: **PASS**
- no hardcoded authoritative business data: **PASS**
- no invented capabilities: **PASS**
- idempotency: **N/A**
- offline/network behavior: **PASS**

Therefore the slice Definition of Done is **PASS** and it is eligible for `functional_slice_ready = READY_FOR_REVIEW`.

The lifecycle intentionally remains **IN_PROGRESS** until explicit human Functional Slice Ready approval. Visual & Functional Review, Integration QA and Human Acceptance remain **PENDING** and are not implied by this evidence.

## Review-state exact-head validation

After the Definition of Done evidence was registered, `.blueprint/status.yaml` was reconciled to register all three functional-slice artifacts and set only `claims-backoffice/web` to `READY_FOR_REVIEW`. The one-time status reconciler was then removed before validation.

Review-state head: `eb98701e2f098afe4cfec895bd1573bd7fbd4dd0`.

All ten applicable workflows passed on that exact head:

| Workflow | Run | Result |
|---|---:|---|
| Functional Slice - Claims Backoffice Web | `34030518283` | SUCCESS |
| Functional Slice - Customer Claim Tracking Web | `34030518305` | SUCCESS |
| Functional Slice - Digital Claim Intake Web | `34030518312` | SUCCESS |
| API QA | `34030518357` | SUCCESS |
| API Implementation | `34030518404` | SUCCESS |
| OpenAPI Validation | `34030518292` | SUCCESS |
| Postman Contract | `34030518323` | SUCCESS |
| Interface Inventory | `34030518315` | SUCCESS |
| Design System | `34030518339` | SUCCESS |
| Client Architecture | `34030518281` | SUCCESS |

This review-state validation confirms that the status reconciliation itself introduced no drift in the approved API, prior functional slices, interface inventory, Design System or Client Architecture. The Functional Interface Slice phase intentionally remains `IN_PROGRESS` at 67% until explicit human approval promotes the third slice to `FUNCTIONAL`.
