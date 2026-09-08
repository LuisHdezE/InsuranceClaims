# Architecture + Security + Data R3 — Human Review Package

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Baseline main SHA:** `303b09c5746dd545586097412b4f42170bd14664`  
**Requirements R3:** APPROVED + MERGED via PR #35  
**Status:** READY_FOR_REVIEW  
**Date:** 2026-09-08

## 1. Purpose

This file is the compact review index for the R3 Architecture/Security/Data gate.

The authoritative detail is in:

1. `documentation/architecture/INSURANCE_OPERATIONS_ARCHITECTURE_R3.md`
2. `documentation/data/DATA_ARCHITECTURE_R3.md`
3. `documentation/security/SECURITY_THREAT_MODEL_R3.md`
4. `documentation/audit/AUDIT_MODEL_R3.md`

Historical Architecture/Data/Security/Audit artifacts remain unchanged and continue to form the baseline.

## 2. Decision summary

| Decision | R3 proposal |
|---|---|
| core architecture | keep Clean Architecture + Ports & Adapters |
| deployment shape | modular monolith; add `apps/worker` for async execution |
| database | PostgreSQL remains modern authority |
| legacy authority | simulated legacy remains authority only for required policy/vehicle eligibility |
| Customer/Policy | PostgreSQL becomes authority for modern operational master/relationships, not legacy eligibility |
| Claim authority | Claim aggregate/lifecycle unchanged |
| Task | ClaimTask becomes expanded aggregate with assignment, due/priority, cancellation, history and concurrency |
| Pipeline | versioned operational projection; never Claim lifecycle authority |
| Pipeline versioning | existing work items pinned to exact version, no silent remap |
| staff auth | short-lived staff JWT, Operator/Supervisor/Admin roles |
| customer auth | separate customer account + separate short-lived JWT context |
| refresh token | still deferred |
| inbound integration | HMAC-SHA256 + timestamp/event identity + replay/idempotency |
| async execution | PostgreSQL outbox/jobs/leases/retry/dead-letter; no Redis/Kafka/RabbitMQ by default |
| processing semantics | at-least-once + idempotent handlers; no exactly-once claim |
| communication providers | simulated/demo adapters first |
| automation | constrained versioned DSL, allowlisted fields/operators/actions, no eval/code/SQL/arbitrary HTTP |
| configuration | immutable activated versions + explicit active pointer + provenance/audit |
| imports | preview/dry-run no mutation; explicit commit; row-partial for independent rows |
| bulk | per-item authorization/validation/concurrency and per-item outcome |
| Renewals/Collections | strong synthetic aggregates + operational Pipeline projections; no invented insurer rules |
| custom fields | governed typed metadata only; cannot override security/domain invariants |
| error family | RFC 9457 retained; R3 stable codes mapped later in API Contract |
| API version | `/api/v1` retained; R3 contract must be impact-classified |
| event sourcing | not used |
| microservices | not introduced without later evidence/need |

## 3. Blueprint `architecture_security_data` checks

Canonical Blueprint 0.5.2 requires the following checks for this phase.

| Check | R3 evidence | Review status |
|---|---|---|
| `architecture.domain_model` | Architecture R3 §§5–6 | READY_FOR_REVIEW |
| `architecture.decision_records` | Architecture R3 §24 | READY_FOR_REVIEW |
| `architecture.security_model` | Security R3 §§2–18 | READY_FOR_REVIEW |
| `architecture.threat_model` | Security R3 §19; applicable | READY_FOR_REVIEW |
| `data.architecture` | Data R3 §§1–10 | READY_FOR_REVIEW |
| `data.schema_migrations` | Data R3 §§11–12 | READY_FOR_REVIEW |
| `data.authoritative_database` | Data R3 §2 | READY_FOR_REVIEW |
| `audit.event_catalog` | Audit R3 §§4–17 | READY_FOR_REVIEW |
| `audit.retention_policy` | Audit R3 §20 | READY_FOR_REVIEW |
| `api.auth_strategy` | Architecture R3 §7 + Security R3 §5 | READY_FOR_REVIEW |
| `api.error_contract` | Architecture R3 §18; RFC 9457 preserved, mapping deferred to API Contract | READY_FOR_REVIEW |
| `api.versioning_policy` | Architecture R3 §19 | READY_FOR_REVIEW |

## 4. Critical invariants being approved

Approval means accepting these architecture constraints for implementation:

1. Claim lifecycle remains server/Domain authoritative.
2. Task completion/cancellation/reassignment never implicitly changes Claim state.
3. Pipeline stage is an operational projection, not Claim/Renewal/Collection domain truth.
4. Customer and staff identity are separate contexts.
5. Automation has no implicit superuser role.
6. Inbound events are untrusted until signature/schema/replay/idempotency validation succeeds.
7. Runtime configuration is versioned, attributable and immutable after activation.
8. PostgreSQL durable jobs/outbox are the R3 async mechanism; Worker handlers assume at-least-once execution and must be idempotent.
9. External communication providers remain simulated in R3.
10. Imports cannot mutate before explicit Commit and use row-partial semantics only for independent rows.
11. Bulk never weakens single-item authorization or domain validation.
12. Customer/Policy modern records do not replace the historical legacy eligibility verification requirement.
13. No external reference insurer rule becomes runtime truth without explicit synthetic/demo provenance and activation.
14. No historical v0.1.0/v0.2.0 evidence or r1/r2 contract is rewritten.

## 5. What approval does NOT authorize

Architecture/Security/Data R3 approval does not authorize:

- endpoint paths;
- `operationId` names;
- concrete request/response schemas;
- API error status/code mapping;
- exact rate limits/batch sizes/webhook header names;
- Prisma/model/migration code;
- NestJS controllers;
- Worker implementation;
- UI implementation;
- merge of the review PR by itself.

Those remain governed by the next gates.

## 6. Next flow after approval and merge

```text
Architecture/Security/Data R3 human approval
  -> separate PR merge approval
  -> verify merged main SHA
  -> API Contract R3 Design
  -> API impact classification
  -> API Contract Ready human approval
  -> OpenAPI R3
  -> implementation + architecture conformance
  -> OpenAPI validation
  -> Postman
  -> API QA
  -> impact-based API Gate/revalidation
```

## 7. Human gate

Machine/document readiness is not approval.

A human approval should explicitly state, for example:

`Apruebo Architecture Security Data Ready R3`

Merge remains a separate explicit decision.