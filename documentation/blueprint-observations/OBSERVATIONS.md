# Blueprint Observations

This file records Blueprint findings discovered while delivering this consumer project. Findings are deliberately deferred until the MVP reaches Release Gate.

---

## OBS-001

Blueprint version:
0.5.2

Phase:
Bootstrap / Discovery

Finding:
The materialized skill catalog has generic API/OpenAPI/testing skills, but its backend profile is declared with `conditional_on.backend: laravel`. This Node.js + TypeScript consumer therefore has no explicitly materialized Node/NestJS backend setup/security skill profile in Blueprint 0.5.2.

Evidence:
`LuisHdezE/SoftwareDevelopmentBlueprint/catalog/skills.yaml` at Blueprint main `737556e24195aa909117790f2d7ff0be2fe0a474`.

Impact:
LOW

Potential improvement:
After the MVP, evaluate whether the backend profile should be framework-agnostic or whether a dedicated Node.js/TypeScript materialized skill set is justified by repeated consumers.

Disposition:
DEFERRED_UNTIL_MVP_COMPLETE

---

## OBS-002

Blueprint version:
0.5.2

Phase:
Bootstrap / Discovery

Finding:
The canonical Git workflow starts from a verified base branch, but a brand-new empty GitHub repository has no commit or `refs/heads/main`, so a short-lived branch cannot be created until an initial repository seed commit establishes the base branch.

Evidence:
`LuisHdezE/InsuranceClaims` returned `409 Git Repository is empty` for `refs/heads/main`. A minimal README seed commit `cdf8e1fc21893ab60959d901720dd9ec4237e29b` was required before creating `blueprint/bootstrap-discovery` from that exact SHA.

Impact:
LOW

Potential improvement:
Document an explicit empty-repository bootstrap exception that permits one minimal seed commit before normal `verified main -> short-lived branch -> PR` governance begins.

Disposition:
DEFERRED_UNTIL_MVP_COMPLETE

---

## OBS-003

Blueprint version:
0.5.2

Phase:
Interface Scope Baseline

Finding:
Blueprint 0.5.2 provides the canonical `templates/interface-scope-baseline.example.json` and the `interface_scope_ready` gate/check contracts, but there is no corresponding `schemas/interface-scope-baseline.schema.json` in the pinned release tree. The artifact can therefore follow the official template and gate semantics, but it has no dedicated JSON Schema for automatic structural validation.

Evidence:
At Blueprint commit `737556e24195aa909117790f2d7ff0be2fe0a474`, the repository tree contains `templates/interface-scope-baseline.example.json` while the `schemas/` directory contains schemas such as `interface-inventory.schema.json` but no interface-scope-baseline schema.

Impact:
LOW

Potential improvement:
After the MVP, evaluate adding a versioned Interface Scope Baseline JSON Schema and wiring it into the relevant validation workflow, while preserving the descriptive/pre-API nature of the artifact.

Disposition:
DEFERRED_UNTIL_MVP_COMPLETE

---

## OBS-004

Blueprint version:
0.5.2

Phase:
API Contract Design

Finding:
Blueprint 0.5.2 defines a strong `api_contract_ready` gate with seven required contract checks and a materialized `dev-api-design` skill, but the pinned release does not provide a dedicated initial API endpoint-inventory/API-contract JSON Schema or example template. The only API-specific schema/template in this area is for post-baseline `api-impact`, while OpenAPI is intentionally validated in a later phase.

Evidence:
At Blueprint commit `737556e24195aa909117790f2d7ff0be2fe0a474`:

- `catalog/checks.yaml` requires `api.scope_defined`, `api.endpoint_inventory`, `api.auth_contract`, `api.permission_matrix`, `api.audit_event_mapping`, `api.idempotency_matrix` and `api.contract_traceability`;
- `catalog/gates.yaml` binds those checks to `api_contract_ready`;
- `templates/` contains `api-impact.example.json` but no initial API-contract/endpoint-inventory template;
- `schemas/` contains `api-impact.schema.json` but no initial API-contract/endpoint-inventory schema.

Impact:
LOW

Consumer handling:
This project uses `documentation/api/API_CONTRACT.md` as the human-authoritative contract and `documentation/api/API_ENDPOINT_INVENTORY.json` as a machine-readable evidence artifact. Later OpenAPI must formalize the same approved contract rather than redesign it.

