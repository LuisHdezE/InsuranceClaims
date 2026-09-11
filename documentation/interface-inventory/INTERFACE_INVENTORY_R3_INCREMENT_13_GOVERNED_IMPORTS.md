# Interface Inventory - R3 Increment 13 Governed Imports

**Revision:** Increment 13 implementation candidate  
**Historical boundary:** this addendum extends `INTERFACE_INVENTORY_R3_WEB_PRODUCTIZATION.md`, whose revision is intentionally frozen after Increment 12. It does not rewrite earlier interface evidence.

## Added route-level interfaces

| # | Route | Interface | Access |
|---|---|---|---|
| 47 | `/operator/admin/imports` | Governed Imports Directory | `imports.execute` |
| 48 | `/operator/admin/imports/new` | Governed Import Upload | `imports.execute` |
| 49 | `/operator/admin/imports/:importJobId` | Governed Import Lifecycle Workspace | `imports.execute` |

Navigation is permission-aware. The `Imports` entry is rendered only when the authenticated staff role owns `imports.execute`; the API remains authoritative for authorization.

## Product boundary

Increment 13 productizes only the frozen R3 Governed Imports surface and does not create new business import semantics.

- supported import type: `SYNTHETIC_REFERENCE_RECORDS` only;
- supported sources: CSV and XLSX;
- source engineering limit: 10 MiB;
- row engineering limit: 5,000 rows;
- approved mapping targets: required `externalReference`, required `label`, optional `classification`;
- mapping direction is `targetField -> sourceHeader`;
- a source header cannot feed more than one approved target;
- raw staged input is never exposed by the web-facing row projection.

## Lifecycle workspace

The detail route renders the server lifecycle as a governed sequence:

`UPLOADED -> PREVIEWED -> MAPPED -> VALIDATED -> DRY_RUN_READY -> COMMITTING -> terminal`

Terminal states recognized by the UI are `COMPLETED`, `COMPLETED_WITH_ERRORS`, `FAILED`, and `CANCELLED`.

Only the action valid for the current authoritative state is offered:

| State | Primary UI action |
|---|---|
| `UPLOADED` | Generate preview |
| `PREVIEWED` | Save explicit mapping |
| `MAPPED` | Validate rows |
| `VALIDATED` | Execute dry-run |
| `DRY_RUN_READY` | Confirm commit |
| `COMMITTING` | No mutation; poll authoritative state |
| terminal | No further mutation |

All versioned mutations submit the current `expectedVersion`. A `409` conflict invalidates the local projection and refetches the authoritative job/rows; the stale mutation is not retried automatically.

## Safe source-header projection

The mapping form must remain functional after navigation or browser refresh without exposing raw imported data. Increment 13 therefore adds an optional `sourceHeaders` projection to `ImportJobResponse`.

- the value is derived only from persisted staged-input **keys**;
- staged-input values are not copied into the job response;
- the job list remains lightweight and does not hydrate source headers per item;
- detail responses after preview hydrate the header names from persisted rows;
- preview returns the cleaned parsed headers immediately;
- application tests assert that headers survive a fresh `getJob` while representative row values do not appear in the serialized public response.

The frozen R3 `ImportJobResponse` OpenAPI fragment intentionally uses an extensible object projection (`additionalProperties: true`), so this safe response field is contract-compatible. `openapi:check:r3` remains the drift gate.

## Idempotency and commit safety

- create/import upload uses an `Idempotency-Key` that is retained for a deliberate retry of the same selected file and regenerated when the file selection changes;
- commit uses a dedicated idempotency key for the commit intent;
- the UI never retries a stale version conflict automatically;
- the final commit requires explicit user confirmation;
- `COMMITTING` is observed by polling rather than by issuing duplicate commit requests.

## Presentation containment

Increment 13 adds `apps/web/src/import-admin.css`. It is imported before `r3-mobile-nav-containment.css`, preserving the established rule that the mobile containment stylesheet remains the final stylesheet import in `main.tsx`.
