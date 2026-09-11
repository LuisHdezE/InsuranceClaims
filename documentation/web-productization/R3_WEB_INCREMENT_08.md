# R3 Web Productization - Increment 08

## Slice

**Recovery Operations**

This increment productizes the frozen R3 recovery/diagnostic contract without changing the API or Blueprint baseline.

## Baseline

- Blueprint consumer baseline: `0.5.2`
- InsuranceClaims base before implementation: `bf4193a12bd646c375d4ed237332e52ac741dd80`
- delivery mode: GREENFIELD with SIMULATED legacy coexistence
- data: synthetic/demo only

## Product surfaces

### `/operator/admin/recovery`

Recovery Console combines the two related read surfaces that R3 actually publishes:

1. **Dead-letter queue**
   - server pagination only;
   - job type;
   - attempt/max-attempt counts;
   - failure category;
   - available timestamp;
   - authoritative version;
   - deep link to detail.

2. **Integration Event diagnostics**
   - explicit `eventId` UUID lookup only;
   - event type and external event ID;
   - ingestion and processing status;
   - accepted/processed timestamps;
   - failure category.

R3 exposes no Integration Event directory, so the UI does not invent listing/search semantics.

### `/operator/admin/recovery/dead-letters/:deadLetterId`

Dead-letter detail shows only fields published by the R3 projection and exposes two management outcomes when the caller owns `operations.dead_letters.manage`:

- requeue for a new attempt;
- resolve administratively.

Both send the projection `version` as `expectedVersion`.

## Access boundary

- Recovery Console: `operations.integration.read` + `operations.dead_letters.read`
- Dead-letter Detail: `operations.dead_letters.read`
- requeue/resolve controls: `operations.dead_letters.manage`
- Platform Admin owns all three permissions in the current R3 role model.
- Claims Operator and Claims Supervisor do not gain recovery/admin access.
- Platform Admin still does not inherit Claims, Customer, Policy, Renewal or Collection business-operation permissions.

## Concurrency and state

- a 409 on requeue/resolve refetches authoritative detail;
- no mutation is blindly retried;
- successful mutation returns to Recovery Console because the record can leave dead-letter state and cease to be addressable through the dead-letter detail contract;
- state conflicts and not-found responses remain API-authoritative.

## Contract discipline

The UI does not invent:

- dead-letter filters;
- Integration Event listing/search;
- integration payload visibility;
- worker/lease internals;
- domain meaning for failure categories;
- relationships between correlation IDs and Integration Event IDs;
- proprietary insurer/FAR processes or infrastructure.

## Inventory impact

The living R3 route inventory moves from **31 to 33** route-level interfaces:

- Recovery Console;
- Dead-letter Detail.

Integration Event lookup and dead-letter mutations are embedded capabilities, not artificial extra routes.

The historical 10-interface inventory remains untouched.

## Validation expectations

Before merge the exact PR head must pass the repository's normal web/API/integration QA. Historical readiness/VFR sentinels may remain red due to legitimate post-closure product drift and must not be rewritten to force green status.

## Human gate

Merge requires explicit human approval after exact-head CI and review reconciliation.
