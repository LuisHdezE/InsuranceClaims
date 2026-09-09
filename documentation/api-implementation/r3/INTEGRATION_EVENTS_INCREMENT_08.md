# API Implementation R3 — Increment 08: Integration Events

**Project:** Insurance Claims Legacy Modernization  
**Blueprint:** 0.5.2  
**Delivery mode:** GREENFIELD with legacy coexistence SIMULATED  
**Baseline main SHA:** `b27e97ce43d7cc1c88229ea9ac31972450a4583f`  
**Contract:** `api-v1-r3`  
**Status:** IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW  
**Date:** 2026-09-08

> Caso técnico no oficial · No oficial · Sin afiliación. All integration identities, event types, payloads, customer references, secrets used by tests and processing outcomes in this increment are synthetic/demo data. No real insurer/core integration or production credential is represented.

## 1. Increment boundary

This increment implements the frozen R3 Integration family immediately after the Communication Hub.

Implemented requirements:

- `FR-032` — authenticated inbound event ingestion;
- `FR-033` — explicit, durable inbound event processing outcome;
- `UC-R3-005` — process inbound customer event through an authenticated integration boundary.

Frozen operations implemented:

```text
POST /api/v1/integrations/events
GET  /api/v1/admin/integration-events/{eventId}
```

Operation permissions remain separated:

- inbound ingestion uses the dedicated non-staff integration principal with only `integration.events.ingest`;
- integration diagnostics require staff JWT plus `operations.integration.read`;
- Claims Operator/Supervisor do not implicitly gain integration diagnostics;
- Platform Administrator does not gain Claim lifecycle authority through the integration surface.

This increment does not infer or implement any Claim, Collection, Policy or Customer business mutation from an inbound payload.

## 2. HMAC authentication boundary

`POST /api/v1/integrations/events` uses the frozen HMAC-SHA256 contract.

Required headers:

- `X-Integration-Key`;
- `X-Event-Id`;
- `X-Event-Timestamp` as Unix epoch seconds;
- `X-Event-Signature` as lowercase hexadecimal HMAC-SHA256.

Canonical signing input:

```text
<timestamp>\n<eventId>\n<SHA256(rawBody)>
```

The allowed clock skew is exactly `±300` seconds.

NestJS is configured with `rawBody: true` so the digest and HMAC are calculated over the exact bytes received by the API rather than over a reserialized object.

Authentication occurs before the payload is accepted as a valid event. Invalid or unknown integration identity, disabled integration, missing runtime secret or incorrect signature returns `INTEGRATION_SIGNATURE_INVALID`. A malformed/out-of-window timestamp returns `INTEGRATION_TIMESTAMP_INVALID`.

Signature comparison uses `timingSafeEqual` after fixed hexadecimal validation.

## 3. Secret and integration registry policy

The PostgreSQL `inbound_integrations` registry stores only non-secret integration metadata:

- internal integration identity;
- external integration key;
- secret key identifier;
- enabled state;
- bounded allowed-event schema configuration;
- timestamps/version.

HMAC secrets are not persisted in repository fixtures or the integration registry. Production composition resolves them only from runtime secret configuration through `INTEGRATION_HMAC_SECRETS_JSON`.

The runtime parser requires a bounded key identifier and a secret value between 16 and 512 characters. No production integration or secret is automatically seeded.

Memory/API tests seed only explicit synthetic identities and secrets.

## 4. Event schema and untrusted-input handling

Inbound request shape is constrained to:

```text
{
  eventType,
  payload
}
```

`eventType` and payload field names use bounded identifier syntax. The Application layer revalidates the event type against the integration's allowlisted event schema.

Initial bounded scalar field families are:

- `STRING`;
- `NUMBER`;
- `BOOLEAN`.

Constraints include:

- exact payload/schema field match;
- maximum 40 fields;
- string value maximum 500 characters;
- finite numbers only;
- no arrays, nested arbitrary JSON, executable content, SQL or outbound URLs.

The HTTP controller's validation is not the business authority. The Application layer remains authoritative over event schema acceptance.

## 5. Replay and idempotency semantics

The frozen replay identity is:

```text
(integration identity, external event id)
```

The accepted event stores the SHA-256 digest of the exact signed raw body.

Semantics:

- same authenticated integration + same external event identity + same payload digest returns the original logical accepted event;
- the replay does not create another `InboundEvent`, async job or acceptance audit record;
- same identity with a different digest returns `409 INTEGRATION_REPLAY_DETECTED`;
- unique database constraint `(integration_id, external_event_id)` closes concurrent acceptance races;
- async work uses a separate unique logical identity for `PROCESS_INBOUND_EVENT`.

Replay lookup occurs after integration authentication but before revalidating current allowlist configuration. Therefore a correctly signed replay of an already accepted byte-identical event remains idempotent even if later configuration changes would reject a newly submitted event of that shape.

