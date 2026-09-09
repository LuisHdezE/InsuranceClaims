# API Implementation R3 — Increment 16: Custom Fields

**Repository:** `LuisHdezE/InsuranceClaims`  
**Blueprint baseline:** `0.5.2`  
**Delivery mode:** `GREENFIELD` with legacy coexistence `SIMULATED`  
**Classification:** technical synthetic/demo case only, unofficial and unaffiliated

## 1. Frozen scope

This increment implements only the Custom Field administration behavior supported by the frozen R3 requirements, architecture, data, security, audit, API contract, and endpoint inventory.

Primary anchors are `FR-048` (governed Custom Field Definitions), `FR-050` (configuration provenance), and `UC-R3-012`.

Custom Fields do not replace strongly typed domain invariants, lifecycle state, permissions, authentication/security metadata, secrets, or uncontrolled PII.

### Contract matrix

| Element | Frozen R3 value |
|---|---|
| Aggregate/configuration family | Custom Field Definition + immutable versions |
| Permission | `custom_fields.admin` |
| Authorized staff role | `PLATFORM_ADMIN` |
| Initial version | DRAFT v1 |
| Version creation concurrency | `expectedDefinitionVersion` |
| Activation concurrency | `expectedDefinitionVersion` |
| State mutation concurrency | `expectedDefinitionVersion` |
| Reads | 120/minute/principal |
| Admin mutations | 30/minute/admin |
| HTTP idempotency | none for the six frozen operations |
| Create audit | `CUSTOM_FIELD_VERSION_CREATED` |
| Activate audit | `CUSTOM_FIELD_VERSION_ACTIVATED` |
| Disable-active audit | `CUSTOM_FIELD_VERSION_RETIRED` |
| Semantic definition error | `CUSTOM_FIELD_DEFINITION_INVALID` |
| Authority | PostgreSQL |

## 2. Effective API

| operationId | Method | Route |
|---|---|---|
| `listCustomFields` | GET | `/api/v1/admin/custom-fields` |
| `getCustomField` | GET | `/api/v1/admin/custom-fields/{definitionId}` |
| `createCustomField` | POST | `/api/v1/admin/custom-fields` |
| `createCustomFieldVersion` | POST | `/api/v1/admin/custom-fields/{definitionId}/versions` |
| `activateCustomFieldVersion` | POST | `/api/v1/admin/custom-fields/{definitionId}/versions/{versionId}/activate` |
| `updateCustomFieldState` | PATCH | `/api/v1/admin/custom-fields/{definitionId}` |

No Custom Field value CRUD route is added because R3 freezes no such REST operation.

## 3. Narrow target and type vocabulary

R3 Architecture identifies Claim, RenewalCase and CollectionCase as the approved reusable operational projection families in this release. The implementation therefore accepts only:

- `CLAIM`
- `RENEWAL`
- `COLLECTION`

This is deliberately narrower than an arbitrary polymorphic target registry.

The architecture-supported value families are represented as:

- `STRING`
- `NUMBER`
- `BOOLEAN`
- `DATE`
- `ENUM`

`ENUM` requires a finite, unique list. Non-enum types reject enum values.

Sensitivity classification is restricted to the R3 data vocabulary:

- `PUBLIC_SAFE`
- `STAFF_ONLY`

Secrets are prohibited.

## 4. Protected metadata boundary

Field keys matching protected domain, lifecycle, identity, authorization, authentication, secret or obvious uncontrolled-PII concepts are rejected with `CUSTOM_FIELD_DEFINITION_INVALID`.

The implementation also bounds validation metadata to a small JSON-scalar object. It is stored as configuration metadata only. No arbitrary JavaScript, SQL, command, webhook, callback, authorization rule, lifecycle rule, or executable expression is interpreted from this payload.

The goal is to preserve R3's configurable metadata capability without turning Custom Fields into an alternate domain model or execution engine.

## 5. Versioning and activation

Creating a definition creates:

- a disabled definition at version `1`;
- no active version pointer;
- immutable-content `DRAFT` version `1`;
- provenance through `sourceClassification` and creator identity;
- `CUSTOM_FIELD_VERSION_CREATED` audit in the same authoritative transaction.

Creating a successor version requires the current `expectedDefinitionVersion`, creates a new DRAFT, and increments the definition version.

Activation requires an eligible DRAFT and the current definition version. If another version is active, it is retired before the successor becomes ACTIVE. Runtime-active content is never edited in place.

Enabling requires an ACTIVE version. Disabling an active definition retires that version, clears the active pointer and emits `CUSTOM_FIELD_VERSION_RETIRED`.

## 6. PostgreSQL persistence

`custom_field_definitions` stores:

- field key;
- approved target type;
- enabled flag;
- active version identity;
- timestamps;
- optimistic definition version.

`custom_field_versions` stores:

- definition/version identity;
- value type;
- display metadata;
- bounded validation metadata;
- finite enum values;
- sensitivity classification;
- configuration status;
- provenance/source classification;
- creator and lifecycle timestamps.

SQL constraints enforce the technical target/type/status/sensitivity vocabularies, positive versions, JSON object/array shapes, and configuration lifecycle timestamp consistency.

The guarded rollback refuses destructive removal when durable Custom Field configuration exists.

`custom_field_values` is intentionally deferred. Although the R3 data architecture reserves that concept, the frozen API inventory exposes only definition administration. Creating value storage/use cases now would invent runtime behavior that this increment is not authorized to expose.

## 7. Audit and security

Successful creation, activation and active-version retirement write configuration state and audit in the same PostgreSQL transaction.

Audit metadata is bounded to:

- definition identity;
- field key;
- approved target type;
- version number;
- value type;
- sensitivity classification;
- source classification.

Enum contents and validation metadata are not copied into audit events. Rejected/stale attempts do not emit false success events.

`PLATFORM_ADMIN` already owns `custom_fields.admin`; Claims Operators and Supervisors do not. No RBAC widening is introduced.

## 8. Error behavior

Shared Problem Details behavior is preserved:

- `401 AUTHENTICATION_REQUIRED`
- `403 FORBIDDEN`
- `404 RESOURCE_NOT_FOUND`
- `409 RESOURCE_VERSION_CONFLICT`
- `409 CONFIGURATION_ACTIVATION_CONFLICT`
- `422 VALIDATION_ERROR`
- `422 CUSTOM_FIELD_DEFINITION_INVALID`
- `429 RATE_LIMITED`

No insurer-specific error vocabulary is fabricated.

## 9. Verification

Domain/Application/API coverage verifies:

- least-privilege administration;
- initial DRAFT v1;
- six frozen REST operations;
- protected metadata rejection;
- finite enum semantics;
- approved target vocabulary;
- optimistic concurrency;
- successor-version activation;
- retirement on replacement/disable;
- bounded audit metadata.

PostgreSQL runtime QA creates and evolves a synthetic Custom Field through the real API, then verifies durable definition/version authority, audit counts, request correlation, absence of payload leakage, and no false audit for rejected/stale writes.

## 10. Explicit non-scope

This increment does not add:

- Custom Field value CRUD or assignment routes;
- arbitrary target domains;
- insurer-specific Custom Field definitions;
- dynamic database-column creation;
- replacement of Claim/Renewal/Collection lifecycle fields;
- permissions or authentication stored as Custom Fields;
- secrets or uncontrolled PII;
- executable validation/rule code;
- webhook/callback execution;
- tag, release, publication, version change, or Blueprint Master mutation.
