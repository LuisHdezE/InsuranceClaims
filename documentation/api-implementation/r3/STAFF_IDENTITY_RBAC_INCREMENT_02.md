# API Implementation R3 — Increment 02: Staff Identity & RBAC Foundation

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `3f9d577453e5ed86e7c8f19456780164e5dbf51e`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_PENDING_MACHINE_VERIFICATION  
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

## 6. Verification targets

Machine verification must prove:

1. locked dependency install and Prisma contract emit;
2. production TypeScript typecheck;
3. full backend test suite;
4. architecture conformance;
5. production build;
6. API runtime QA against ephemeral PostgreSQL;
7. historical Claims/Task behavior remains compatible;
8. Supervisor can use approved Claims/Tasks operations;
9. Platform Admin cannot use Claim/Task lifecycle operations without the explicit permissions it intentionally lacks;
10. staff JWT issuer/audience isolation rejects mismatched tokens;
11. API Contract R3 source files remain unchanged.

## 7. Human gate

Machine success can move this increment only to `IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`.

It does not authorize merge, release, tagging or modification of Blueprint Master. Merge requires a separate explicit decision from Luis.
