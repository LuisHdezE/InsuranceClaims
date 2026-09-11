# Interface Inventory - R3 Web Productization

**Revision:** post-R3 productization, after Increment 08 implementation  
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
| 19 | `/operator/renewals` | Renewal Operations Workspace | Renewals read |
| 20 | `/operator/renewals/:renewalId` | Renewal Detail + Lifecycle + Pipeline | Renewals read; mutations permission-gated |
| 21 | `/operator/collections` | Collections Operations Workspace | Collections read |
| 22 | `/operator/collections/:collectionId` | Collection Detail + Lifecycle + Payment + Pipeline | Collections read; mutations permission-gated |
| 23 | `/operator/admin/pipelines` | Pipeline Administration Directory | Pipelines admin |
| 24 | `/operator/admin/pipelines/new` | New Pipeline Definition + First DRAFT | Pipelines admin |
| 25 | `/operator/admin/pipelines/:definitionId` | Pipeline Definition + Version Administration | Pipelines admin |
| 26 | `/operator/admin/pipelines/:definitionId/versions/new` | New Immutable Pipeline Version | Pipelines admin |
| 27 | `/operator/admin/communication-templates` | Communication Template Administration Directory | Communications admin |
| 28 | `/operator/admin/communication-templates/new` | New Communication Template + First DRAFT | Communications admin |
| 29 | `/operator/admin/communication-templates/:definitionId` | Communication Template + Version Administration | Communications admin |
| 30 | `/operator/admin/communication-templates/:definitionId/versions/new` | New Immutable Communication Template Version | Communications admin |
| 31 | `/operator/admin/recovery` | Recovery Console + Integration Event Lookup + Dead-letter Queue | Integration read + Dead-letter read |
| 32 | `/operator/admin/recovery/dead-letters/:deadLetterId` | Dead-letter Detail + Requeue/Resolve | Dead-letter read; mutations permission-gated |
| 33 | `/operator/forbidden` | Staff Permission Boundary | Authenticated staff |

## Embedded product surfaces

Route count is not operation count. The following R3 capabilities are embedded in coherent workspaces rather than inflated into artificial standalone pages:

- canonical Claims operational metrics in Dashboard;
- Claim lifecycle transitions in Claim Detail;
- Pipeline stage movement in Claim Detail;
- Claim Task creation and per-Claim Task list in Claim Detail;
- Task update, completion and cancellation in Task Detail;
- evidence attention and Claim timeline in Claim Detail;
- Customer 360 policy and Claim relationships in Customer Detail;
- Policy 360 customer, asset, metadata and Claim relationships in Policy Detail;
- Renewal customer/policy context, lifecycle transition and version-pinned pipeline movement in Renewal Detail;
- Collection customer/policy context, terminal lifecycle transition, server-verified payment-state mutation and version-pinned pipeline movement in Collection Detail;
- Pipeline Admin activation, enable/disable and immutable version history in Pipeline Detail;
- Communication Template Admin activation, enable/disable, immutable content history and typed variable schema in Template Detail;
- Integration Event lookup by published `eventId` in Recovery Console;
- dead-letter pagination in Recovery Console and optimistic-concurrency requeue/resolve in Dead-letter Detail.

## Customer & Policy 360 boundary

The four Customer/Policy routes are read-only because the frozen R3 API exposes `listCustomers`, `getCustomer`, `listPolicies`, and `getPolicy` only. The web does not invent edit operations or enrich the projection with contact, premium, coverage, address, or other fields absent from the API contract.

## Renewals boundary

Renewals productization uses only the frozen R3 operations `listRenewalCases`, `getRenewalCase`, `transitionRenewalCase`, and `moveRenewalOperationalStage`.

- the list exposes only server pagination because the R3 list contract publishes no search/status filters;
- lifecycle and operational pipeline are presented as separate state machines;
- terminal lifecycle transitions use the authoritative `allowedTransitions` projection and `expectedVersion`;
- operational movements use only `allowedNextStageKeys` from the pinned pipeline version and the pipeline work-item `version`;
- 409/version-conflict responses cause a projection refresh rather than a blind retry.

## Collections boundary

Collections productization uses only the frozen R3 operations `listCollectionCases`, `getCollectionCase`, `transitionCollectionCase`, `moveCollectionOperationalStage`, and `updateCollectionPaymentState`.

- the list exposes server pagination only because the frozen list contract publishes no search/status/payment filters;
- Collection lifecycle, payment state and operational pipeline remain separate concepts;
- lifecycle and payment-state mutations both use the authoritative Collection case `version`;
- pipeline movement uses the independent work-item `version` and only server-provided `allowedNextStageKeys`;
- R3 defines no universal payment-state vocabulary, so the web does not invent a dropdown or assign insurer/payment semantics to values;
- payment-state input is a bounded opaque code and remains non-authoritative until the server-configured verification policy approves it;
- 409/version-conflict responses refresh the authoritative projection; unverified payment values surface the server validation failure instead of being silently accepted.

