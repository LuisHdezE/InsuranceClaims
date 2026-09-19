# Operator Shell & Navigation Integration Baseline

## Status

Implementation baseline for the reusable R3 operator shell after Custom Fields R3.

Base checkpoint:

`main @ e9807cd44e1bcccbe6ab2e2f36839f69baabdceb`

## Problem statement

The reusable shell already exists and productized operator/admin pages already render through `OperatorShell`, which composes `OperatorSidebar`, `OperatorTopbar`, and `OperatorBottomBar`.

The integration debt was a duplicated navigation authority:

- `operator-navigation.ts` owned Sidebar route, permission, context and visual-maturity information.
- `StaffWorkspacePage.tsx` separately owned `WORKSPACE_GROUPS` and `WORKSPACE_CARDS` with its own permission declarations.
- Workspace cards did not consume `maturity`, so a role could receive a clickable card for a module still marked `pending` in the Sidebar.

This violated the intended single-source-of-truth shell rule.

## Baseline decision

`operator-navigation.ts` is the canonical authority for operator navigation maturity and authorization.

The Workspace may keep a presentation model that groups several related modules into one launch card, but that presentation model must live beside the canonical navigation and reference canonical `navPaths`.

A Workspace card is linkable only when:

1. its `href` is one of its declared canonical `navPaths`;
2. every referenced navigation item exists;
3. every referenced navigation item has `maturity: ready`;
4. the current real staff role owns every permission required by those navigation items.

The Workspace page must not declare a parallel permission or maturity catalog.

## Reusable shell invariant

Every top-level path in `OPERATOR_NAV_ITEMS`, whether `ready` or `pending`, must have a real React route whose page renders through the reusable `OperatorShell`.

The shell composition remains:

- `OperatorShell`
  - `OperatorSidebar`
    - `OperatorBottomBar`
  - `OperatorTopbar`
  - page content

Individual pages must not duplicate Sidebar, Topbar or BottomBar structures.

## Current maturity boundary

At this checkpoint the productized top-level modules are:

- Workspace
- Dashboard
- Claims
- Tasks
- Analytics
- Customers
- Policies
- Renewals
- Collections
- Pipelines
- Communication Templates
- Custom Fields

Still pending visual productization:

- Guidance
- Automations
- Governed Imports
- Recovery Operations

A pending module may have a real route and real backend functionality, but it must not become a clickable Workspace card until its canonical navigation item is promoted to `ready` by its governed visual lane.

## RBAC boundary

This baseline does not alter role grants.

In particular:

- `PLATFORM_ADMIN` does not become a superuser and does not inherit Claims, Tasks, Customers, Policies, Renewals or Collections access.
- `CLAIMS_OPERATOR` does not gain Analytics or platform-administration permissions.
- `CLAIMS_SUPERVISOR` does not gain platform-administration permissions.

Every `ready` module must be linkable by at least one existing real role; no synthetic all-powerful role is introduced.

## Public demo boundary

The public demo remains a separate security problem and is intentionally not widened in this baseline.

The API currently recognizes one governed public-demo operator and restricts it to safe read-only access over synthetic Claim fixtures. The frontend historically exposed additional role-authorized links that the API demo guard can reject with `DEMO_SCOPE_RESTRICTED`.

This baseline must not solve that mismatch by weakening the API guard or widening the existing demo operator.

A subsequent governed lane, **Demo Personas & Synthetic Fixtures**, is required before the public portfolio can safely traverse Supervisor and Platform Admin modules. That lane must establish, for every exposed persona/module:

- synthetic governed fixtures;
- explicit server-side demo identity recognition;
- read-only endpoint allowlists;
- no mutation access;
- page-level read-only UX for mutation controls;
- browser QA proving the persona can traverse only its intended surface.

## Permanent QA gate

`Operator Navigation Integration` must verify:

- the web app typechecks;
- Workspace navigation model invariants pass unit tests;
- every canonical top-level navigation path has a real React route;
- every canonical top-level navigation page uses `OperatorShell`;
- `OperatorShell` composes Sidebar and Topbar;
- Sidebar composes BottomBar and consumes `OPERATOR_NAV_ITEMS`;
- `StaffWorkspacePage` does not own `WORKSPACE_CARDS` or `WORKSPACE_GROUPS`;
- existing Sidebar and demo-access tests continue to pass.

## Out of scope

- changing backend RBAC;
- widening public demo API scope;
- adding demo administrator/supervisor identities;
- changing visual design of already approved pages;
- promoting Guidance, Automations, Imports or Recovery to `ready`;
- reconciling historical VFR evidence.
