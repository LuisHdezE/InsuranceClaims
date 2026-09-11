# Web R3 Productization - Increment 07

## Scope

Increment 07 productizes **Communication Template Administration** against the frozen R3 contract. It is a Platform Admin configuration surface, not an operator communication-send workaround.

Baseline before implementation:

- repository: `LuisHdezE/InsuranceClaims`
- branch target: `main`
- frozen base SHA: `cd1514da0caef2b59db96c1fcb374b08cc751f50`
- Blueprint consumer baseline: `0.5.2`
- delivery mode: GREENFIELD with SIMULATED legacy coexistence

## R3 operations consumed

The web uses only:

1. `listCommunicationTemplates`
2. `getCommunicationTemplate`
3. `createCommunicationTemplate`
4. `createCommunicationTemplateVersion`
5. `activateCommunicationTemplateVersion`
6. `updateCommunicationTemplateState`

No API route, schema, permission or frozen OpenAPI artifact is changed by this increment.

## Route-level interfaces

Increment 07 adds:

1. `/operator/admin/communication-templates`
2. `/operator/admin/communication-templates/new`
3. `/operator/admin/communication-templates/:definitionId`
4. `/operator/admin/communication-templates/:definitionId/versions/new`

The living R3 route inventory therefore moves from 27 to 31 interfaces. The historical 10-interface inventory remains untouched.

## Product behavior

### Directory

- server pagination only;
- definition key, channel, enabled state and definition version;
- active version and latest projected version summaries;
- no client-invented search/channel/status filters because the frozen list endpoint publishes only page/pageSize.

### New definition

The administrator supplies:

- key;
- R3 channel `EMAIL` or `WHATSAPP`;
- subject when the channel is EMAIL;
- body;
- typed variable schema;
- opaque source classification.

R3 creates the definition disabled with its first DRAFT version. The web does not combine creation, activation and enablement into one hidden action.

### Immutable versions

Existing version content is read-only. Changes are expressed as a new DRAFT version protected by the authoritative `expectedDefinitionVersion`.

The new-version form seeds its editable draft from the active projected version when one exists, otherwise from the latest projected version. This is a UI convenience only; it still creates a new immutable server version.

### Activation and state

- only server-projected DRAFT versions show an activation action;
- activation uses `expectedDefinitionVersion`;
- enable/disable uses `expectedDefinitionVersion`;
- enabling is not offered without `activeVersionId`;
- a 409 causes authoritative refetch instead of blind retry;
- server configuration conflicts are displayed rather than bypassed.

## Content rules preserved

The UI mirrors the frozen/runtime rules instead of enriching them:

- channels: `EMAIL`, `WHATSAPP`;
- EMAIL requires subject;
- WHATSAPP submits null subject;
- body maximum: 8000 characters;
- subject maximum: 240 characters;
- at most 30 variables;
- variable types: `STRING`, `NUMBER`, `BOOLEAN`;
- variable names use the R3 stable-key pattern;
- source classification is displayed and submitted as an opaque classification.

## Authorization boundary

All four routes require `communications.admin` in presentation routing and navigation. The API remains authoritative.

Platform Admin owns `communications.admin`. Claims Operator and Claims Supervisor do not gain this permission and cannot restore admin deep links after login.

Platform Admin remains outside Claims, Customer, Policy, Renewals and Collections business-operation permissions.

## Operator Communications remains deferred

Increment 07 does not claim to complete the operator Communications workflow.

`requestCommunication` requires `templateVersionId`, while active template discovery remains available only through endpoints protected by `communications.admin`. Claims Operator/Supervisor have `communications.read` and `communications.send`, not `communications.admin`.

Therefore the web still does not:

- expose the admin template catalog to operators;
- ask operators to paste template UUIDs;
- infer an active template from key/channel;
- silently elevate operator permissions.

A complete operator sending experience still needs a safe operator-facing template-discovery contract or a separately approved product/contract change.

## Evidence and governance

- historical readiness evidence is immutable;
- Blueprint Master is untouched;
- frozen R3 API/OpenAPI is untouched;
- synthetic/demo data only;
- no release/tag/version publication is part of this increment;
- merge requires exact-head CI, review reconciliation and explicit human approval.