## Pipeline Administration boundary

Pipeline Administration uses only the frozen R3 admin operations `listPipelines`, `getPipeline`, `createPipeline`, `createPipelineVersion`, `activatePipelineVersion`, and `updatePipelineState`.

- access is presentation-gated by `pipelines.admin` and remains API-authoritative;
- only R3 consumer types `CLAIM`, `RENEWAL`, and `COLLECTION` are offered;
- a new definition is created disabled with its first DRAFT version;
- existing versions are immutable in the UI; changing configuration creates a new DRAFT version;
- version creation, activation and enable/disable use the authoritative definition `version` as `expectedDefinitionVersion`;
- activation is offered only for server-projected DRAFT versions;
- stages preserve `stageKey`, `displayName`, `sortOrder`, boolean `reportingFlags`, and `allowedNextStageKeys` without inventing domain semantics for flags or source classification;
- 409/version conflicts refresh the authoritative definition rather than blind retry;
- configuration/activation conflicts are surfaced from the API instead of being bypassed client-side.

## Communication Template Administration boundary

Communication Template Administration uses only the frozen R3 admin operations `listCommunicationTemplates`, `getCommunicationTemplate`, `createCommunicationTemplate`, `createCommunicationTemplateVersion`, `activateCommunicationTemplateVersion`, and `updateCommunicationTemplateState`.

- access is presentation-gated by `communications.admin` and remains API-authoritative;
- the only channels offered are the R3 values `EMAIL` and `WHATSAPP`;
- a new definition is created disabled with its first DRAFT version;
- the definition channel and key are treated as identity; content changes create a new immutable DRAFT version rather than editing historical content;
- EMAIL requires a subject; WHATSAPP sends `subject: null` instead of inventing a subject concept;
- variable schemas support at most 30 variables with R3 types `STRING`, `NUMBER`, and `BOOLEAN`; names retain the server-published stable-key pattern;
- source classification remains opaque and receives no invented business semantics;
- version creation, activation and enable/disable use authoritative definition `version` as `expectedDefinitionVersion`;
- activation is offered only for server-projected DRAFT versions;
- disabling an active definition may retire its active version; the UI does not pretend that a retired version can simply be toggled active again;
- 409/version conflicts refresh authoritative state rather than blind retry; configuration conflicts remain visible to the administrator.

## Recovery Operations boundary

Recovery Operations uses only `listDeadLetters`, `getDeadLetter`, `requeueDeadLetter`, `resolveDeadLetter`, and `getIntegrationEventStatus` from the frozen R3 API.

- Recovery Console requires both `operations.integration.read` and `operations.dead_letters.read` because it contains both diagnostic surfaces;
- Dead-letter Detail requires `operations.dead_letters.read`; requeue/resolve controls additionally require `operations.dead_letters.manage`;
- dead-letter list exposes server pagination only because R3 publishes no filters for job type, failure category, date, correlation ID, or state;
- Integration Events have no administrative list/search endpoint; the UI therefore performs only explicit UUID `eventId` lookup and does not fabricate discovery;
- the UI displays only the published dead-letter projection: job type, status, attempts, availability, correlation ID, failure category, completed timestamp and version;
- requeue and resolve both submit authoritative `expectedVersion` and are treated as separate administrative outcomes;
- 409/version conflicts refetch the current dead-letter projection rather than blind retry;
- a successful requeue/resolve leaves the dead-letter detail because the resource may no longer satisfy the dead-letter read contract;
- no integration payload, worker internals, proprietary process detail or inferred relationship is added to the UI.

## Operator Communications boundary discovered during Increment 04 planning

R3 exposes operator communication history/detail and send operations, but `requestCommunication` requires an active `templateVersionId`. The active template catalog is only available through the admin template endpoints guarded by `communications.admin`; Claims Operator/Supervisor do not have that permission.

Increment 07 productizes the administrator-facing template lifecycle only. It does **not** erase the operator discovery boundary: Claims Operator/Supervisor still cannot safely discover active template IDs through their own contract. The web therefore continues to avoid an operator template catalog or a UX that asks users to paste opaque UUIDs. A complete operator Communications UI remains deferred until the contract provides a safe operator-facing active-template discovery path or an explicitly approved product design resolves that boundary.

## Navigation rule

Navigation remains permission-aware. A route existing in this inventory does not imply every staff role may access it.

Platform Admin is not an implicit Claims, Customer, Policy, Renewals, or Collections superuser. Pipeline Administration, Communication Template Administration, and Recovery Operations are exposed specifically because Platform Admin owns their explicit permissions.
