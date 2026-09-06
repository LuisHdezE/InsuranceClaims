# Customer Claim Tracking / Web — Functional Interface Slice Evidence

## Decision boundary

This evidence package evaluates the Blueprint 0.5.2 `functional_slice_ready` gate for the exact scope `customer-claim-tracking / web`. It does **not** grant PASS, does not move the slice lifecycle to `FUNCTIONAL`, and does not authorize merge. Human gate approval remains required.

- Blueprint version: `0.5.2`
- Pinned Blueprint commit: `737556e24195aa909117790f2d7ff0be2fe0a474`
- Repository: `LuisHdezE/InsuranceClaims`
- Base `main`: `fd042ddc0d861b40190e763e6a916c8d0afeb7b9`
- Implementation validation head: `1257de1f7c027b587bf9ae8d8e63985d98cc7af8`
- Review-state validation head: `94812fb26e07d08c3895e20abf2a704bad2ff688`
- Pull request: `#15`
- Platform: `web`
- Slice: `customer-claim-tracking`
- Inventory: `WEB-006`, `WEB-007`
- API revision: `api-v1-r1`
- Canonical operationId: `trackClaim`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## Canonical check mapping

| Blueprint check | Result | Evidence |
|---|---|---|
| `functional.inventory_binding` | PASS | Slice contract and executable validator bind exactly WEB-006 and WEB-007 to `customer-claim-tracking/web`; routes are `/claims/track` and `/claims/track/status`. |
| `functional.api_dependencies_resolved` | PASS | Both inventory items have zero unresolved API needs and bind only `trackClaim` from `api-v1-r1`. The web client calls REST only and has no direct PostgreSQL, MCP or simulated-legacy dependency. |
| `functional.real_api_integration` | PASS | Permanent CI starts PostgreSQL 18, the separate simulated legacy HTTP service and the production NestJS API, creates a synthetic claim through the real intake operations and exercises the actual browser API client against `trackClaim`. |
| `functional.no_hardcoded_business_data` | PASS | Tracking proof input is user-provided/synthetic and retained only in memory. Claim status, summary, timeline and next steps are rendered only from the authoritative customer-safe API response. |
| `functional.no_invented_capabilities` | PASS | The slice exposes only lookup, customer-safe status, explicit refresh and navigation already approved by the inventory. It introduces no convenience API, database access, durable browser persistence, background queue or direct legacy/MCP call. |
| `functional.auth_rbac_runtime` | PASS | This slice intentionally uses the approved anonymous proof-bound tracking endpoint. The browser does not invent operator authorization; server/Application authorization remains authoritative. |
| `functional.forms_error_states` | PASS | React Hook Form + Zod provide structural input validation. Runtime/UI behavior covers privacy-safe collapsed 404, 429 with Retry-After, network/offline failure and normalized API failures without disclosing which proof element was incorrect. |
| `functional.observability_runtime` | PASS | The shared Axios transport preserves `X-Request-Id`; the tracking flow keeps the sanitized request identifier for support-facing presentation without persisting sensitive proof data. |
| `functional.responsive_runtime` | PASS | Tracking-specific CSS provides desktop, <=900px and <=640px layouts, including timeline reflow and compact mobile status presentation without changing semantic order. |
| `functional.accessibility_runtime` | PASS | Programmatic labels, `aria-invalid`, `aria-describedby`, live/status semantics, semantic timeline structure, text status and inherited visible `:focus-visible` behavior are implemented. |
| `functional.tests` | PASS | Exact-head CI passes the executable slice validator, TypeScript typecheck, web tests, production build and real API integration. The previously accepted intake slice also passes regression on the same head. |
| `functional.traceability` | PASS | Validator reconciles slice artifact -> Interface Inventory -> approved Client Architecture -> canonical `trackClaim` binding -> routes -> concrete browser client -> runtime QA. |
| `functional.idempotency_runtime` | N/A | `trackClaim` is the approved read operation for this slice and does not require `Idempotency-Key`; the client architecture explicitly forbids inventing a mutation idempotency protocol here. |
| `functional.offline` | PASS | Network failure is an explicit degraded presentation state. Sensitive tracking proof/result remains memory-only; no local success, durable cache or offline business authority is manufactured. |

