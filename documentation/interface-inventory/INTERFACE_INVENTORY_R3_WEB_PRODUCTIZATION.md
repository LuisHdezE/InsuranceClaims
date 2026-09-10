# Interface Inventory - R3 Web Productization

**Revision:** post-R3 productization, after Increment 03 implementation  
**Historical evidence boundary:** this document does not replace or rewrite the earlier 10-interface MVP inventory.

## Current route-level interfaces

| # | Route | Interface | Access |
|---|---|---|---|
| 1 | `/` | Public Home | Public |
| 2 | `/claims/new/verify` | Policy Verification | Public |
| 3 | `/claims/new` | Claim Intake | Public |
| 4 | `/claims/new/review` | Claim Review | Public |
| 5 | `/claims/new/success` | Claim Submitted | Public |
| 6 | `/claims/track` | Claim Tracking | Public |
| 7 | `/claims/track/status` | Claim Tracking Status | Public |
| 8 | `/operator/login` | Staff Login | Public entry |
| 9 | `/operator/workspace` | Role-aware Staff Workspace | Authenticated staff |
| 10 | `/operator/dashboard` | Claims Operations Dashboard | Claims read + Tasks read |
| 11 | `/operator/claims` | Claims Workspace | Claims read |
| 12 | `/operator/claims/:claimId` | Claim Detail + Pipeline + Claim Tasks | Claims read; mutations permission-gated |
| 13 | `/operator/tasks` | Task Workspace | Tasks read |
| 14 | `/operator/tasks/:taskId` | Task Detail / Management | Tasks read; mutations permission-gated |
| 15 | `/operator/customers` | Customer 360 Directory | Customers read |
| 16 | `/operator/customers/:customerId` | Customer 360 Detail | Customers read |
| 17 | `/operator/policies` | Policy 360 Directory | Policies read |
| 18 | `/operator/policies/:policyId` | Policy 360 Detail | Policies read |
| 19 | `/operator/forbidden` | Staff Permission Boundary | Authenticated staff |

## Embedded product surfaces

Route count is not operation count. The following R3 capabilities are embedded in coherent workspaces rather than inflated into artificial standalone pages:

- canonical Claims operational metrics in Dashboard;
- Claim lifecycle transitions in Claim Detail;
- Pipeline stage movement in Claim Detail;
- Claim Task creation and per-Claim Task list in Claim Detail;
- Task update, completion and cancellation in Task Detail;
- evidence attention and Claim timeline in Claim Detail;
- Customer 360 policy and Claim relationships in Customer Detail;
- Policy 360 customer, asset, metadata and Claim relationships in Policy Detail.

## Customer & Policy 360 boundary

The four Customer/Policy routes are read-only because the frozen R3 API exposes `listCustomers`, `getCustomer`, `listPolicies`, and `getPolicy` only. The web does not invent edit operations or enrich the projection with contact, premium, coverage, address, or other fields absent from the API contract.

## Navigation rule

Navigation remains permission-aware. A route existing in this inventory does not imply every staff role may access it.

Platform Admin is not an implicit Claims, Customer, or Policy superuser.
