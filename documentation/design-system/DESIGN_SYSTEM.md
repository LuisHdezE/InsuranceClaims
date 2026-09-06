# Design System — Insurance Claims Legacy Modernization MVP

Date: 2026-09-06  
Blueprint: 0.5.2  
Mode: GREENFIELD  
Boundary: `visual_identity` + `design_system`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Boundary purpose

This boundary converts the approved executable Interface Inventory into a shared visual/interaction contract before Client Architecture and functional React implementation.

Canonical machine-readable artifacts:

- `.blueprint/ui/design-system.json`
- `.blueprint/ui/design-tokens.json`
- `.blueprint/ui/assets/far-seguros-logo.svg`
- `.blueprint/ui/references/far-public-landing-approved.md`

The Design System does not implement routes, API clients or business rules. It defines the reusable visual and interaction language that later client work must consume.

## 2. Visual Identity applicability — revised decision

Visual Identity is **APPLICABLE**.

The earlier N/A decision was superseded by an explicit human direction from Luis Hernández on 2026-09-06: the client must respect FAR Seguros visual identity and logo while modernizing the experience according to current UI/UX practices.

The governing distinction is:

**preserve brand identity != copy the current website layout**

The current public FAR website and the user-provided screenshot are used as identity evidence for recognizable logo/color language. They are **not** treated as a screen/layout specification.

Disposition target after exact-head validation:

- `design.identity = PASS`
- `design.logo = PASS`
- `identity.logo_required = true`
- `identity.logo_path = .blueprint/ui/assets/far-seguros-logo.svg`

The logo reference is versioned from the user-provided FAR site screenshot. It is used only inside this clearly disclosed unofficial technical case study and does not imply FAR authorization or affiliation.

## 3. Human-approved public landing reference

Luis explicitly approved a modern public landing concept as the visual guide for the customer-facing experience.

Reference manifest:

`.blueprint/ui/references/far-public-landing-approved.md`

The approved direction includes:

- FAR logo in a clean white header;
- strong customer-oriented hierarchy;
- light, spacious surfaces;
- FAR cyan/turquoise as the principal brand field;
- FAR yellow as a deliberate high-attention accent;
- dark text for contrast and trust;
- rounded modern cards;
- restrained shadows;
- generous whitespace;
- clear customer task entry points;
- human/vehicle hero imagery where appropriate for the public home;
- a polished, contemporary insurance-service tone.

The visual reference is **not functional scope authority**. Illustrative items visible in the concept, such as quote flows, payments, FAQs, public documents or customer account areas, do not become implemented capabilities merely because they appear in the mockup.

Authoritative scope remains the approved Interface Inventory and API contract.

## 4. Public experience vs administrative experience

The project has two visibly related but structurally different experience families.

### 4.1 Public/customer-facing experience

Applies to WEB-001 through WEB-007 where appropriate.

Principles:

- welcoming and confidence-building;
- lower information density;
- strong hierarchy and task orientation;
- modern brand expression;
- public hero treatment allowed on WEB-001;
- quick-action cards and customer-friendly explanatory content allowed when backed by approved inventory/static content;
- yellow may be used for a primary public CTA when dark text preserves accessibility;
- cyan/turquoise may carry larger brand surfaces and decorative emphasis;
- case-study/no-affiliation disclosure remains clearly visible.

### 4.2 Administrative/backoffice experience

Applies to WEB-008 through WEB-010.

The backoffice must **not** look like a marketing landing page.

Principles:

- operational clarity and density;
- persistent/compact navigation where useful;
- restrained FAR identity through logo, cyan accents, focus treatment and selected surfaces;
- neutral light work surfaces;
- yellow used sparingly, never as visual noise;
- tables/lists, claim lifecycle, evidence, audit/history and transitions dominate the layout;
- no marketing hero imagery;
- status and permissions remain text/behavior driven, never inferred from decorative color;
- responsive transformations preserve labels, relationships and task order.

This gives one coherent brand family without forcing the public and administrative products into the same page structure.

## 5. Brand color foundation

The following core colors are **OBSERVED** from the user-provided FAR public-site reference, not claimed as a complete official FAR brand manual:

- FAR cyan/turquoise: `#00BED8`
- FAR yellow: `#FEF200`
- FAR dark ink: `#221E1F`

Because recognizable brand colors are not automatically accessible as foreground text colors, the Design System also derives supporting accessible tones:

- strong cyan for text/actions: `#006B78`
- focus blue: `#005FCC`
- primary text/ink: `#221E1F`

Important accessibility rule:

- core cyan and yellow are primarily brand/background/accent tokens;
- they are not used blindly as small text on white;
- dark ink on FAR cyan and FAR yellow must remain the preferred high-contrast pairing;
- accessible strong-cyan/focus tokens are used where a dark foreground on light surfaces is required.

Semantic colors remain purpose-driven and are not replaced by decorative brand color when doing so would weaken meaning.

## 6. Typography, spacing and shape

Use the system UI sans-serif stack. This avoids a network/font dependency and keeps the portfolio demo reproducible.

Baseline type scale:

- 12 px auxiliary/meta;
- 14 px compact support text;
- 16 px default body/control text;
- 18–24 px local hierarchy;
- 30–48 px public page/hero hierarchy where appropriate.

Spacing follows a 4/8/16/24/32/48/64/96 scale.

Shape baseline:

- controls: 10 px radius;
- cards: 16 px radius;
- dialogs: 18 px radius;
- hero media/surfaces: 24 px radius where used;
- chips/status pills: full pill radius.

Public cards may use subtle elevation. Backoffice elevation is more restrained and should not reduce scan density.

## 7. Responsive contract

