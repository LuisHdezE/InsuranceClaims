# API Implementation R3 — Increment 02: Staff Identity & RBAC Foundation

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `3f9d577453e5ed86e7c8f19456780164e5dbf51e`  
**Verified implementation SHA:** `05764c5967c4fcc1f5cb48e2f708a13baf1b8dcf`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. Todos los datos de negocio son sintéticos/demo.

## 1. Increment boundary

This increment implements the approved R3 staff identity/RBAC foundation only. It does not implement Customer Portal identity, Integration HMAC, Pipeline, Communications, Automation, Imports, Renewals, Collections, Custom Fields, Bulk or Dead-letter endpoints.

Implemented scope:

- staff roles `CLAIMS_OPERATOR`, `CLAIMS_SUPERVISOR`, `PLATFORM_ADMIN`;
- explicit Application permission matrix frozen by API Contract R3;
- historical `authenticateOperator` accepting all approved staff roles without changing its route/request intent;
- staff JWT context isolation with `context=staff`, issuer and audience validation;
- 900-second staff access-token behavior retained;
- ClaimTask authorization switched from the temporary historical compatibility bridge to `claims.tasks.read` / `claims.tasks.manage`;
- role-aware staff provenance for Claim status history, ClaimTask history and existing auth/Claim-transition audit events;
- PostgreSQL/Prisma role and actor-type persistence expansion;
- reversible migration guarded against destructive rollback when Supervisor/Admin data exists.

## 2. Least-privilege behavior

`CLAIMS_OPERATOR` receives approved normal Claims/Tasks/Pipeline/Communication/Customer/Policy/Renewal/Collection operational grants.

`CLAIMS_SUPERVISOR` receives Operator grants plus `claims.analytics.read` and `bulk.execute`.

`PLATFORM_ADMIN` receives the approved configuration/import/operations-support grants plus analytics. It intentionally does **not** receive `claims.backoffice.read`, `claims.backoffice.transition`, `claims.tasks.read` or `claims.tasks.manage` merely because it is an administrator.

This preserves the R3 rule that an admin route/role never creates an implicit Claim-lifecycle superuser bypass.

## 3. JWT boundary

The staff JWT adapter now requires all of the following during verification:

- valid HS256 signature;
- configured staff issuer;
- configured staff audience;
- `context = staff`;
- one approved staff role;
- subject and login claims.

Runtime configuration uses `STAFF_JWT_SECRET`, `STAFF_JWT_ISSUER` and `STAFF_JWT_AUDIENCE`. `JWT_SECRET` remains accepted only as a transitional internal alias for the staff secret so existing local/QA composition is not broken by this implementation increment. This alias is not part of the public HTTP contract.

Customer JWT support remains outside this increment and will use a separate adapter/configuration as required by the approved R3 architecture.

## 4. WorkManagement compatibility debt closed

Increment 01 intentionally used the historical Claims permissions as a temporary compatibility proof because staff RBAC had not yet landed.

This increment removes that bridge. ClaimTask operations now authorize against the frozen R3 permissions directly:

- reads: `claims.tasks.read`;
- mutations: `claims.tasks.manage`.

No ClaimTask endpoint identity or request contract is changed by this increment.

## 5. Data migration

`20260908_02_staff_identity_rbac.sql` expands:

- `operators.role` to the three approved staff roles;
- Claim status-history staff actor types to Operator/Supervisor/Administrator;
- audit-event staff actor types to Operator/Supervisor/Administrator.

Rollback first checks for any persisted Supervisor/Admin identity or provenance and aborts rather than silently coercing or deleting that history.

## 6. Exact-head machine verification

The implementation SHA `05764c5967c4fcc1f5cb48e2f708a13baf1b8dcf` was verified by GitHub Actions against the PR exact head.

Core R3 implementation evidence:

| Workflow | Run | Result | Evidence |
|---|---:|---|---|
| API Implementation | `34246609290` | PASS | locked dependency install, Prisma 8 contract emit, TypeScript typecheck, full backend tests, architecture conformance and production build |
| API QA | `34246609230` | PASS | ephemeral PostgreSQL, synthetic QA secrets, schema bootstrap, operator seed, simulated legacy/API startup, positive/negative/contract/security runtime QA, durable audit/persistence assertions and production dependency classification |
| Integration QA - Web Slices | `34246609271` | PASS | backend/web integration revalidation against real API/dependencies and existing web slices |
| Release Gate Evidence | `34246609281` | PASS | inherited release-evidence verification remains intact |

Additional exact-head PASS workflows:

- `Interface Inventory` — run `34246609360`;
- `Postman Contract` — run `34246609224`;
- `Design System` — run `34246609231`;
- `OpenAPI Validation` — run `34246609399`;
- `OpenAPI Post-MVP R2` — run `34246609157`;
- `Operations Observability Evidence` — run `34246609163`;
- `Functional Slice - Digital Claim Intake Web` — run `34246609172`;
- `Functional Slice - Customer Claim Tracking Web` — run `34246609342`;
- `Functional Slice - Claims Backoffice Web` — run `34246609318`.

The only red workflows are the three known inherited historical locks and are not regressions from this increment:

- `Operations State` — run `34246609255` — expected FAIL because the inherited release snapshot is frozen;
- `Visual Functional Review Ready - Web` — run `34246609304` — expected FAIL under the frozen historical diff-policy;
- `Release Gate Ready State` — run `34246609164` — expected FAIL because the historical accepted state intentionally remains not release-ready for this new increment.

No unexplained failure remained on the verified implementation SHA.

## 7. Contract and governance integrity

The PR contains no file under `documentation/api/r3/**`. Therefore the frozen API Contract R3 source is not modified and the contract-only diff guard is not triggered by this implementation evidence.

The increment also leaves unchanged:

- historical `api-v1-r1` / `api-v1-r2` contracts and evidence;
- approved API Contract R3 and `API-IMPACT-002`;
- accepted v0.1.0/v0.2.0 evidence;
- published `v0.2.0` tag/release;
- Blueprint Master.

The implementation preserves Clean Architecture + Ports & Adapters: permission decisions remain in Application, JWT details remain Infrastructure, NestJS remains a Presentation adapter, and PostgreSQL/Prisma remain Infrastructure persistence concerns.

## 8. Verification conclusion

Machine verification proves:

1. Prisma contract generation succeeds;
2. production TypeScript typecheck succeeds;
3. the full backend test suite succeeds;
4. architecture conformance succeeds;
5. production build succeeds;
6. runtime API QA succeeds against ephemeral PostgreSQL and the simulated legacy boundary;
7. historical Claims/Task behavior remains compatible;
8. Supervisor can use the approved Claims/Tasks permissions;
9. Platform Admin does not acquire implicit Claim/Task lifecycle authority;
10. staff JWT issuer/audience isolation is enforced;
11. the approved R3 contract remains outside the implementation diff.

## 9. Human gate

This increment is now `IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`.

Machine success does not authorize merge, release, tagging or modification of Blueprint Master. Merge requires a separate explicit decision from Luis.
