# R3 Web Productization - Increment 04

## Increment

**Name:** Renewals Operations  
**Baseline:** `355060066fb7bf81a9ba4aad594b9074fd969292`  
**Blueprint consumer baseline:** `0.5.2`  
**API contract:** frozen R3  
**Status:** `IMPLEMENTED_PENDING_EXACT_HEAD_CI_AND_HUMAN_REVIEW`

## Why Renewals is Increment 04

After Customer & Policy 360, three operator-facing candidates were reviewed: Communications, Renewals and Collections.

Communications was intentionally not selected despite having operator read/send endpoints. Sending requires an active `templateVersionId`, while active template discovery is exposed only through admin endpoints guarded by `communications.admin`. Claims Operator/Supervisor have `communications.read` and `communications.send`, not `communications.admin`. A UI that asks operators to paste opaque template-version UUIDs would satisfy transport syntax but fail product usability and truthfulness.

Renewals is complete at the frozen R3 boundary: list, detail, lifecycle transition and operational pipeline movement are all available to the same operator/supervisor roles. The detail projection already returns customer, policy, allowed lifecycle transitions, current pipeline stage, allowed next stage keys and both lifecycle/pipeline versions.

## Implemented product surfaces

### Renewal workspace

Route: `/operator/renewals`

- server-authoritative pagination;
- no simulated search/status filters because the list endpoint does not publish them;
- customer and policy summary context;
- lifecycle state;
- current operational stage;
- lifecycle and pipeline versions;
- direct route to Renewal Detail.

### Renewal detail

Route: `/operator/renewals/:renewalId`

- Customer 360 and Policy 360 links;
- lifecycle state, timestamps and lifecycle version;
- terminal transitions limited to the server-provided `allowedTransitions` set;
- pipeline current stage from the pinned version;
- operational moves limited to server-provided `allowedNextStageKeys`;
- pipeline work-item `expectedVersion` used for every stage movement;
- lifecycle `expectedVersion` used for every terminal transition;
- 409 conflicts trigger a refetch instead of a blind retry;
- terminal lifecycle states are rendered read-only.

## Access model

Existing presentation grants are preserved:

- `CLAIMS_OPERATOR`: `renewals.read`, `renewals.manage`;
- `CLAIMS_SUPERVISOR`: `renewals.read`, `renewals.manage`;
- `PLATFORM_ADMIN`: neither permission.

New deep links remain permission-aware and Platform Admin is not elevated into business operations.

## Contract fidelity

The web does not add:

- renewal search/status filters absent from the API;
- extra renewal states beyond `OPEN`, `COMPLETED`, `CANCELLED`;
- invented pipeline stage graphs;
- automatic transitions inferred from policy/customer state;
- hidden retries on optimistic-concurrency conflicts.

Lifecycle and pipeline remain separate state machines.

## Files

Expected increment files include:

- typed Renewals client + types + tests;
- Renewal list and detail pages;
- route, navigation, access/deep-link and workspace updates;
- responsive Renewals styling;
- living productization inventory update;
- this increment record.

## Governance

- GREENFIELD with legacy coexistence SIMULATED;
- no Blueprint Master changes;
- no frozen R3 API changes;
- no historical readiness/VFR evidence rewritten;
- synthetic/demo data only;
- exact-head CI required before merge;
- explicit human merge approval required.

Expected historical readiness/VFR sentinels may remain red after legitimate post-closure product drift and must not be bypassed by rewriting old evidence.
