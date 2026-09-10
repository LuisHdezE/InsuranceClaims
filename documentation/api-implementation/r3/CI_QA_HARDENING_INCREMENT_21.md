# API Implementation R3 — Increment 21: CI/QA Hardening

**Status:** VALIDATED_PRE_COMPACTION  
**Blueprint:** 0.5.2  
**Contract revision:** `api-v1-r3`  
**Base main:** `8d02d6ef8efb935244898919063ec0a055270414`  
**Validated development head:** `0f43143022341a458441d37afe886600c640a371`

## 1. Purpose

Increment 21 hardens the existing R3 CI/QA evidence chain. It does not create product capability and does not change the frozen API, OpenAPI, Postman business semantics, domain model, permissions or runtime behavior.

The objective is to make the evidence answer three questions unambiguously:

1. which exact commit was tested;
2. whether expensive QA is superseded when the PR head changes;
3. whether the production dependency tree contains blocking high/critical advisories or an unclassifiable audit result.

## 2. Exact-head finding and correction

The audit found that most governed PR workflows already checked out `github.event.pull_request.head.sha`, but three mixed-event workflows could still validate GitHub's synthetic PR merge ref:

- `Integration QA - Web Slices`;
- `Release Gate Evidence`;
- `Claims Operations Release Formalization 0.2.0`.

Those workflows now use:

```text
${{ github.event.pull_request.head.sha || github.sha }}
```

This preserves their push/workflow-dispatch behavior while binding pull-request evidence to the exact proposed head.

`Release Gate Evidence` also stopped reporting the event-level `GITHUB_SHA` as the candidate identity. It now derives the tested commit from:

```text
git rev-parse HEAD
```

The validated development run reported:

```text
candidate_sha=0f43143022341a458441d37afe886600c640a371
```

which matches the PR head used by checkout.

## 3. Governed workflow meta-gate

A permanent `CI QA Hardening` workflow and `scripts/validate-ci-qa-hardening.mjs` now guard the CI topology itself.

The meta-gate checks 15 substantive workflows for:

- read-only repository contents permission;
- bounded `timeout-minutes`;
- exact pull-request head checkout;
- event-safe exact-head fallback where push/workflow-dispatch are also supported;
- `npm ci` for the runtime QA workflows;
- cancellation of obsolete expensive runs;
- use of the shared production dependency classifier;
- exact Release Gate candidate SHA reporting.

The first development run of `CI QA Hardening` was `34434265566` and completed `SUCCESS`.

Its classifier self-test proves three cases:

- moderate-only synthetic report: PASS;
- high-severity synthetic report: BLOCK;
- malformed/unclassifiable audit report: BLOCK.

Therefore an npm registry/audit response that lacks `metadata.vulnerabilities` can no longer be misinterpreted as zero vulnerabilities.

## 4. Stale-run cancellation

The three expensive runtime workflows now declare PR-scoped concurrency with `cancel-in-progress: true`:

- `API QA`;
- `Integration QA - Web Slices`;
- `Release Gate Evidence`.

A new PR head therefore invalidates obsolete runtime evidence instead of allowing old and new candidates to race to completion.

## 5. Shared production dependency security gate

`scripts/classify-production-audit.mjs` is the single classifier used by:

- API QA as `api.security_qa`;
- Integration QA as `qa.security`;
- Release Gate Evidence as `release.security_accepted`.

Each workflow records:

```text
npm audit --omit=dev --json
```

and then classifies the report fail-closed.

The machine-readable summary contains:

- exact `candidateSha`;
- vulnerability counts;
- any blocking high/critical packages;
- `PASS` or `BLOCK` decision.

High or critical production advisories block the gate. Missing/unclassifiable npm audit metadata also blocks the gate.

## 6. Dependency evidence and the 16-vulnerability npm install notice

The ordinary root `npm ci` output on the validated development head reports 16 vulnerabilities across the complete installed workspace tree:

- 6 moderate;
- 9 high;
- 1 critical.

That message includes development dependencies and is not itself the production security decision.

The exact production-only audit executed by API QA on the same head reported:

