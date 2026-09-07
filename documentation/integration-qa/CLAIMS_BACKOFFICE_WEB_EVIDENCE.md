# Integration QA — claims-backoffice / web

Evidence ID: **EVD-INTEGRATION-QA-BACKOFFICE-WEB-001**

## Gate binding

- Blueprint baseline: **0.5.2**
- Gate: `integration_qa_pass`
- Evaluation scope: `interface_slice_platform`
- Scope ID: `claims-backoffice`
- Platform: `web`
- Reviewed commit: `7828b6220500a6d7a8cdb5c1815dbbd06f49ea06`
- Successful run: `34037324011`
- Shared system evidence: `EVD-INTEGRATION-QA-WEB-SYSTEM-001`

## Covered interface/API scope

- Inventory: `WEB-008`, `WEB-009`, `WEB-010`
- Operations: `authenticateOperator`, `listClaims`, `getClaimDetail`, `downloadClaimEvidence`, `transitionClaimStatus`
- API revision: `api-v1-r1`

## Check result

| Check | Result | Evidence intent |
|---|---|---|
| `qa.functional` | PASS | Login, list, detail, evidence and transition behavior exercised through tests, client runtime and browser journey. |
| `qa.real_api_transport` | PASS | Actual protected web Axios functions call the production Nest REST composition with Bearer transport. |
| `qa.integration` | PASS | React → API → PostgreSQL persistence/audit/evidence behavior executes as one integrated runtime. |
| `qa.security` | PASS | Invalid/missing token rejection, protected evidence, permission boundary, safe errors and short-lived 900-second bearer session are preserved. |
| `qa.responsive` | PASS | Claims list/detail remain usable on desktop/mobile without horizontal page overflow. |
| `qa.accessibility` | PASS | Browser audit reports one h1, no unlabeled controls, no missing image alt and no unnamed actions in reviewed surfaces. |
| `qa.e2e` | PASS | Browser reaches the authoritative synthetic claim created upstream and the runtime commits a real allowed status transition. |
| `qa.idempotency` | N/A | Backoffice transition uses mandatory `expectedFromStatus` as a concurrency guard; no `Idempotency-Key` protocol is approved. |
| `qa.offline` | PASS | After online authentication, blocking the loaded SPA `/api` transport makes explicit refresh fail closed and refuses to present cached data as authoritative truth. |

The runtime also proves stale `expectedFromStatus` produces `409 CLAIM_STATE_CONFLICT`, followed by authoritative refresh to the committed status rather than automatic mutation replay.

## Result boundary

The technical/evidence gate is ready for human review. The slice remains `FUNCTIONAL`; this evidence does not authorize `ACCEPTED`, Human Acceptance, Release Gate, deployment or merge.
