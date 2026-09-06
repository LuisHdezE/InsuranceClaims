# Client Architecture Validation Evidence

Date: 2026-09-06  
Blueprint: 0.5.2  
Mode: GREENFIELD  
Platform: web  
Validated candidate: `a08c9c9438f28c271078b80201e630c785977906`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## Result

**PASS** for the Client Architecture evidence candidate. This is technical evidence only. It does not grant human gate approval and does not authorize merge.

The canonical effective architecture is composed from one reusable platform baseline plus three slice bindings:

- `CLIENT-BASELINE-WEB-INSURANCE-CLAIMS`
- `CLIENT-WEB-DIGITAL-CLAIM-INTAKE`
- `CLIENT-WEB-CUSTOMER-CLAIM-TRACKING`
- `CLIENT-WEB-CLAIMS-BACKOFFICE`

## Exact-head CI

All workflows associated with candidate `a08c9c9438f28c271078b80201e630c785977906` completed successfully:

- Client Architecture run `34010167796` — **SUCCESS**
- Design System run `34010167779` — **SUCCESS**
- Interface Inventory run `34010167785` — **SUCCESS**
- API QA run `34010167778` — **SUCCESS**
- API Implementation run `34010167793` — **SUCCESS**
- OpenAPI Validation run `34010167799` — **SUCCESS**
- Postman Contract run `34010167783` — **SUCCESS**

## Semantic validation proven

The permanent validator `scripts/validate-client-architecture.mjs` proves:

1. the platform baseline is Greenfield/web and follows the project’s approved React boundary;
2. Design System and token paths resolve to the approved FAR-aligned artifacts;
3. the FAR logo asset referenced by the Design System exists;
4. `WEB-001` remains shared and is not smuggled into a fourth slice;
5. the approved WEB-001 landing reference remains documented without becoming functional scope authority;
6. the three bindings cover exactly WEB-002 through WEB-010;
7. each bound inventory item belongs to its declared slice and to the web namespace;
8. route sets equal executable-inventory route sets for each slice;
9. permission sets equal executable-inventory permission sets for each slice;
10. operationId sets equal executable-inventory API dependencies/actions for each slice;
11. every bound operationId exists in current `openapi.yaml`;
12. all bindings identify API revision `api-v1-r1`;
13. `createClaim` is the only operation requiring client Idempotency-Key handling;
14. backoffice transition concurrency retains `expectedFromStatus`, with no invented second idempotency protocol;
15. async/error states required by each executable inventory slice are present in its binding;
16. degraded offline handling is explicit for every slice and queues no authoritative writes;
17. bearer JWT is memory-only with refresh disabled and refresh storage N/A;
18. API authorization remains authoritative and all no-new-behavior/no-hardcoded-data guardrails remain true;
19. WCAG 2.2 AA and minimum 44px touch target remain platform requirements;
20. no Brownfield client coexistence metadata is introduced.

## Canonical check disposition

All 15 required Client Architecture checks are supported by the composed artifacts and the semantic validator:

| Check | Result | Evidence |
|---|---|---|
| `client.architecture_contract` | PASS | platform baseline + 3 bindings |
| `client.visual_contract_binding` | PASS | Design System/tokens paths + WEB-001 approved reference policy |
| `client.auth_lifecycle` | PASS | memory-only JWT, no refresh, local logout |
| `client.api_client_strategy` | PASS | OpenAPI-bound REST strategy; Axios documented as transport adapter |
| `client.api_contract_binding` | PASS | exact `api-v1-r1` operationIds per slice |
| `client.authorization_presentation` | PASS | UI presentation non-authoritative; API authoritative |
| `client.routing_navigation` | PASS | exact executable-inventory route reconciliation |
| `client.state_cache_strategy` | PASS | TanStack Query + ephemeral UI state + explicit invalidation |
| `client.forms_validation` | PASS | React Hook Form/Zod feedback with server authority preserved |
| `client.async_error_offline` | PASS | required slice states + degraded offline/no queued writes |
| `client.idempotency_strategy` | PASS | `createClaim` only; transition keeps `expectedFromStatus` |
| `client.observability_correlation` | PASS | `X-Request-Id`, sanitized diagnostics, secret redaction |
| `client.accessibility` | PASS | WCAG 2.2 AA, keyboard/semantic/focus/live-region/44px contract |
| `client.testing_strategy` | PASS | unit + component/UI + integration + E2E mandatory |
| `client.platform_contract` | PASS | React SPA/Router/TanStack Query/React Hook Form/Vite baseline |

`client.brownfield_coexistence` is **N/A** because the project delivery mode is GREENFIELD. The SIMULATED LEGACY SYSTEM is a server-side HTTP dependency behind Infrastructure and is not an existing client that must coexist/cut over.

## Scoped gate candidates

The evidence supports `READY_FOR_REVIEW`, independently, for:

- `client_architecture_ready` / `digital-claim-intake` / `web`
- `client_architecture_ready` / `customer-claim-tracking` / `web`
- `client_architecture_ready` / `claims-backoffice` / `web`

No PASS is inferred. Explicit human approval is still required for each scoped gate. A single aggregate human decision may name and approve all three exact scopes, but each scope remains recorded independently.

## Non-goals of this boundary

This PR does **not**:

- create `apps/web` React implementation;
- implement any Functional Interface Slice;
- add API endpoints;
- modify API authorization/business rules;
- add a refresh-token flow;
- make static mockups mandatory;
- claim access to FAR internal systems or architecture.
