# Interface Inventory — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05  
Blueprint: 0.5.2  
Mode: GREENFIELD  
Maturity: EXECUTABLE_INVENTORY  
Boundary: `interface_inventory`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Purpose

This boundary reconciles the approved 10-interface Scope Baseline against the authoritative API baseline after `api_gate = PASS`.

The machine-readable executable inventory is:

`.blueprint/ui/interface-inventory.json`

The inventory does not implement React screens. It commits the exact executable backlog that Design System, Client Architecture and Functional Interface Slices must consume.

## 2. Canonical Blueprint obligations

The project has `capabilities.web = true` and `capabilities.android = false`. Therefore the applicable Interface Inventory checks are:

- `ui.web_inventory`
- `ui.inventory_scope_complete`
- `ui.inventory_traceability`
- `ui.inventory_requirement_links`
- `ui.inventory_permission_links`
- `ui.inventory_operation_links`
- `ui.inventory_dependencies`
- `ui.inventory_slice_backlog`

`ui.android_inventory` is not applicable. `ui.brownfield_observed_proposed_separation` is not applicable because this consumer is GREENFIELD.

## 3. Scope reconciliation

Approved baseline revision:

`scope-2026-09-05-r1`

Reconciled source:

`.blueprint/ui/interface-scope-baseline.json`

All 10 approved web interfaces remain `COMMITTED`:

1. WEB-001 Case Study Home
2. WEB-002 Verify Policy and Vehicle
3. WEB-003 New Claim Intake
4. WEB-004 Review and Confirm Claim
5. WEB-005 Claim Submitted
6. WEB-006 Track Claim Lookup
7. WEB-007 Claim Status
8. WEB-008 Operator Login
9. WEB-009 Claims List
10. WEB-010 Claim Detail and State Transition

No screen was added, deferred or dropped. No Android/native interface was introduced.

## 4. Authoritative REST operation reconciliation

The executable inventory binds only canonical operation IDs from `documentation/api/API_ENDPOINT_INVENTORY.json`:

| operationId | Bound interface(s) | Purpose |
|---|---|---|
| `verifyPolicyVehicle` | WEB-002, dependency context for WEB-003 | Server-authoritative policy/vehicle verification |
| `createClaim` | WEB-003 dependency, WEB-004 mutation, WEB-005 response | Multipart idempotent claim creation |
| `trackClaim` | WEB-006, WEB-007 | Customer-safe tracking proof and projection |
| `authenticateOperator` | WEB-008 | Short-lived operator JWT issuance |
| `listClaims` | WEB-009 | Protected paginated/status-filtered claim collection |
| `getClaimDetail` | WEB-010 | Protected operator detail/history/evidence metadata |
| `downloadClaimEvidence` | WEB-010 | Protected binary evidence retrieval |
| `transitionClaimStatus` | WEB-010 | Server-authoritative state transition with `expectedFromStatus` |

`getLiveness` and `getReadiness` are operational endpoints and have no web interface.

`MCP:get_claim_status` remains a separate MCP Presentation contract and is not represented as REST or as a web screen.

No pre-validation, logout, refresh-token, allowed-transition, notification, workshop, payment, AI or other endpoint was invented to make the client backlog convenient.

## 5. Permission reconciliation

The inventory preserves the approved permission intents and API permission matrix:

| Interface | Role | Permission(s) |
|---|---|---|
| WEB-001 | guest | none |
| WEB-002..WEB-005 | guest | `claims.intake.create` |
| WEB-006..WEB-007 | guest | `claims.tracking.read` |
| WEB-008 | guest | authentication entry, no permission claim |
| WEB-009 | claims_operator | `claims.backoffice.read` |
| WEB-010 | claims_operator | `claims.backoffice.read`, `claims.backoffice.transition` |

The client may hide or disable controls for presentation, but the API remains authoritative for authentication and authorization.

## 6. Local/static behavior explicitly separated from API behavior

Legitimate behavior with no API operation is marked local/static rather than given a fabricated endpoint:

- WEB-001 disclaimer/case-study content is static approved project content;
- WEB-003 form and evidence staging are local untrusted state until `createClaim` executes;
- WEB-004 review summary is local pending input until submission;
- WEB-006 lookup fields are local untrusted proof until `trackClaim` validates them;
- WEB-009 sign-out clears local bearer/session state because API v1 intentionally has no logout endpoint.

This is intentional compliance with the Blueprint rule that missing authoritative behavior must not be invented.

## 7. Dependency and navigation backlog

Primary dependency chain:

```text
WEB-001
├── WEB-002 -> WEB-003 -> WEB-004 -> WEB-005
├── WEB-006 -> WEB-007
└── WEB-008 -> WEB-009 -> WEB-010
```

Cross-journey navigation remains limited to approved supporting entry points, notably WEB-005 -> WEB-006 and all return-home paths.

Every dependency and destination references another committed inventory item. No client dependency points directly to PostgreSQL or the simulated legacy service.

## 8. Slice backlog

The approved three-slice model is preserved exactly:

### `digital-claim-intake`

WEB-002 -> WEB-003 -> WEB-004 -> WEB-005  
Shared supporting entry: WEB-001

### `customer-claim-tracking`

WEB-006 -> WEB-007  
Shared supporting entries: WEB-001, WEB-005

### `claims-backoffice`

WEB-008 -> WEB-009 -> WEB-010  
Shared supporting entry: WEB-001

WEB-001 remains a shared public entry and does not create a fourth functional slice.

## 9. Interaction-state normalization

The earlier descriptive baseline used human-readable state labels. The executable inventory normalizes them to the canonical Interface Inventory schema vocabulary:

- `default`
- `loading`
- `empty`
- `filtered_empty`
- `success`
- `error`
- `401`
- `403`
- `404`
- `409`
- `422`
- `429`

Normalization does not remove the semantic intent documented in the Scope Baseline. It makes the backlog machine-checkable against the post-API contract.

## 10. Responsive and accessibility obligations

All 10 interfaces retain responsive intent from approximately 360px through desktop. No capability is desktop-only.

Every item carries explicit accessibility obligations including applicable labels, visible focus, semantic status/error feedback, keyboard operation, logical reading order, non-color-only status meaning and accessible evidence/list controls.

Concrete tokens/components remain Design System work. Concrete router/auth/cache/form implementation remains Client Architecture work.

## 11. Automated semantic validation

`scripts/validate-interface-inventory.mjs` verifies:

- exact 10/10 baseline reconciliation;
- no unexpected web/Android scope;
- baseline requirement and permission preservation;
- canonical routes and dependencies;
- canonical operationId references only;
- API-inventory-to-interface operation coverage;
- operation permission alignment;
- no unresolved API needs after API Gate;
- no health/MCP invention as web screens;
- preservation of the approved three-slice backlog.

The permanent PR workflow is `.github/workflows/interface-inventory.yml`.

## 12. Proposed Blueprint disposition

Once exact-head validation and existing regressions pass, the evidence supports:

- `ui.web_inventory = PASS`
- `ui.inventory_scope_complete = PASS`
- `ui.inventory_traceability = PASS`
- `ui.inventory_requirement_links = PASS`
- `ui.inventory_permission_links = PASS`
- `ui.inventory_operation_links = PASS`
- `ui.inventory_dependencies = PASS`
- `ui.inventory_slice_backlog = PASS`
- `ui.android_inventory = N/A`
- `ui.brownfield_observed_proposed_separation = N/A`
- `interface_inventory = READY_FOR_REVIEW`
- `interface_inventory_ready = READY_FOR_REVIEW`

Human gate approval remains required before `interface_inventory_ready` may become PASS. Gate approval does not authorize merge.
