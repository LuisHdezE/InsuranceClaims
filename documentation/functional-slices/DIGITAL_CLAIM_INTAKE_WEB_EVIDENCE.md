# Digital Claim Intake / Web — Functional Interface Slice Evidence

## Decision boundary

This evidence package evaluates the Blueprint 0.5.2 `functional_slice_ready` gate for the exact scope `digital-claim-intake / web`. It does **not** grant PASS, does not move the slice lifecycle to `FUNCTIONAL`, and does not authorize merge. Human gate approval remains required.

- Blueprint version: `0.5.2`
- Pinned Blueprint commit: `737556e24195aa909117790f2d7ff0be2fe0a474`
- Repository: `LuisHdezE/InsuranceClaims`
- Base `main`: `e2fef3b84598e25273d7e86d740a9fe3c4ebb16f`
- Implementation validation head: `2b98d99e6e5453f9950b80bac28c62a2c14a414b`
- Pull request: `#14`
- Platform: `web`
- Slice: `digital-claim-intake`
- Inventory: `WEB-002`, `WEB-003`, `WEB-004`, `WEB-005`
- API revision: `api-v1-r1`
- Canonical operationIds: `verifyPolicyVehicle`, `createClaim`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## Canonical check mapping

| Blueprint check | Result | Evidence |
|---|---|---|
| `functional.inventory_binding` | PASS | Slice contract and executable validator bind exactly WEB-002..WEB-005 to `digital-claim-intake/web`; routes are `/claims/new/verify`, `/claims/new`, `/claims/new/review`, `/claims/new/success`. |
| `functional.api_dependencies_resolved` | PASS | All four inventory items have zero unresolved API needs and bind only `verifyPolicyVehicle` / `createClaim` from `api-v1-r1`. No direct browser dependency on PostgreSQL or the simulated legacy service exists. |
| `functional.real_api_integration` | PASS | Permanent CI starts PostgreSQL 18, the separate simulated legacy HTTP service and the production NestJS API, then exercises the real web Axios client against them. |
| `functional.no_hardcoded_business_data` | PASS | Synthetic references shown in the UI are demo examples only. Eligibility, canonical claim status, tracking code, submitted timestamp and next steps come from the API. The client never manufactures authoritative policy/claim truth. |
| `functional.no_invented_capabilities` | PASS | The slice exposes only the approved inventory and operations. Event type remains free text because no authoritative catalog API exists; no convenience endpoint, direct legacy call, operator action, background/offline write queue or local business authority was invented. |
| `functional.auth_rbac_runtime` | PASS | This exact slice intentionally uses the approved anonymous public endpoints. The client does not invent an `Authorization` header or operator permission surface. API/Application authorization remains authoritative, satisfying the scoped public-boundary behavior rather than treating a required Blueprint check as silently N/A. |
| `functional.forms_error_states` | PASS | React Hook Form + Zod provide structural feedback; evidence guardrails mirror the approved contract while the server remains authoritative. Explicit presentation exists for network/offline, 409, 422, 429 with Retry-After, 503 and generic failures. |
| `functional.observability_runtime` | PASS | Central Axios transport emits `X-Request-Id`; Problem Details/response headers preserve `requestId`; user-facing failures may show the sanitized technical reference without logging sensitive payloads. |
| `functional.responsive_runtime` | PASS | Runtime CSS contracts cover desktop, <=900px and <=640px layouts, including one-column claim flow/forms and full-width mobile actions without semantic reordering. |
| `functional.accessibility_runtime` | PASS | Semantic labels, `aria-invalid`, `aria-describedby`, `role=alert`, `aria-live`, visible `:focus-visible`, minimum touch targets and `prefers-reduced-motion` behavior are implemented. |
| `functional.tests` | PASS | Exact-head CI passes contract validator, TypeScript typecheck, web unit/component tests, production web build and real API runtime integration. |
| `functional.traceability` | PASS | Validator reconciles slice artifact -> Interface Inventory -> Client Architecture -> OpenAPI operationIds -> concrete routes/client calls/tests. |
| `functional.idempotency_runtime` | PASS | Applicable to `createClaim`. Runtime QA sends the same prepared payload twice using the same `Idempotency-Key`, receives the same tracking code and observes `Idempotency-Replayed: true` on replay. No implicit replacement key is generated for a conflict/retry of the same intent. |

## Runtime and contract evidence

Permanent workflow: `.github/workflows/functional-slice-digital-claim-intake-web.yml`.

Exact implementation validation head `2b98d99e6e5453f9950b80bac28c62a2c14a414b` passed all seven workflows:

| Workflow | Run | Result |
|---|---:|---|
| Functional Slice - Digital Claim Intake Web | `34026123644` | SUCCESS |
| API QA | `34026123604` | SUCCESS |
| API Implementation | `34026123664` | SUCCESS |
| OpenAPI Validation | `34026123586` | SUCCESS |
| Postman Contract | `34026123601` | SUCCESS |
| Interface Inventory | `34026123596` | SUCCESS |
| Design System | `34026123643` | SUCCESS |

The Functional Slice workflow proves two independent layers:

1. `web-contract`: locked install, executable slice-contract validation, TypeScript typecheck, web tests and production Vite build.
2. `real-api-integration`: PostgreSQL 18 + simulated legacy HTTP dependency + production NestJS composition + actual web Axios client, including successful eligible verification, real claim creation, idempotent replay and authoritative 422 rejection of an inactive synthetic policy/vehicle pair.

## Security dependency classification

The development-inclusive npm tree can still report advisories from tooling/transitive development packages. This is retained as a visible engineering finding and is **not** hidden or force-fixed.

The project security gate classifies deployable dependencies separately with `npm audit --omit=dev`. On the validated security-updated web dependency baseline the API QA production-dependency classification step passes with no high/critical production advisory. A preceding exact-head run on the same lock/dependency baseline explicitly reported `0` production advisories across all severities. No `npm audit fix --force` was used.

Direct web dependencies were updated narrowly to remove the production blockers:

- Axios `1.20.0`
- React Router DOM `7.18.3`
- React / ReactDOM aligned at `19.2.8`
- Zod aligned with repository baseline at `4.5.4`

## Offline / degraded-network behavior

Offline is a degraded presentation state, not a new business capability. Network failure is classified explicitly, the UI explains recovery, and the client neither queues claim mutations nor substitutes an assumed local success. The in-progress claim flow remains ephemeral in memory.

## Gate proposal

All canonical required checks for `functional_slice_ready` and the applicable idempotency check are evidenced for `digital-claim-intake / web`.

Proposed gate result: **`READY_FOR_REVIEW`**.

The slice lifecycle remains **`IN_PROGRESS`** until explicit human gate approval. Only a subsequent human-approved `PASS` may authorize lifecycle state `FUNCTIONAL`. Merge authorization remains a separate human decision.
