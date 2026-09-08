# API Implementation R3 — Increment 06: Customer 360 + Policy 360

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `076589c38c58d12734fa6fa6241a678455dea4f9`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. Todos los Customers, Policies, assets, identifiers, insurer references and test data in this increment are synthetic/demo.

## 1. Increment boundary

This increment implements the approved R3 CustomerPolicy server boundary immediately after Pipeline Engine/Admin.

Implemented requirements:

- `FR-036` — Customer 360;
- `FR-037` — Policy 360;
- the Customer/Policy reference portion of the approved additive R3 `getClaimDetail` refinement.

Frozen REST operations implemented:

```text
GET /api/v1/operator/customers
GET /api/v1/operator/customers/{customerId}
GET /api/v1/operator/policies
GET /api/v1/operator/policies/{policyId}
```

Permissions remain exactly separated:

- Customer operations require `customers.read`;
- Policy operations require `policies.read`;
- Claims Operator and Claims Supervisor own these operational read grants;
- Platform Administrator does not gain them implicitly.

Explicitly outside this increment:

- Customer Portal authentication/accounts;
- customer self-service routes;
- real PII or real insurer/customer data;
- Communication Hub;
- automatic import/backfill/reconciliation of legacy records;
- changes to legacy policy/vehicle eligibility authority;
- Customer/Policy mutation/admin endpoints not present in the frozen R3 inventory;
- Blueprint Master, tags, releases or publication.

## 2. Authority split

R3 introduces PostgreSQL as authority for the **modern operational Customer/Policy master and relationships**.

That authority is deliberately distinct from historical intake eligibility:

```text
Modern Customer / Policy / PolicyAsset record
                  !=
current policy/vehicle eligibility truth
```

Historical `verifyPolicyVehicle` and public Claim intake continue to use `PolicyVerificationPort` and the SIMULATED LEGACY SYSTEM.

A focused test deliberately creates a modern Policy/asset pair that is not accepted by `MemoryPolicyVerificationAdapter` and proves that the public eligibility use case still returns `POLICY_VEHICLE_NOT_ELIGIBLE`.

## 3. Modern data model

### Customer

Synthetic operational master fields use only the approved R3 data vocabulary:

- internal UUID;
- opaque `customerRef`;
- synthetic `displayName`;
- neutral modern record status `ACTIVE | INACTIVE`;
- timestamps;
- optimistic `version`.

No national ID, address, phone, production email or other real PII is required or introduced.

### Policy

The modern Policy projection contains:

- internal UUID;
- Customer relation;
- modern/synthetic `policyReference`;
- synthetic `legacyPolicyReference` retained for integration context;
- nullable synthetic `insurerReference`;
- neutral modern `recordStatus`;
- bounded JSON operational metadata;
- timestamps/version.

`recordStatus` is not coverage/eligibility status.

### PolicyAsset

Assets contain:

- Policy relation;
- bounded asset type;
- modern/synthetic asset reference;
- synthetic legacy asset reference;
- bounded JSON metadata;
- creation timestamp.

Duplicate modern or legacy asset identity within one Policy is rejected structurally.

## 4. Claim relationship evolution

The accepted historical Claim snapshot fields remain untouched:

- `policyReference`;
- `vehicleReference`;
- verified synthetic customer label;
- tracking/lifecycle/history.

R3 adds nullable modern links:

- `customerId`;
- `policyId`.

The links are nullable so accepted historical Claims remain valid without destructive backfill.

`getClaimDetail` exposes `customerId` and `policyId` additively while preserving the historical policy/vehicle snapshot.

This increment does **not** make public intake depend on the modern master. It does not automatically bind a Claim merely because a text reference looks similar. Exact legacy-reference resolution is available through the CustomerPolicy repository for later reviewed reconciliation/workflows, and returns a context only when the policy/asset match is unambiguous.

## 5. Read projections

The frozen R3 contract names `CustomersPageResponse`, `Customer360Response`, `PoliciesPageResponse` and `Policy360Response` but does not freeze every field in those response shapes in the inventory.

Implementation projections therefore stay strictly inside approved R3 data/relationship vocabulary:

- Customer list: identity/status/version/timestamps + policy/claim counts;
- Customer detail: Customer + related Policies/assets + explicitly linked Claim summaries;
- Policy list: Policy + Customer summary + assets + claim count;
- Policy detail: Policy + Customer + assets + explicitly linked Claim summaries.

These are operational read projections. They do not introduce insurer business rules or infer unsupported Customer facts.