Potential improvement:
After the MVP, evaluate whether Blueprint should define a technology-neutral schema/template for the pre-implementation API contract inventory, while keeping OpenAPI as the later canonical executable HTTP contract.

Disposition:
DEFERRED_UNTIL_MVP_COMPLETE

---

## OBS-005

Blueprint version:
0.5.2

Phase:
Post-MVP / closed-lifecycle maintenance

Finding:
The consumer-local final lifecycle validators correctly freeze product/API drift after the approved baselines, but their original allowlists had no explicit category for post-MVP non-product portfolio or governance documentation. This caused Portfolio Hardening documentation to be classified as product drift even though no application, package, API contract or runtime file changed.

Evidence:
PR #22 candidate `d740e16675b531ca15532b40def4bd986833d919` failed Operations State workflow run `34127897527` with `product/API drift detected after Release Gate merge: README.md`. After narrowly reconciling the Operations guard, candidate `6d816b9bffd7010a96a6f177469c0d010735183a` passed Operations State but Release Gate Ready State run `34128185845` then failed with `non-release/product drift detected since accepted baseline: documentation/blueprint-observations/OBSERVATIONS.md`. Both failures originated in consumer-local post-baseline path allowlists rather than product behavior.

Impact:
LOW

Consumer handling:
Keep all lifecycle drift guards fail-closed for product/runtime/API paths while narrowly allowing `README.md`, `documentation/portfolio/**` and `documentation/blueprint-observations/**` only as appropriate after Release Gate and Operations are already complete. The Release Gate guard permits the new documentation prefixes only when both lifecycle states are closed.

Potential improvement:
When this observation is evaluated after portfolio closure, consider whether Blueprint guidance or consumer validator templates should distinguish product/API/runtime drift from post-lifecycle documentation maintenance so that lifecycle closure remains strict without freezing portfolio and governance documentation.

Disposition:
DEFERRED_UNTIL_PORTFOLIO_COMPLETE

---

## OBS-006

Blueprint version:
0.5.2

Phase:
Post-MVP / product evolution

Finding:
Blueprint 0.5.2 explicitly defines impact-based revalidation for later API evolution through the `api-impact` artifact, but this consumer could not identify an equivalent generic or client-specific impact artifact for post-Release-Gate visual/client product evolution. The consumer-local Release Gate and Operations validators therefore correctly detect the landing redesign in PR #24 as product drift from the accepted v0.1.0 baselines, while client/browser validators remain bound to the previously accepted logo asset. This creates no ambiguity about the historical MVP, but it leaves the next governed client increment without a canonical machine-readable impact/revalidation boundary comparable to API evolution.

Evidence:
At Blueprint main `737556e24195aa909117790f2d7ff0be2fe0a474`, `BLUEPRINT.md` documents later API evolution via impact-based revalidation and `schemas/` contains `api-impact.schema.json`; the inspected schema catalog has no corresponding `client-impact`, `ui-impact` or generic post-release increment-impact schema. On InsuranceClaims PR #24 head `5c39a796020dbe02c6f3d2dd9258ccc3d10cd6cc`, backend/web tests, architecture, builds, runtime API QA and all three real-dependency web API client journeys pass, while Release Gate/Operations reject `.blueprint/ui/assets/far-demo-wordmark-v2.svg` as post-baseline product drift and browser/client validators still expect the previously accepted public logo binding.

Impact:
MEDIUM

Consumer handling:
Do not weaken or rewrite the historical v0.1.0 Release Gate/Operations evidence. Treat the landing redesign and Claims Operations work as an explicit post-MVP product increment, preserve the old acceptance history, record fresh increment-specific scope/visual/functional evidence, and require human approval before implementation/merge. Do not modify Blueprint Master during this consumer project.

Potential improvement:
After this consumer increment is complete, evaluate a technology-neutral post-release product/client impact contract that can classify affected interfaces, design-system assets, functional slices and required revalidation without globally invalidating unrelated historical evidence. The mechanism should remain fail-closed for unclassified product drift and should complement, not replace, `api-impact` for API contract changes.

Disposition:
DEFERRED_UNTIL_POST_MVP_INCREMENT_COMPLETE