```json
{
  "info": 0,
  "low": 0,
  "moderate": 0,
  "high": 0,
  "critical": 0,
  "total": 0
}
```

with:

```text
gate=api.security_qa
candidateSha=0f43143022341a458441d37afe886600c640a371
decision=PASS
```

Release Gate Evidence independently reported the same zero-vulnerability production result for `release.security_accepted` and the same exact candidate SHA.

Increment 21 therefore does **not** run `npm audit fix --force`, does not mutate dependencies and does not treat development-only advisories as production runtime findings.

## 7. Runtime evidence artifacts

The hardened workflows retain short-lived machine evidence for 30 days.

API QA run `34434265537` uploaded:

```text
api-qa-0f43143022341a458441d37afe886600c640a371
```

including API QA state, raw production audit JSON and the normalized audit summary.

Release Gate Evidence run `34434265536` uploaded:

```text
release-gate-security-0f43143022341a458441d37afe886600c640a371
```

including the raw and normalized production dependency audit evidence.

Integration QA also includes the normalized audit summary in its existing runtime evidence bundle.

## 8. Pre-compaction CI evidence

The validated development head was:

`0f43143022341a458441d37afe886600c640a371`

Substantive workflows completed successfully:

- CI QA Hardening `34434265566`;
- Release Gate Evidence `34434265536`;
- API QA `34434265537`;
- Integration QA - Web Slices `34434265463`;
- API Implementation `34434265508`;
- OpenAPI Validation `34434265504`;
- OpenAPI Post-MVP R2 `34434265443`;
- Postman Contract `34434265469`;
- Claims Operations Release Formalization 0.2.0 `34434265478`;
- Operations Observability Evidence `34434265493`;
- Interface Inventory `34434265492`;
- Design System `34434265485`;
- Functional Slice - Digital Claim Intake Web `34434265477`;
- Functional Slice - Customer Claim Tracking Web `34434265441`;
- Functional Slice - Claims Backoffice Web `34434265517`.

Expected historical readiness locks only:

- `Operations State` `34434265567` — expected failure;
- `Release Gate Ready State` `34434265509` — expected failure.

`Visual Functional Review Ready - Web` did not trigger for this change set.

## 9. API and architecture regression evidence

API QA completed all existing R3 runtime verticals, durable audit assertions and the new dependency gate successfully.

API Implementation remained green with the existing backend suite, frozen R3 endpoint reconciliation, architecture conformance and build.

The Release Gate run also retained:

- 91/91 backend tests;
- architecture conformance;
- web tests/build;
- PostgreSQL backup/restore proof;
- machine release evidence.

No API operation, OpenAPI route, Postman operation, permission or domain rule is added or modified by Increment 21.

## 10. Non-blocking toolchain observations

The hosted runner currently emits a deprecation warning because `actions/upload-artifact@v4` targets a Node.js 20 runtime that GitHub forces onto Node.js 24. This is a toolchain warning, not a failed project check, and Increment 21 does not widen scope into action-version migration without a governed compatibility change.

`npm ci` also reports six install-script approval warnings. The existing locked install, builds, tests and runtime QA all succeed. Increment 21 does not change package script trust policy without a separate explicit supply-chain decision.

## 11. Boundaries

Increment 21 deliberately does not:

- change API routes or operationIds;
- change OpenAPI or Postman business semantics;
- change authentication, permissions or RBAC;
- change domain/application behavior;
- modify persistence schema or migrations;
- run automatic dependency upgrades or `npm audit fix --force`;
- mutate Blueprint Master;
- create a tag, release or publication;
- reinterpret the historical readiness locks as failures of this increment.

## 12. Completion criteria

Increment 21 is merge-review ready only after:

- the documentation-bearing development head reproduces the substantive green CI state;
- the final branch is compacted to one logical commit over exact approved `main`;
- all substantive workflows reproduce success on the compact exact head;
- only established path-applicable historical readiness locks may remain red;
- PR comments, reviews and review threads contain no unresolved blocker;
- Blueprint 0.5.2 and consumer `main` show no unexpected drift.

Exact compact-head evidence belongs in the PR review body after compaction and is not back-written into the frozen tree.