## Runtime and contract evidence

Permanent workflow: `.github/workflows/functional-slice-customer-claim-tracking-web.yml`.

Exact implementation validation head `1257de1f7c027b587bf9ae8d8e63985d98cc7af8` passed every workflow triggered for PR #15:

| Workflow | Run | Result |
|---|---:|---|
| Functional Slice - Customer Claim Tracking Web | `34028643878` | SUCCESS |
| Functional Slice - Digital Claim Intake Web | `34028643890` | SUCCESS |
| API QA | `34028643862` | SUCCESS |
| API Implementation | `34028643919` | SUCCESS |
| OpenAPI Validation | `34028643861` | SUCCESS |
| Postman Contract | `34028643860` | SUCCESS |
| Interface Inventory | `34028643870` | SUCCESS |
| Design System | `34028643867` | SUCCESS |

The tracking workflow proves two independent layers:

1. `web-contract`: locked install, executable slice-contract validation, TypeScript typecheck, web tests and production Vite build.
2. `real-api-integration`: PostgreSQL 18 + simulated legacy HTTP dependency + production NestJS composition + actual web Axios client, including synthetic claim creation, successful `trackClaim`, customer-safe projection assertions, invalid proof collapse to `404 CLAIM_NOT_FOUND`, request-id observation and explicit canonical refresh.

## Review-state exact-head revalidation

After registering the slice Definition of Done as evidenced, reconciling `.blueprint/status.yaml` to `READY_FOR_REVIEW`, and removing the one-time status reconciler from the candidate diff, exact review-state head `94812fb26e07d08c3895e20abf2a704bad2ff688` passed all nine applicable workflows:

| Workflow | Run | Result |
|---|---:|---|
| Functional Slice - Customer Claim Tracking Web | `34028824999` | SUCCESS |
| Functional Slice - Digital Claim Intake Web | `34028825131` | SUCCESS |
| API QA | `34028825073` | SUCCESS |
| API Implementation | `34028825137` | SUCCESS |
| OpenAPI Validation | `34028825121` | SUCCESS |
| Postman Contract | `34028825044` | SUCCESS |
| Interface Inventory | `34028825041` | SUCCESS |
| Design System | `34028825068` | SUCCESS |
| Client Architecture | `34028825004` | SUCCESS |

This second layer is significant because the status reconciliation itself triggers the path-filtered Client Architecture workflow. Therefore the review-state candidate revalidates the approved client architecture binding in addition to functional, API, contract, inventory and design-system regressions. The temporary reconciliation workflow was deleted before this nine-workflow candidate was evaluated and is not part of the proposed review artifact.

## Privacy and sensitive-state boundary

The proof pair `trackingCode + policyReference` is retained only in the React tracking context needed for the current lookup/explicit refresh. The implementation and validator reject `localStorage`, `sessionStorage` and `IndexedDB` use for this slice.

Invalid proof is deliberately collapsed to the same `404 CLAIM_NOT_FOUND` presentation. UI copy explicitly states that the application does not reveal which of the two proof values failed. The customer status page renders only the approved customer-safe projection and contains no audit event, operator note or backoffice/internal field binding.

## Initial validator false negative

Initial workflow run `34027816748` correctly blocked the candidate because the contract validator required the exact text token `no indicamos cuál`, while the implemented approved copy states `Nunca indicamos cuál de los dos datos no coincidió.` The real API integration job in that same run passed.

The validator was corrected to assert the stable privacy meaning `indicamos cuál de los dos datos` rather than one grammatical prefix. No privacy requirement, API behavior, error state or UI protection was weakened. The subsequent exact implementation head `1257de1f...` passed both tracking jobs and all triggered regressions.

## Gate proposal

All canonical required checks for `functional_slice_ready` are evidenced for `customer-claim-tracking / web`; idempotency is explicitly not applicable to the approved read-only operation.

Proposed gate result: **`READY_FOR_REVIEW`**.

The slice lifecycle remains **`IN_PROGRESS`** until explicit human gate approval. Only a subsequent human-approved `PASS` may authorize lifecycle state `FUNCTIONAL`. Merge authorization remains a separate human decision.
