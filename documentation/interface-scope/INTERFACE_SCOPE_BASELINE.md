# Interface Scope Baseline — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05  
Blueprint: 0.5.2  
Mode: GREENFIELD  
Maturity: SCOPE_BASELINE  
Status: READY_FOR_REVIEW

This artifact establishes the **descriptive interface scope** required before Architecture and API Contract Design. It is derived from the approved Requirements Ready baseline. It does not define authoritative HTTP endpoints, `operationId` values, payload schemas, client architecture, framework routing, or implementation details.

All interfaces in this Greenfield consumer are classified **PROPOSED**. No item is presented as an observed FAR internal workflow or existing FAR client.

The machine-readable baseline is:

`.blueprint/ui/interface-scope-baseline.json`

## 1. Scope principles

1. The interface scope is derived from approved requirements and use cases.
2. The API/Application boundary remains authoritative for business rules, authentication, authorization, claim lifecycle, validation, redaction and idempotency.
3. API-backed data/actions are identified descriptively, but authoritative `operationId` bindings remain unresolved until API Contract Design and final Interface Inventory reconciliation after API Gate.
4. The web client must not access PostgreSQL or the simulated legacy service directly.
5. MCP is a non-visual Presentation adapter and therefore is not represented as a web screen in this baseline.
6. The simulated legacy service is an integration dependency, not a user-facing interface.
7. Internal operator notes, workshop directory/maps, workshop MCP lookup, productive notifications, claim reopening, post-submission customer evidence amendments and multiple operator roles remain outside the committed MVP interface scope.
8. Responsive and accessibility intent is captured now because it affects scope, while concrete component/token implementation belongs to Design System and Client Architecture.

## 2. Committed web interface set

| ID | Interface | Module | Primary actor | Main requirement coverage |
|---|---|---|---|---|
| WEB-001 | Case Study Home | Public Entry | Guest | NFR-003, NFR-018 + approved Discovery disclaimer |
| WEB-002 | Verify Policy and Vehicle | Claim Intake | Demo Customer | FR-001, FR-002, BR-008 |
| WEB-003 | New Claim Intake | Claim Intake | Demo Customer | FR-003, FR-004 |
| WEB-004 | Review and Confirm Claim | Claim Intake | Demo Customer | FR-005, FR-006 |
| WEB-005 | Claim Submitted | Claim Intake | Demo Customer | FR-005, BR-004, BR-009 |
| WEB-006 | Track Claim Lookup | Claim Tracking | Demo Customer | FR-007 |
| WEB-007 | Claim Status | Claim Tracking | Demo Customer | FR-008, BR-007 |
| WEB-008 | Operator Login | Backoffice Identity | Claims Operator | FR-009 |
| WEB-009 | Claims List | Claims Backoffice | Claims Operator | FR-010 |
| WEB-010 | Claim Detail and State Transition | Claims Backoffice | Claims Operator | FR-011, FR-012, FR-013, BR-001..BR-006 |

The baseline intentionally keeps the committed web surface to **10 interfaces**. Additional screens must not be introduced merely for visual richness.

## 3. Slice mapping

### Slice A — Digital claim intake

Committed interfaces:

`WEB-002 -> WEB-003 -> WEB-004 -> WEB-005`

Supporting entry:

`WEB-001`

Requirements/use cases:

- FR-001..FR-006
- BR-004, BR-008, BR-009, BR-010
- UC-001, UC-002
- AC-001..AC-005

Scope behavior:

- policy/vehicle verification is server-authoritative;
- the claim cannot proceed from invalid verification;
- evidence restrictions are visible to the user and enforced by the server;
- final creation requires explicit confirmation;
- submission is idempotent;
- success displays an opaque tracking code and synthetic next steps.

### Slice B — Claims backoffice

Committed interfaces:

`WEB-008 -> WEB-009 -> WEB-010`

Requirements/use cases:

