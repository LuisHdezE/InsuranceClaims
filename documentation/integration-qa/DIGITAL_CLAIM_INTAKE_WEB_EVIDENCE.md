# Integration QA — digital-claim-intake / web

Evidence ID: **EVD-INTEGRATION-QA-INTAKE-WEB-001**

## Gate binding

- Blueprint baseline: **0.5.2**
- Gate: `integration_qa_pass`
- Evaluation scope: `interface_slice_platform`
- Scope ID: `digital-claim-intake`
- Platform: `web`
- Reviewed commit: `7828b6220500a6d7a8cdb5c1815dbbd06f49ea06`
- Successful run: `34037324011`
- Shared system evidence: `EVD-INTEGRATION-QA-WEB-SYSTEM-001`

## Covered interface/API scope

- Inventory: `WEB-002`, `WEB-003`, `WEB-004`, `WEB-005`
- Operations: `verifyPolicyVehicle`, `createClaim`
- API revision: `api-v1-r1`

## Check result

| Check | Result | Evidence intent |
|---|---|---|
| `qa.functional` | PASS | Complete intake behavior exercised through tests, client runtime and browser journey. |
| `qa.real_api_transport` | PASS | Actual web Axios client calls the production Nest REST composition. |
| `qa.integration` | PASS | React → API → PostgreSQL and API → simulated legacy verification execute together. |
| `qa.security` | PASS | Server validation, safe errors, rate limiting, evidence controls and authoritative boundaries retained. |
| `qa.responsive` | PASS | Desktop/mobile browser journey has no horizontal overflow and preserves interaction. |
| `qa.accessibility` | PASS | Browser audit reports one h1, no unlabeled controls, no missing image alt and no unnamed actions in reviewed surfaces. |
| `qa.e2e` | PASS | Browser creates a real synthetic claim and propagates its authoritative tracking code into downstream flows. |
| `qa.idempotency` | PASS | Same prepared create intent/key replays successfully; conflicts do not invent a new intent. |
| `qa.offline` | PASS | Blocking the loaded SPA `/api` transport surfaces the approved network warning and does not fabricate eligibility or local truth. |

## Result boundary

The technical/evidence gate is ready for human review. The slice remains `FUNCTIONAL`; this evidence does not authorize `ACCEPTED`, Human Acceptance, Release Gate, deployment or merge.
