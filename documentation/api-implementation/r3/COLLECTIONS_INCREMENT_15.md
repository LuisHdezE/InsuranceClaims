# API Implementation R3 — Increment 15: Collections

**Repository:** `LuisHdezE/InsuranceClaims`  
**Blueprint baseline:** `0.5.2`  
**Delivery mode:** `GREENFIELD` with legacy coexistence `SIMULATED`  
**Classification:** technical synthetic/demo case only, unofficial and unaffiliated

## 1. Frozen scope

This increment implements only Collections behavior supported by the frozen R3 requirements, architecture, data, security, audit, API contract, and endpoint inventory.

It does not infer insurer-specific delinquency definitions, due dates, payment deadlines, premiums, grace periods, settlement rules, internal SLAs, real payment providers, or real insurer infrastructure.

### Contract matrix

| Element | Frozen R3 value |
|---|---|
| Primary FR | `FR-046`, `FR-047` |
| Use case | `UC-R3-011` |
| Aggregate | `CollectionCase` |
| Lifecycle | `OPEN -> COMPLETED | CANCELLED` |
| Read permission | `collections.read` |
| Mutation permission | `collections.manage` |
| Allowed staff roles | `CLAIMS_OPERATOR`, `CLAIMS_SUPERVISOR` |
| Platform Admin implicit access | No |
| Concurrency | `expectedVersion` |
| Payment mutation verification | required server-side |
| HTTP idempotency | none for the five frozen operations |
| Reads | 120/minute/principal |
| Mutations | 60/minute/principal |
| Lifecycle audit | `COLLECTION_CASE_COMPLETED`, `COLLECTION_CASE_CANCELLED` |
| Payment audit | `COLLECTION_PAYMENT_STATE_CHANGED` |
| Pipeline audit | `PIPELINE_STAGE_MOVED` |
| Authority | PostgreSQL |

## 2. Effective API

| operationId | Method | Route | Permission |
|---|---|---|---|
| `listCollectionCases` | GET | `/api/v1/operator/collections` | `collections.read` |
| `getCollectionCase` | GET | `/api/v1/operator/collections/{collectionId}` | `collections.read` |
| `transitionCollectionCase` | POST | `/api/v1/operator/collections/{collectionId}/transitions` | `collections.manage` |
| `moveCollectionOperationalStage` | POST | `/api/v1/operator/collections/{collectionId}/operational-transitions` | `collections.manage` |
| `updateCollectionPaymentState` | PATCH | `/api/v1/operator/collections/{collectionId}/payment-state` | `collections.manage` |

Lifecycle and Pipeline mutations remain separate. Payment-state mutation uses `{ paymentState, expectedVersion }` and is not accepted as authoritative until the server verifier approves the requested value.

## 3. Payment-state verification boundary

R3 explicitly requires server verification and explicitly rejects the idea that an inbound payment-intention event can directly mark authoritative payment state. R3 does not define a universal payment-state vocabulary.

This increment therefore introduces the Application port `CollectionPaymentStateVerifier` and a fail-closed Infrastructure implementation backed by `COLLECTION_PAYMENT_STATE_VALUES_JSON`.

QA uses neutral synthetic values `DEMO_STATE_A` and `DEMO_STATE_B`. These names intentionally carry no insurer/payment semantics.

If no state is configured, payment mutation fails closed. Client input, webhook payloads, or integration events cannot self-authorize a payment-state change.

## 4. Domain and Pipeline separation

`CollectionCase` owns lifecycle and payment-state metadata. The generic `PipelineWorkItem` remains an operational projection for consumer type `COLLECTION`.

Moving a Pipeline stage does not mutate Collection lifecycle, payment state, or Collection version. Lifecycle/payment mutation does not automatically move Pipeline state because no such rule is frozen.

## 5. PostgreSQL and concurrency

`collection_cases` stores customer/policy identifiers, lifecycle status, opaque approved payment-state metadata, timestamps, and optimistic version.

The SQL migration enforces lifecycle values, positive version, terminal timestamp consistency, FK integrity, and indexes. It deliberately does not encode insurer-specific payment values as database constraints.

Lifecycle and payment mutations use conditional `id + expectedVersion` updates. Exactly one affected row is required. Zero rows maps to `RESOURCE_NOT_FOUND` or `RESOURCE_VERSION_CONFLICT` after checking current authority.

The guarded rollback refuses to drop `collection_cases` when durable rows exist.

## 6. Audit and security

Successful Collection lifecycle/payment mutations write state and audit in the same PostgreSQL transaction.

Payment-state audit is emitted only after server verification and a real authoritative change. Rejected/unverified/stale attempts emit no false success audit.

Audit metadata is bounded to operational identifiers, from/to state, version, synthetic classification, and verification-policy identifier. Passwords, JWTs, authorization headers, secrets, raw payloads, raw PII, email and phone are excluded.

`CLAIMS_OPERATOR` and `CLAIMS_SUPERVISOR` use the frozen permissions. `PLATFORM_ADMIN` is not an implicit Collections superuser.

## 7. Capabilities deliberately not invented

- No Collection-specific Worker job or schedule is added because R3 freezes no concrete job type, cadence, deadline, or retry rule.
- No Automation binding is added because R3 freezes no concrete approved Collection automation action.
- No direct integration-event-to-payment-state mutation exists. Incoming payment intention remains untrusted input for a future verified Application flow.
- No Collection communication route/target is invented beyond existing platform capabilities.
- No insurer-specific task type or delinquency workflow is invented.

## 8. Error behavior

Shared Problem Details codes are reused: `AUTHENTICATION_REQUIRED` 401, `FORBIDDEN` 403, `RESOURCE_NOT_FOUND` 404, `RESOURCE_VERSION_CONFLICT` 409, lifecycle/Pipeline transition conflicts 409, `VALIDATION_ERROR` 422, and transport `RATE_LIMITED` 429.

An unapproved or unverifiable payment-state value returns `VALIDATION_ERROR`; no new insurer-specific error vocabulary is fabricated.

## 9. Verification

Domain/Application/API tests cover lifecycle, optimistic concurrency, verified payment-state mutation, fail-closed rejection, least privilege, Customer/Policy context, and Pipeline separation.

PostgreSQL runtime QA seeds only synthetic data and verifies all five frozen routes, durable lifecycle/payment state, audit atomicity, bounded metadata, rejected-payment non-mutation, Pipeline independence, and stale-version behavior.