- FR-009..FR-013
- BR-001..BR-006
- UC-004, UC-005, UC-006
- AC-008..AC-011, AC-014

Scope behavior:

- authentication is mandatory;
- claims list/detail are protected;
- state transitions are presented as server/domain-governed actions;
- invalid transitions have an explicit error state;
- evidence/history are visible only as permitted;
- durable audit is not treated as equivalent to technical logs.

### Slice C — Customer claim tracking

Committed interfaces:

`WEB-006 -> WEB-007`

Supporting entries:

`WEB-001`, `WEB-005`

Requirements/use cases:

- FR-007, FR-008
- BR-007, BR-009
- UC-003
- AC-006, AC-007

Scope behavior:

- lookup requires tracking code plus associated synthetic policy reference;
- failure must not reveal which lookup element was valid;
- status/timeline/next steps are customer-safe;
- internal audit/security metadata is excluded.

## 4. Navigation intent

The routes in the machine-readable artifact are **descriptive route intent**, not a frozen React/router architecture contract.

Planned flow:

```text
/
├── /claims/new/verify
│   └── /claims/new
│       └── /claims/new/review
│           └── /claims/new/success
├── /claims/track
│   └── /claims/track/status
└── /operator/login
    └── /operator/claims
        └── /operator/claims/:claimId
```

Client Architecture may refine route mechanics while preserving the approved interface set and user journeys. Any material scope change requires review.

## 5. Authorization presentation intent

| Interface | Role | Permission intent |
|---|---|---|
| WEB-001 | guest | none |
| WEB-002..WEB-005 | guest | `claims.intake.create` |
| WEB-006..WEB-007 | guest | `claims.tracking.read` |
| WEB-008 | guest | authentication entry |
| WEB-009 | claims_operator | `claims.backoffice.read` |
| WEB-010 | claims_operator | `claims.backoffice.read`, `claims.backoffice.transition` |

These permission intents come from Requirements. They do **not** create endpoint-level permission mappings. The final permission matrix belongs to API Contract Design.

## 6. Interaction-state baseline

The scope requires explicit user-visible treatment for the states that can materially affect the three slices:

- default;
- loading/submitting/transitioning;
- success;
- validation error;
- authentication failure;
- unauthenticated/forbidden;
- not found or safe tracking denial;
- empty list/timeline where applicable;
- rate limited where anonymous/auth endpoints require it;
- conflict/retry or invalid transition where applicable;
- upload rejection;
- generic recoverable error.

Exact HTTP status mapping and error payloads remain API Contract decisions.

## 7. Responsive scope

All 10 interfaces are web interfaces and must remain usable from approximately 360px viewport width through desktop.

Baseline intent:

- forms use one-column mobile layouts;
- tables/lists must not force loss of essential claim identity/state on narrow screens;
- timelines use a mobile vertical flow;
- backoffice detail stacks major regions on mobile;
- desktop layouts may use multiple columns only when reading order remains clear;
- no capability is desktop-only.

This records NFR-011 scope. It does not define final breakpoints or Tailwind tokens.

## 8. Accessibility scope

Every committed interface must support the applicable NFR-012 behaviors:

- keyboard operability;
- visible focus;
- programmatic labels;
- programmatic association of form errors;
- semantic status/error/success announcements;
- logical heading/reading order;
- no status or meaning communicated by color alone;
- accessible table/list semantics;
- accessible evidence upload/retrieval controls.

Design System and Client Architecture will convert these intents into concrete component and implementation rules.

## 9. Requirements traceability