Search is bounded to synthetic display/reference fields and deterministic pagination uses the R3 page-size cap of 100.

## 6. Persistence

Forward-only migration:

`prisma/migrations/20260908_04_customer_policy_360_r3.sql`

adds:

- `customers`;
- `policies`;
- `policy_assets`;
- nullable Claim `customer_id` / `policy_id` foreign keys;
- required uniqueness/checks/indexes.

The QA PostgreSQL bootstrap mirrors the same physical contract.

The rollback is conservative. It refuses to destroy the slice if modern Customer/Policy/Asset data or Claim links exist.

No production/customer data is seeded by the migration.

## 7. Clean Architecture

- Customer/Policy record vocabulary is framework-independent Domain code.
- `CustomerPolicyApplication` owns authorization, validation, pagination and response composition.
- `CustomerPolicyRepository` is the Application port.
- `MemoryCustomerPolicyStore` and `PrismaCustomerPolicyStore` are Infrastructure adapters.
- NestJS `CustomerPolicyController` is an outer REST adapter.
- no Application/Domain code imports Prisma, NestJS or legacy wire DTOs.

Claims and CustomerPolicy remain separate capability boundaries. The relationship is represented by stable IDs rather than direct aggregate mutation.

## 8. Verification targets

Machine verification must prove:

1. Prisma 8 contract emit succeeds with the new schema;
2. migration/bootstrap physical names and types remain compatible;
3. TypeScript passes;
4. backend tests pass;
5. architecture conformance passes;
6. build passes;
7. API QA passes against ephemeral PostgreSQL and simulated legacy;
8. `listCustomers/getCustomer` require staff JWT + `customers.read`;
9. `listPolicies/getPolicy` require staff JWT + `policies.read`;
10. Platform Admin remains forbidden without those operational permissions;
11. Customer/Policy details contain only explicit modern relationships;
12. linked Claim detail exposes nullable modern IDs additively;
13. historical Claims without links remain valid;
14. a modern Policy record does not bypass legacy eligibility verification;
15. missing Customer/Policy resources return safe `RESOURCE_NOT_FOUND`;
16. malformed identifiers/queries use existing RFC 9457 validation behavior;
17. frozen `documentation/api/r3/**` remains unchanged;
18. historical Claim/Task/Pipeline/API behavior does not regress.

## 9. Machine verification evidence

Functional verification head: `59782d6b572ed75183a382fed2a5ef57fe423caa`.

Substantive PASS workflows:

- API Implementation #281 — run `34267597542`;
- API QA #244 — run `34267597559`;
- Integration QA - Web Slices #142 — run `34267597636`;
- OpenAPI Validation #264 — run `34267597548`;
- OpenAPI Post-MVP R2 #39 — run `34267597794`;
- Postman Contract #251 — run `34267597574`;
- Release Gate Evidence #134 — run `34267597462`;
- Operations Observability Evidence #121 — run `34267597527`;
- Interface Inventory #226 — run `34267597717`;
- Design System #221 — run `34267597533`;
- Functional Slice - Claims Backoffice Web #149 — run `34267597531`;
- Functional Slice - Customer Claim Tracking Web #162 — run `34267597602`;
- Functional Slice - Digital Claim Intake Web #194 — run `34267597572`.

Expected historical locks, unchanged:

- Operations State #116 — expected failure;
- Visual Functional Review Ready - Web #122 — expected failure;
- Release Gate Ready State #127 — expected failure.

No fourth/new unexplained red workflow remained.

The first PR head exposed one new TypeScript-only defect after Prisma emit succeeded: four Prisma-adapter `sort()` comparators inherited implicit `any` parameters from ORM rows under strict TypeScript. The fix added explicit projection types to those comparator parameters. No business behavior, validation, schema or authorization rule was changed.

API Implementation #281 then passed Prisma emit, TypeScript, backend tests, architecture conformance and build. API QA #244 passed the PostgreSQL bootstrap, simulated legacy/API runtime, security/contract QA and durable persistence checks. Integration QA #142 passed backend/web typecheck/tests/build, PostgreSQL/runtime boot, security/concurrency/rate-limit QA, durable audit checks, real web API clients and browser responsive/accessibility/degraded journeys.

## 10. Governance

No changes are made to:

- `documentation/api/r3/**`;
- `.blueprint/api-impact/API-IMPACT-002.json`;
- Blueprint Master;
- accepted R1/R2 evidence;
- immutable `v0.2.0` tag/release.

Machine success moves this increment only to:

`IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`

It does not authorize merge, tag, release or publication. Merge requires a separate explicit human approval from Luis.
