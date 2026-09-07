# Claims Operations — Approved Visual Targets

Date approved: 2026-09-07
Branch: `blueprint/claims-operations-experience`
Status: APPROVED_VISUAL_DIRECTION

This document freezes the visual direction explicitly approved by the project owner for the post-MVP Claims Operations increment. It is a consumer-local design resource and does not rewrite the historical Blueprint 0.5.2 MVP evidence.

## Identity contract

The protected operational application must remain visibly related to the approved public experience while being denser and more utilitarian.

- Deep navy navigation/sidebar foundation.
- White and very-light-gray operational work surfaces.
- FAR cyan as the principal interactive/accent color.
- FAR yellow as a controlled highlight/primary-action accent, not a background wash.
- Rounded cards with thin neutral borders and restrained shadows.
- Dark navy/ink typography with strong hierarchy.
- Compact enterprise SaaS density rather than marketing-page spacing.
- Consistent lightweight line icons.
- Desktop-first operational layout with responsive tablet/mobile behavior.
- Visible disclosure: `Caso técnico no oficial · No oficial · Sin afiliación` and synthetic-data positioning.
- Demo identity may use `FAR demo`; it must never imply an official FAR product.

Primary reference colors inherited from the approved project design system:

```text
FAR cyan    #00BED8
FAR yellow  #FEF200
Ink/navy    dark navy family, compatible with the public identity
Surface     #FFFFFF
Soft bg     light blue-gray / light neutral
```

## Target 1 — Operations Dashboard

Route target: `/operator/dashboard`
Inventory target: `WEB-011`

Approved composition:

1. Persistent deep-navy sidebar with Dashboard / Claims / Tasks.
2. Top operational header with title, global search treatment, notification affordance and operator identity.
3. KPI strip using only values that can be computed from authoritative API data.
4. Claims-by-stage summary using the four operational projections:
   - Reportados
   - En gestión
   - Requiere información
   - Resueltos
5. `Requiere acción` panel for real operational work only when task data exists. Until then, the implementation must not invent task counts.
6. Recent activity derived from durable claim/status data available to the client.

The approved mockup used five visual KPI cards: Abiertos, Reportados hoy, Requiere info, Evidencia pendiente, Resueltos. Implementation rule: `Evidencia pendiente` remains deferred until the task/evidence-review contract exists; synthetic visual numbers from the mockup are NOT business fixtures.

## Target 2 — Claims Workspace / Kanban

Route target: `/operator/claims`
Inventory evolution: `WEB-009`

Approved composition:

- Claims selected in the navy sidebar.
- Filter/search toolbar.
- View selector `Kanban | Lista`.
- Four Kanban columns:
  - Reportados → `RECEIVED`
  - En gestión → `UNDER_REVIEW`, `APPROVED`, `IN_REPAIR`
  - Requiere información → `OBSERVED`
  - Resueltos → `CLOSED`
- Each card must show the exact authoritative Claim status in addition to the operational grouping.
- Cards should remain compact: tracking/reference, policy, vehicle where useful, status, occurrence/age metadata and navigation affordance.
- The Kanban is a projection. It must never become a second lifecycle authority.
- No unrestricted drag-and-drop in the first increment. State changes continue through server-authorized transitions.
- List view remains available for density, accessibility and larger datasets.

## Target 3 — Claim Operations Detail

Route: `/operator/claims/:claimId`
Inventory evolution: `WEB-010`

Approved composition:

- Back link to Claims.
- Strong claim header with tracking/claim reference, policy + vehicle, operational stage and exact domain status.
- Primary transition action derived from `allowedTransitions`; never invented client-side.
- Two-column desktop layout containing:
  - Resumen
  - Trabajo pendiente (only after task capability exists)
  - Evidencia
  - Timeline
- Technical/audit information remains available in a lower-priority expandable/secondary region.
- Protected evidence remains protected.
- Customer-safe timeline and operator audit timeline remain distinct concepts.

## Target 4 — Tasks Workspace

Route target: `/operator/tasks`
Inventory target: `WEB-012`

Approved composition:

- Tasks selected in the navy sidebar.
- KPI strip for real task data only.
- Search/filter toolbar.
- Main task table with human-friendly labels, Claim relationship, assignee, priority, due date and state.
- Right-side summaries such as `Próximas acciones` and `Carga por operador` only when backed by persistent task data.

Initial task-family direction:

```text
CLAIM_REVIEW
EVIDENCE_REVIEW
MISSING_DOCUMENT_FOLLOWUP
CUSTOMER_FOLLOWUP
CLOSURE_REVIEW
```

This task model is a post-MVP proposal. Completing a task must not silently change Claim lifecycle state.

## Fidelity rules

1. The four approved mockups are design targets, not sources of fictional business truth.
2. Do not copy placeholder names, addresses, KPI percentages or counts into production fixtures merely because they appeared in a visual mockup.
3. Preserve existing synthetic-only/no-affiliation boundaries.
4. Prefer real API data and explicit empty/loading/error states over decorative fake data.
5. The Claim aggregate and server transition matrix remain authoritative.
6. Build the operational shell and Claims projection before introducing a generic pipeline engine.
7. Tasks, assignments, priorities and due dates require an explicit backend/Application contract before they become functional UI.
8. Accessibility, keyboard navigation, focus visibility and responsive behavior remain mandatory.

## Approved implementation order

```text
Operational shell
→ Operations Dashboard using existing Claim API
→ Claims Kanban/List projection
→ Claim Detail visual evolution
→ ClaimTask domain/application/API/persistence slice
→ Tasks Workspace + task panels
→ integrated timeline refinements
→ fresh visual/functional evidence
```

This file is the canonical consumer-side visual target for the Claims Operations increment until superseded by an explicitly approved revision.
