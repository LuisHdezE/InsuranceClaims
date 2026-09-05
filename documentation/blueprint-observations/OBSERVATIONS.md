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
