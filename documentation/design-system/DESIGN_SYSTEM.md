# Design System — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05  
Blueprint: 0.5.2  
Mode: GREENFIELD  
Boundary: `design_system`

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## 1. Boundary purpose

This boundary converts the approved executable Interface Inventory into a shared visual/interaction contract for all committed web slices before Client Architecture and functional React implementation.

Canonical machine-readable artifacts:

- `.blueprint/ui/design-system.json`
- `.blueprint/ui/design-tokens.json`

The Design System does not implement screens, routes, API clients or business rules. It defines the reusable visual and interaction language that later client work must consume.

## 2. Visual Identity applicability

Blueprint Visual Identity is **NOT APPLICABLE** for this MVP.

Reasoning:

1. This repository is an unofficial technical case study, not a commercial insurer brand rollout.
2. The product does not require a standalone branded identity to demonstrate the modernization architecture and workflow.
3. Creating a custom logo merely to satisfy a process artifact would violate the Blueprint rule that Visual Identity is conditional and that a logo is never fabricated solely for a gate.
4. Copying or approximating FAR Seguros branding would weaken the explicit no-affiliation boundary.

Disposition:

- `design.identity = N/A`
- `design.logo = N/A`
- `identity.logo_required = false`
- `identity.logo_path = null`

The Design System still defines a neutral UI direction because every functional client requires visual consistency even when brand identity is intentionally absent.

## 3. Visual direction

Direction:

**Neutral technical insurance case study focused on trust, operational clarity, calm hierarchy and readable workflow state.**

Design principles:

- no insurer-brand imitation;
- restrained navy/teal foundation with accessible semantic colors;
- white/light surfaces for readability and portfolio screenshots;
- clear hierarchy over decorative density;
- server/domain state always represented in text, never by color alone;
- interaction feedback is explicit and recoverable;
- synthetic/demo context remains visible where relevant.

## 4. Design tokens

The canonical token file is `.blueprint/ui/design-tokens.json`.

### Color foundation

- primary navy: `#123B6D`
- secondary teal: `#0F766E`
- focus/info blue: `#2563EB`
- success: `#15803D`
- warning: `#B45309`
- danger: `#B91C1C`
- neutral: `#64748B`
- primary text: `#0F172A`
- canvas: `#F8FAFC`
- primary surface: `#FFFFFF`

The validator checks the text/semantic foreground palette against light surfaces and rejects ratios below 4.5:1 for the committed text-use tokens.

### Typography

Use the system UI sans-serif stack. This avoids a network/font dependency and keeps the portfolio demo reproducible.

Baseline sizes:

- 12 px auxiliary/meta
- 14 px compact supporting text
- 16 px default body/control text
- 18–20 px local headings
- 24–36 px page/hero hierarchy

### Spacing and shape

Spacing is based on a 4/8/16/24/32/48/64 scale.

- controls: 8 px radius
- cards: 12 px radius
- dialogs: 16 px radius
- status chips: pill radius

No visual effect may reduce text readability or replace semantic hierarchy.

## 5. Responsive contract

The approved Interface Inventory requires all ten web interfaces from approximately 360 px through desktop.

### Mobile: 360–767 px

- single-column forms;
- stacked review/detail regions;
- no horizontal page overflow;
- claims table may transform into labeled claim rows/cards when the full column model is not legible;
- primary actions remain reachable without hover;
- evidence/timeline content remains in logical reading order.

### Tablet: 768–1023 px

- preserve form readability;
- paired low-complexity fields are allowed when labels and validation remain clear;
- claims lists may expose a compact column set;
- timeline remains vertically readable.

### Desktop: 1024 px+

- constrained two-column review/detail layouts are allowed;
- operator navigation may remain persistent;
- full backoffice table density is allowed;
- visual layout must not reorder the logical DOM/keyboard task sequence.

## 6. Component contract

The Design System provides reusable contracts for the inventory needs, including:

- public header;
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

A later React component implementation may split or compose these contracts, but it must preserve the behavior, accessibility and semantic-state obligations.

## 7. Claim lifecycle presentation

The lifecycle remains API/Domain authoritative:

- `RECEIVED`
- `UNDER_REVIEW`
- `OBSERVED`
- `APPROVED`
- `IN_REPAIR`
- `CLOSED`

The Status Badge component supports all six values. Color is supplementary; every state displays readable text.

The UI must not infer an allowed transition merely from color, screen context or local logic. WEB-010 sends `expectedFromStatus` and the requested target state to the authoritative API contract.

## 8. Semantic interaction states

The Design System explicitly defines every normalized state used by the executable Interface Inventory:

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

Additional conceptual aliases `forbidden`, `validation`, `conflict` and `rate_limit` make implementation intent explicit while retaining exact HTTP-facing states.

Important rules:

- public tracking `404` preserves collapsed safe-not-found behavior;
- `409` never pretends a stale/idempotent mutation succeeded;
- `422` preserves safe user-entered context and associates errors to fields;
- `429` never triggers rapid automatic retry loops;
- offline treatment never fabricates authoritative business data.

## 9. Accessibility contract

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
- labeled relationships preserved when the table reflows on mobile;
- reduced-motion preference respected;
- logical DOM/focus order preserved across responsive layouts.

## 10. API and security authority

The Design System never changes system authority:

- API remains authoritative for authentication and authorization;
- API remains authoritative for eligibility/validation;
- API remains authoritative for claim lifecycle and transitions;
- API remains authoritative for public tracking redaction;
- local UI state is never treated as persisted business truth;
- no component bypasses Application/API boundaries to access PostgreSQL or the simulated legacy service.

## 11. Interface coverage

The shared Design System covers:

- WEB-001 shared public entry;
- WEB-002..WEB-005 digital claim intake;
- WEB-006..WEB-007 customer claim tracking;
- WEB-008..WEB-010 claims backoffice.

It does not add a new interface or a fourth functional slice.

## 12. Automated validation

`scripts/validate-design-system.mjs` validates:

- core Design System and token contract shape;
- intentional no-logo/no-branding disposition;
- required colors/tokens;
- WCAG AA contrast for committed text-use colors on light surfaces;
- minimum touch target;
- breakpoint ordering;
- lifecycle status coverage;
- required reusable component set;
- exact semantic-state coverage of the Interface Inventory;
- responsive/accessibility obligations on all ten inventory items.

Permanent workflow:

`.github/workflows/design-system.yml`

## 13. Proposed Blueprint disposition

When exact-head validation and existing regression workflows succeed, the evidence supports:

- `design.identity = N/A`
- `design.logo = N/A`
- `design.system = PASS`
- `design.tokens = PASS`
- `design.accessibility = PASS`
- `design.responsive = PASS`
- `design.semantic_states = PASS`
- `design_system = READY_FOR_REVIEW`
- `design_system_ready = READY_FOR_REVIEW`

Human approval is required before `design_system_ready` may become PASS. Gate approval and PR merge approval remain separate decisions.