The API does not use the generic HTTP `Idempotency-Key` for this operation because the frozen contract defines the signed external event identity as the replay key.

## 6. Durable acceptance semantics

HTTP `202` means authenticated, validated and durably accepted for processing. It does not mean domain processing has completed.

A successful acceptance transaction persists together:

- one `InboundEvent` with ingestion state `ACCEPTED` and processing state `PENDING`;
- one durable `AsyncJob` of type `PROCESS_INBOUND_EVENT` in state `PENDING`;
- one durable audit event `INBOUND_EVENT_ACCEPTED` with actor type `INTEGRATION` and request correlation.

If any part of that transaction fails, the acceptance is not partially committed.

The accepted response exposes the server event identity and `PENDING` processing status so an authorized administrator can subsequently query processing outcome.

## 7. Processing, retry and dead-letter state

The Application boundary exposes an internal `processInboundEvent()` capability intended for the later Worker adapter. No HTTP endpoint bypasses that Application orchestration.

The implemented durable processing vocabulary is:

```text
PENDING
  -> PROCESSING
      -> PROCESSED
      -> FAILED
          -> PROCESSING (bounded retry)
          -> DEAD_LETTER (attempt budget exhausted)
```

The associated durable job vocabulary follows the approved R3 architecture:

```text
PENDING
  -> LEASED
      -> SUCCEEDED
      -> FAILED_RETRYABLE
      -> DEAD_LETTER
```

The current bounded processing safety budget is three attempts for `PROCESS_INBOUND_EVENT`. This is infrastructure/application retry safety for the synthetic demonstration, not an insurer-specific business rule.

Failure metadata is sanitized and bounded. Processor exceptions are classified as `PROCESSOR_EXCEPTION`; raw stack traces, raw bodies, secrets and infrastructure error detail are not exposed through the REST status response.

`DEAD_LETTER` is durable and diagnosable. This increment intentionally does not implement the separate FR-052 dead-letter administration endpoints.

## 8. Lease and concurrency safety

Async processing uses an explicit lease rather than assuming one worker.

A processing lease records:

- lease owner;
- lease expiry;
- event optimistic version;
- async-job optimistic version.

Lease acquisition updates `InboundEvent + AsyncJob` transactionally. If either optimistic update loses a race, an internal transaction-abort sentinel forces the entire PostgreSQL transaction to roll back before returning a busy outcome.

Completion is protected by:

- `expectedEventVersion`;
- `expectedJobVersion`;
- expected `leaseOwner`;
- active `LEASED` state;
- non-expired lease.

This prevents a worker whose lease expired from completing work after another worker has re-acquired the same job. The same rule is implemented in Memory and PostgreSQL adapters and is covered by a dedicated Application test.

No exactly-once processing claim is made. The implementation provides durable, idempotent/retry-safe orchestration suitable for the approved portfolio boundary.

## 9. Administrative diagnostics

`GET /api/v1/admin/integration-events/{eventId}` requires:

- valid staff JWT;
- Application permission `operations.integration.read`.

It returns only the bounded processing projection:

- event identity;
- external event identity;
- event type;
- ingestion status;
- processing status;
- accepted timestamp;
- processed timestamp when applicable;
- sanitized failure category when applicable.

It does not return:

- raw signed body;
- HMAC signature;
- HMAC secret;
- integration credentials;
- SQL/Prisma errors;
- stack traces.

Claims Operators are explicitly denied this administrative diagnostic operation by the existing role grants; Platform Administrator is authorized.

## 10. Persistence

Forward migration:

`prisma/migrations/20260908_06_integration_events_r3.sql`

adds/evolves:

- approved R3 audit actor types, including `INTEGRATION`;
- `inbound_integrations`;
- `inbound_events`;
- `async_jobs`.

Structural constraints enforce:

- unique integration key and key identifier;
- unique `(integration_id, external_event_id)`;
- event-id/digest/event-type format;
- finite processing/job status vocabularies;
- unique async job logical identity;
- valid lease metadata for `LEASED` jobs;
- terminal completion timestamps for terminal jobs;
- optimistic versions.

`qa/bootstrap.sql` mirrors the physical schema for runtime QA.

Rollback:

`prisma/migrations/20260908_06_integration_events_r3.rollback.sql`

is conservative. It refuses destructive rollback when integration/event/job history or integration audit evidence exists.

No production integration registry row or credential is seeded.

## 11. Clean Architecture conformance

- Integration vocabulary is framework-independent Domain code.
- HMAC authentication is represented through an Application port.
- replay validation, allowlist validation, durable acceptance and processing orchestration live in Application.
- persistence and cryptographic secret resolution live in Infrastructure adapters.
- `MemoryIntegrationStore` and `PrismaIntegrationStore` implement the same Application repository port.
- `HmacIntegrationAuthenticator` is an Infrastructure adapter.
- `SimulatedInboundEventProcessor` is an Infrastructure/demo adapter and performs no invented business mutation.
- NestJS controllers are outer Presentation adapters.
- the future Worker can invoke `processInboundEvent()` without owning business rules.