The approved Interface Inventory requires all ten web interfaces from approximately 360 px through desktop.

### Mobile: 360–767 px

- public hero becomes a clear stacked customer journey;
- one-column forms;
- quick-action grids collapse without changing reading order;
- no horizontal page overflow;
- claims table may transform into labeled rows/cards when full columns are not legible;
- primary actions remain reachable without hover;
- evidence/timeline content remains in logical order.

### Tablet: 768–1023 px

- public cards may use compact responsive grids;
- forms preserve readable widths;
- low-complexity fields may pair where labels/validation remain clear;
- claim lists expose only useful columns;
- timeline remains vertically readable.

### Desktop: 1024 px+

- WEB-001 may use the approved modern hero/card composition;
- operator navigation may remain persistent;
- constrained two-column review/detail layouts are allowed;
- full backoffice table density is allowed;
- visual layout never reorders the logical DOM/keyboard task sequence.

## 8. Component contract

The reusable contract includes:

Public identity/presentation:

- public header;
- public hero;
- public quick-action card;
- public trust feature;
- case-study disclaimer.

Shared/operational components:

- operator app shell;
- breadcrumbs;
- primary, secondary and critical action buttons;
- text/select/date-time/textarea controls;
- file upload;
- form field and validation summary;
- alert/banner;
- lifecycle status badge;
- loading, empty and problem states;
- card/panel;
- journey stepper;
- claim summary;
- tracking code block;
- claim timeline;
- evidence list;
- responsive claims table/list;
- pagination;
- confirmation dialog.

A later React implementation may split or compose these contracts, but it must preserve behavior, accessibility, identity and semantic-state obligations.

## 9. Claim lifecycle presentation

The lifecycle remains API/Domain authoritative:

- `RECEIVED`
- `UNDER_REVIEW`
- `OBSERVED`
- `APPROVED`
- `IN_REPAIR`
- `CLOSED`

The Status Badge supports all six values. Color is supplementary; every state displays readable text.

The client must never infer an allowed transition merely from color, screen context or local logic. WEB-010 sends `expectedFromStatus` and the requested target state to the authoritative API contract.

## 10. Semantic interaction states

The Design System explicitly represents the executable inventory states:

- `default`
- `loading`
- `empty`
- `filtered_empty`
- `success`
- `error`
- `offline`
- `401`
- `403`
- `404`
- `409`
- `422`
- `429`

Conceptual aliases `forbidden`, `validation`, `conflict` and `rate_limit` make implementation intent explicit while retaining exact HTTP-facing states.

Important rules:

- public tracking `404` preserves collapsed safe-not-found behavior;
- `409` never pretends a stale/idempotent mutation succeeded;
- `422` preserves safe user-entered context and associates errors to fields;
- `429` never triggers rapid automatic retry loops;
- offline treatment never fabricates authoritative business data.

## 11. Accessibility contract

Target: **WCAG 2.2 AA**.

Required behaviors:

- complete keyboard operation;
- visible focus with minimum 2 px focus ring;
- minimum 44 px touch target;
- no color-only meaning;
- programmatically associated field errors;
- semantic status/error/success announcements;
- logical heading structure;
- accessible table semantics where a table is rendered;
- labeled relationships preserved when table content reflows on mobile;
- reduced-motion preference respected;
- logical DOM/focus order preserved across responsive layouts;
- brand colors used only in contrast-safe foreground/background combinations.

## 12. API, security and scope authority

The visual revision does not change system authority:

- API remains authoritative for authentication and authorization;
- API remains authoritative for eligibility/validation;
- API remains authoritative for claim lifecycle and transitions;
- API remains authoritative for public tracking redaction;
- local UI state is never persisted business truth;
- no component bypasses Application/API boundaries to access PostgreSQL or the simulated legacy service.

The landing reference cannot create API scope. The approved internal WEB-001 destinations remain:

- start claim -> WEB-002;
- track claim -> WEB-006;
- operator login -> WEB-008.

Any additional FAR public-site destination requires an explicit decision as either an external link or a new Blueprint-scoped capability.

## 13. Interface coverage

The Design System covers:

- WEB-001 shared public entry;
- WEB-002..WEB-005 digital claim intake;
- WEB-006..WEB-007 customer claim tracking;
- WEB-008..WEB-010 claims backoffice.

It adds no new interface and no fourth functional slice.

## 14. Automated validation

`scripts/validate-design-system.mjs` must validate:

- core Design System and token contract shape;
- Visual Identity and logo are applicable;
- the versioned FAR logo asset exists at the declared path;
- the approved landing reference manifest exists;
- exact core FAR identity colors are retained;
- accessible supporting foreground/focus colors pass WCAG AA on light surfaces;
- FAR dark ink passes against core cyan and yellow brand surfaces;
- minimum touch target;
- breakpoint ordering;
- lifecycle status coverage;
- required reusable component set for both public and administrative families;
- exact semantic-state coverage of the Interface Inventory;
- responsive/accessibility obligations on all ten inventory items.

Permanent workflow:

`.github/workflows/design-system.yml`

## 15. Blueprint disposition after revised validation

The previous N/A identity evidence is superseded by this reviewed visual direction. It must not be used to approve the gate.

After the revised exact-head CI succeeds, evidence may support:

- `design.identity = PASS`
- `design.logo = PASS`
- `design.system = PASS`
- `design.tokens = PASS`
- `design.accessibility = PASS`
- `design.responsive = PASS`
- `design.semantic_states = PASS`
- `design_system = READY_FOR_REVIEW`
- `design_system_ready = READY_FOR_REVIEW`

Human approval is still required before `design_system_ready` may become PASS. Gate approval and PR merge approval remain separate decisions.
