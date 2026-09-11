# Interface Validation Evidence - R3 Increment 13 Governed Imports

**Scope:** Governed Imports web productization and safe mapping projection.  
**Status:** implementation candidate; CI evidence is authoritative before merge approval.

## Route and permission evidence

| Route | Guard |
|---|---|
| `/operator/admin/imports` | `RequireOperator` + `RequireStaffAccess allOf=['imports.execute']` |
| `/operator/admin/imports/new` | `RequireOperator` + `RequireStaffAccess allOf=['imports.execute']` |
| `/operator/admin/imports/:importJobId` | `RequireOperator` + `RequireStaffAccess allOf=['imports.execute']` |

`OperatorShell` exposes the Imports navigation entry only through the same `imports.execute` permission. No role or permission assignment is expanded by this increment.

## Contract evidence

Implementation paths:

- `packages/application/src/governed-imports.ts`
- `apps/api/src/import-controller.ts`
- `apps/web/src/api/governed-imports.ts`
- `openapi/r3/imports-1.json`
- `openapi/r3/imports-2.json`
- `openapi/r3/schemas-2.json`

The application projection exposes optional `sourceHeaders` as header names only. `tests/application/governed-imports.test.ts` verifies that a preview followed by a fresh `getJob` returns the expected header names while representative staged values (`Alpha`, `SYN-A`) are absent from the serialized public job response.

The frozen R3 OpenAPI response schema remains unchanged because `ImportJobResponse` is intentionally extensible with `additionalProperties: true`. `npm run openapi:check:r3` is the contract drift check.

## Lifecycle evidence

`AdminImportDetailPage` renders exactly one mutation appropriate to the current state:

- `UPLOADED`: preview;
- `PREVIEWED`: mapping;
- `MAPPED`: validate;
- `VALIDATED`: dry-run;
- `DRY_RUN_READY`: explicit commit confirmation;
- `COMMITTING`: polling only;
- terminal state: read-only.

The web client submits `expectedVersion` on preview, mapping, validation, dry-run and commit. A `409` response invalidates and refetches authoritative job/row queries instead of retrying the stale mutation.

## Data-exposure evidence

The UI consumes only the public `ImportRowResponse` fields: row number, normalized input, validation status/errors, dry-run outcome, commit outcome and target reference fields. It has no staged-input field. The new header projection is generated from staged-input keys only.

## Idempotency evidence

- create generates an idempotency key for a file-selection intent and retains it for retries of that selection;
- changing the selected file generates a new create key;
- commit has an independent idempotency key;
- commit is protected by an explicit confirmation and is never auto-retried on version conflict.

## Presentation evidence

Added UI files:

- `apps/web/src/pages/AdminImportsPage.tsx`
- `apps/web/src/pages/AdminImportCreatePage.tsx`
- `apps/web/src/pages/AdminImportDetailPage.tsx`
- `apps/web/src/import-admin.css`

`apps/web/src/main.tsx` imports `import-admin.css` before the final `r3-mobile-nav-containment.css` stylesheet, preserving mobile containment precedence.

## CI evidence required before HUMAN GATE

The PR is not merge-ready until the exact PR-head commit satisfies repository-required checks, including the existing TypeScript/test/web/OpenAPI/staff-UI contract gates that run for the branch. Final evidence must record:

1. exact PR head SHA;
2. exact `main` SHA used for reconciliation;
3. workflow/check conclusions for that head;
4. PR mergeability after CI;
5. confirmation that no unreviewed drift entered `main` before requesting human merge approval.
