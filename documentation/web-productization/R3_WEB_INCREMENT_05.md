# Web R3 Productization — Increment 05: Collections Operations

**Repository:** `LuisHdezE/InsuranceClaims`  
**Blueprint baseline:** `0.5.2`  
**Delivery mode:** `GREENFIELD` with legacy coexistence `SIMULATED`  
**Classification:** technical synthetic/demo case only, unofficial and unaffiliated

## Goal

Productize the frozen R3 Collections vertical without inventing financial semantics, payment-state vocabularies, filters, insurer workflows, or new API operations.

## Productized operations

- `listCollectionCases`
- `getCollectionCase`
- `transitionCollectionCase`
- `moveCollectionOperationalStage`
- `updateCollectionPaymentState`

## Route-level interfaces

- `/operator/collections`
- `/operator/collections/:collectionId`

The living productization inventory therefore grows from 21 to 23 route-level interfaces. Historical 10-interface evidence remains untouched.

## Collections list

The list uses the server pagination contract only. R3 does not publish Collection search, lifecycle, payment-state, stage or sorting filters, so the web does not simulate global filtering.

Each row presents only projection data returned by R3: Customer/Policy context, Collection lifecycle, current opaque payment-state value, operational stage, Collection version and pipeline work-item version.

## Collection detail

The detail intentionally separates three concepts:

1. **Lifecycle** — `OPEN -> COMPLETED | CANCELLED`, governed by Collection `version` and server `allowedTransitions`.
2. **Payment state** — opaque approved metadata governed by the same Collection `version`, but accepted only after server verification.
3. **Operational pipeline** — governed by the independent pipeline work-item `version` and server `allowedNextStageKeys`.

A successful mutation invalidates both detail and list projections. A `409` refetches authority instead of blind retry.

## Payment-state boundary

Frozen R3 explicitly defines no universal payment-state vocabulary. Infrastructure verifies requested values against the server-configured allowlist (`COLLECTION_PAYMENT_STATE_VALUES_JSON`) and fails closed when a value is not approved.

The UI therefore:

- does not invent `PAID`, `OVERDUE`, `PARTIAL`, or any other insurer/payment semantics;
- does not hardcode the synthetic QA values `DEMO_STATE_A` / `DEMO_STATE_B`;
- does not present a fake dropdown;
- accepts a bounded code of at most 80 characters, clearly labeled as a server-configured value;
- relies on the API's verification and Problem Details response as authority;
- keeps the currently approved value visible without reinterpreting it.

## Access

Claims Operator and Claims Supervisor retain `collections.read` / `collections.manage`. Platform Admin remains outside Collections business operations and is not granted implicit access.

## Non-goals

- no API/OpenAPI mutation;
- no payment provider or transaction integration;
- no due dates, premiums, balances, delinquency rules or settlement semantics;
- no Collection-specific jobs, automations, communications or tasks;
- no historical evidence rewrite;
- no Blueprint Master change.