No Domain/Application code imports NestJS, Prisma or runtime secret configuration.

## 12. Tests and reviewed failure modes

Application coverage proves:

- durable `ACCEPTED/PENDING` creation;
- one acceptance audit;
- byte-identical replay returns the original event;
- changed body under the same external identity is rejected;
- non-allowlisted payload shape is rejected;
- Claims Operator cannot read integration diagnostics;
- Platform Administrator can read diagnostics;
- successful processing reaches `PROCESSED`;
- repeated processing of terminal success is safe;
- bounded processing failures reach `DEAD_LETTER` after the third failed attempt;
- dead-letter state remains queryable;
- an expired worker lease cannot complete after another worker has re-acquired the job.

REST coverage proves:

- invalid HMAC is rejected before schema acceptance;
- stale timestamp is rejected;
- a correctly signed event is accepted with HTTP `202` and `PENDING` state;
- byte-identical signed replay returns the same event identity;
- changed payload with the same signed external event identity returns `INTEGRATION_REPLAY_DETECTED`;
- signed but schema-invalid payload returns `INTEGRATION_SCHEMA_INVALID`;
- unknown integration key returns `INTEGRATION_SIGNATURE_INVALID`;
- Claims Operator is denied the admin status endpoint;
- Platform Administrator can read `PENDING` then `PROCESSED` status.

An initial candidate head `17e1fc7f1e5225bf8af903bdfb2bf60f2af301d1` exposed a test-only TypeScript error: a Supertest helper was accidentally declared `async`, converting the chainable request object into `Promise<Response>`. The helper was corrected without changing implementation or contract semantics. Later review also strengthened lease completion against stale-worker races before final machine verification.

## 13. Explicit exclusions

This increment does not implement:

- real insurer/core integration;
- production webhook credentials or integration registry fixtures;
- arbitrary inbound event types/payloads;
- direct Claim/Collection/Policy/Customer mutation from an inbound payload;
- Automation Engine (`FR-034..FR-035`);
- generic Worker process/scheduler (`FR-051`);
- dead-letter list/detail/requeue/resolve REST operations (`FR-052`);
- real messaging providers;
- customer portal changes;
- generic audit-search REST API;
- arbitrary executable automation or HTTP callbacks;
- changes to frozen `documentation/api/r3/**`;
- Blueprint Master changes;
- tag, release or publication changes.

## 14. Machine verification

Verified implementation head before this evidence-only commit:

`3e7679fef9c5317ca8b928ebfbd9d27edd8c364b`

Successful exact-head workflows:

- `API Implementation #295` — run `34299861621` — SUCCESS;
- `API QA #258` — run `34299861616` — SUCCESS;
- `OpenAPI Validation #278` — run `34299861600` — SUCCESS;
- `OpenAPI Post-MVP R2 #53` — run `34299861640` — SUCCESS;
- `Postman Contract #265` — run `34299861601` — SUCCESS;
- `Integration QA - Web Slices #156` — run `34299861641` — SUCCESS;
- `Release Gate Evidence #148` — run `34299861613` — SUCCESS;
- `Operations Observability Evidence #135` — run `34299861654` — SUCCESS;
- `Design System #235` — run `34299861636` — SUCCESS;
- `Interface Inventory #240` — run `34299861674` — SUCCESS;
- `Functional Slice - Claims Backoffice Web #163` — run `34299861638` — SUCCESS;
- `Functional Slice - Customer Claim Tracking Web #176` — run `34299861675` — SUCCESS;
- `Functional Slice - Digital Claim Intake Web #208` — run `34299861606` — SUCCESS.

`API QA #258` specifically completed Prisma contract emit, production TypeScript checks, ephemeral PostgreSQL bootstrap, synthetic runtime startup, positive/negative contract and security QA, durable audit/persistence verification and production dependency classification successfully.

Expected historical lock failures at that same implementation head:

- `Release Gate Ready State #141` — run `34299861604` — expected FAILURE because historical human acceptance/release readiness remains intentionally locked;
- `Operations State #130` — run `34299861623` — expected FAILURE because the inherited release snapshot remains frozen;
- `Visual Functional Review Ready - Web #136` — run `34299861603` — expected FAILURE under the frozen historical visual-review readiness policy.

There was no fourth/new failure.

Because adding this evidence file creates a new PR head, the final human merge gate requires a fresh exact-head matrix after this commit. Machine success never authorizes merge, tag, release or publication.

## 15. Human gate

This increment remains:

`IMPLEMENTED_VERIFIED_PENDING_HUMAN_REVIEW`

The PR may be marked ready for human review only after the evidence-head CI matrix again shows all substantive checks successful with exactly the three known historical lock failures.

Merge requires explicit human authorization for PR #45. Tagging, releasing or publishing would require separate explicit human authorization.
