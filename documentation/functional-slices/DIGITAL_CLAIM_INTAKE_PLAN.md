# Digital Claim Intake / Web — Functional Slice Plan

Date: 2026-09-06
Blueprint: 0.5.2
Scope: `digital-claim-intake / web`
Status: IN_PROGRESS

> Unofficial technical case study inspired by publicly observable insurance workflows. No affiliation with FAR Seguros. All policy, claim, user and operational data are synthetic.

## Scope

This slice owns only WEB-002 through WEB-005:

- WEB-002 Verify Policy and Vehicle
- WEB-003 New Claim Intake
- WEB-004 Review and Confirm Claim
- WEB-005 Claim Submitted

WEB-001 remains a shared public platform entry and is not promoted into a fourth functional slice.

## Authoritative API bindings

- `verifyPolicyVehicle`
- `createClaim`

The client must not call the simulated legacy service directly, must not recreate eligibility/lifecycle authority, and must not invent pre-validation endpoints.

## Runtime obligations

- real REST transport through the approved API;
- RFC 9457 Problem Details mapping;
- `X-Request-Id` correlation;
- `Idempotency-Key` generation/reuse for `createClaim` only;
- multipart claim/evidence submission;
- evidence UI restrictions: maximum 5 files, JPEG/PNG/PDF, maximum 5 MiB each, with server validation remaining authoritative;
- responsive behavior from approximately 360 px;
- WCAG 2.2 AA behavior and 44 px minimum touch targets;
- no durable storage of claim draft, evidence, tracking proof or authoritative business data;
- no hardcoded policy/claim business truth.

## Visual direction

Public-facing UI follows the approved FAR-aligned Design System and approved landing reference. It preserves the FAR cyan/yellow/dark identity while using a modern customer-facing composition. It does not copy the current FAR website structure.

## Gate

`functional_slice_ready / digital-claim-intake / web` remains pending until executable implementation, tests, exact API integration evidence and Blueprint status reconciliation are complete.