| Requirement / rule | Interface coverage |
|---|---|
| FR-001, FR-002, BR-008 | WEB-002 |
| FR-003, FR-004 | WEB-003 |
| FR-005, FR-006, BR-004, BR-009, BR-010 | WEB-004, WEB-005 |
| FR-007 | WEB-006 |
| FR-008, BR-007 | WEB-007 |
| FR-009 | WEB-008 |
| FR-010 | WEB-009 |
| FR-011, FR-012, FR-013, BR-001..BR-006 | WEB-010 |
| NFR-002 API-authoritative security | WEB-002..WEB-010 as applicable |
| NFR-003 public-safe data | WEB-001..WEB-010 |
| NFR-005 upload safety | WEB-003, WEB-004 |
| NFR-011 responsive web | WEB-001..WEB-010 |
| NFR-012 accessibility | WEB-001..WEB-010 |
| NFR-013 error handling | WEB-002..WEB-010 as applicable |
| NFR-014 abuse resistance | WEB-002, WEB-006, WEB-008 |
| NFR-018 portfolio reproducibility | WEB-001 plus repository/demo documentation |

## 10. Non-visual requirements intentionally outside the web-item list

The following approved requirements are **not missing from scope**. They are non-visual or cross-cutting and will be owned by downstream architecture/API/operations evidence:

| Requirement | Downstream owner |
|---|---|
| FR-014 MCP claim status | Architecture + MCP Presentation adapter + API/Application contract/testing |
| FR-015 legacy simulator | Architecture + legacy port/adapter + contract testing |
| FR-016 synthetic seeds | Data Architecture + implementation/demo evidence |
| FR-017 correlation ID | Architecture/API + observability |
| FR-018 logs vs audit | Architecture/security/audit catalog + implementation QA |
| FR-019 health visibility | Architecture/operations/Kubernetes |
| NFR-001 Clean Architecture | Architecture contract + executable conformance |
| NFR-004 secret handling | Architecture/DevOps/CI |
| NFR-006 observability | Architecture/implementation/QA |
| NFR-007 durable audit | Architecture/data/audit/API/QA |
| NFR-008 Docker | Architecture/DevOps/operations |
| NFR-009 Kubernetes | Architecture/DevOps/operations |
| NFR-010 Linux operation | Operations/documentation |
| NFR-015 testability | Test strategy across implementation phases |
| NFR-016 exact-head CI | Repository CI governance |
| NFR-017 OpenAPI-first | API Contract/OpenAPI/API Gate |

This distinction prevents the UI baseline from inventing screens for technical requirements.

## 11. Explicitly unresolved API needs

The baseline records API needs but intentionally leaves these unresolved:

- authentication mechanism and lifecycle;
- final HTTP resource paths/methods;
- stable `operationId` values;
- request/response schemas;
- error contract;
- rate limits;
- idempotency key/header contract;
- evidence upload transport/storage retrieval contract;
- claims-list pagination/filter contract;
- state-transition mutation and conflict semantics;
- customer-safe tracking schema;
- audit-safe operator detail representation.

These must be resolved by Architecture/API Contract Design. Final Interface Inventory after API Gate must bind each API-backed action/data dependency to canonical approved operations rather than retaining prose guesses.

## 12. Deferred interface candidates

Not part of the committed Interface Scope Baseline:

- operator internal notes UI;
- workshop directory;
- map/geolocation UI;
- workshop MCP lookup UI/client;
- productive notifications center;
- claim reopening flow;
- customer post-submission evidence amendment;
- multiple operator-role administration;
- Android/native mobile client;
- public chatbot;
- AI damage assessment;
- payment/indemnity/quoting screens.

Adding any of these is a scope change, not an implementation convenience.

## 13. Baseline readiness

Blueprint checks covered:

- `ui.interface_scope_baseline` -> machine-readable 10-item baseline plus this review document.
- `ui.interface_scope_traceability` -> requirement/use-case/slice mapping in the JSON and sections 2–10 of this document.
- `ui.brownfield_observed_interface_scope` -> **NOT APPLICABLE** because delivery mode is GREENFIELD.

The two required evidence checks can be marked PASS because the artifacts exist and are traceable.

The project gate `interface_scope_ready` must remain **READY_FOR_REVIEW** until explicit human approval is recorded.

No Architecture, API Contract Design, Interface Inventory or client implementation is authorized by this artifact alone.
