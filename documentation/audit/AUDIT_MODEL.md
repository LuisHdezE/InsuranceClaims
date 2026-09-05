# Durable Audit Model — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Status: READY_FOR_REVIEW

This artifact defines the durable business/security audit obligations for the synthetic MVP. It is separate from technical/operational logging and does not assert any FAR Seguros audit policy.

---

## 1. Core invariant

```text
technical logs != durable audit
```

Technical logs diagnose software/runtime behavior.

Durable audit proves accountable business/security-significant actions with who/what/when/outcome and request correlation where available.

A successful API operation is not considered adequately audited merely because a log line exists.

---

## 2. Audit authority

Authoritative audit store:

- PostgreSQL `audit_events` table through `AuditPort` + Infrastructure repository.

Authoritative writer:

- server-side Application workflow invokes audit intent;
- Infrastructure persists append-oriented events.

Not audit authorities:

- browser local storage;
- client analytics;
- MCP client logs;
- container stdout;
- reverse-proxy logs;
- GitHub Actions logs.

---

## 3. Required audit record shape

Every durable event contains the minimum justified fields:

- `id`
- `event_code`
- `occurred_at`
- `actor_type`
- `actor_id` when known and safe
- `target_type` when applicable
- `target_id` when applicable
- `outcome`
- `request_id` / correlation reference when available
- sanitized allowlisted `metadata`
- `created_at`

Forbidden metadata:

- passwords/password hashes;
- bearer tokens/JWTs;
- authorization headers;
- signing/API keys;
- raw evidence bytes;
- raw request bodies by default;
- full legacy simulator payloads;
- filesystem paths;
- environment secrets.

---

## 4. Stable audit event catalog

### `AUTH_LOGIN_SUCCEEDED`

Trigger:
Authenticated Claims Operator login succeeds.

Actor:
`OPERATOR`

Target:
`AUTH_SESSION` / operator identity reference as appropriate.

Outcome:
`SUCCESS`

Metadata allowlist:

- authentication mechanism label (`JWT_ACCESS_TOKEN`);
- no token value;
- optional safe request context.

### `AUTH_LOGIN_FAILED`

Trigger:
Operator login attempt fails after credential evaluation.

Actor:
`ANONYMOUS` or synthetic login reference only if safe/minimized.

Outcome:
`FAILURE`

Metadata allowlist:

- generic failure category;
- no indication of which credential element was valid;
- no password/token.

### `CLAIM_CREATED`

Trigger:
A claim submission commits successfully.

Actor:
`CUSTOMER_PUBLIC`

Target:
`CLAIM` + internal claim identifier/reference.

Outcome:
`SUCCESS`

Metadata allowlist:

- initial status `RECEIVED`;
- synthetic policy/vehicle references only if required for audit and already classified safe within demo;
- evidence count, not raw filenames/bytes;
- tracking code may be omitted or masked in audit to minimize public proof leakage.

Transaction rule:
Must commit atomically with Claim + initial history in the modern database transaction.

### `CLAIM_STATE_TRANSITIONED`

Trigger:
A valid operator state transition commits.

Actor:
`OPERATOR` + operator ID.

Target:
`CLAIM` + claim ID.

Outcome:
`SUCCESS`

Metadata allowlist:

- `from_status`;
- `to_status`;
- no arbitrary operator note field because internal notes are deferred.

Transaction rule:
Must commit atomically with current Claim state update + status-history append.

### `CLAIM_STATE_TRANSITION_REJECTED`

Classification:
Technical/security diagnostic by default, **not mandatory durable business audit** for every invalid request, to avoid turning hostile/noisy input into unbounded audit growth.

Escalation:
Repeated suspicious attempts may be surfaced through security logging/metrics and may later justify a durable security event policy.

### `TRACKING_LOOKUP_FAILED`

Classification:
Technical/security log/metric by default, not durable audit.

Reason:
Anonymous lookup failures can be high-volume and must not create an existence oracle or audit-amplification vector.

### `MCP_STATUS_LOOKUP`

Classification:
Technical structured event by default; durable audit not mandatory for every read-only public lookup.

Reason:
The MCP tool exposes the same customer-safe read projection as tracking and has no mutation authority.

---

## 5. Technical logging strategy

Technical logs are structured JSON in deployed/container environments.

Minimum fields where applicable:

- timestamp;
- level;
- service (`api`, `mcp`, `legacy-simulator`, `web-server` where relevant);
- event/message code;
- requestId/correlation ID;
- route/tool name without secrets;
- duration/status classification;
- error category.

Logging rules:

- no blanket request-body logging;
- no authorization/cookie/token values;
- no password fields;
- no raw evidence payload;
- no full legacy simulator payload at normal levels;
- stack traces only in controlled technical logs, never public Problem Details;
- public tracking credentials should be masked/hashed where logged.

---

## 6. Correlation propagation

REST:

1. accept a valid client request ID when allowed or generate one server-side;
2. return it in the response contract/header defined later;
3. propagate it through Application context;
4. include it in technical logs;
5. include it in relevant durable audit events;
6. propagate a correlation value to the legacy adapter call without treating it as auth.

MCP:

- tool invocation receives/generates internal correlation context;
- logs and downstream Application use the correlation reference;
- no MCP protocol/session identifier is treated as business authentication.

Correlation IDs are non-secret identifiers, not credentials.

---

## 7. Append-oriented protection

Normal business runtime exposes:

- `append(event)`
- query/search capabilities only where required for operator/support evidence.

Normal runtime does **not** expose:

- update audit event;
- delete audit event;
- replace metadata;
- customer-facing audit endpoint.

Database/operational administrators can still technically modify a development database, so the MVP does not claim cryptographic immutability. The architecture objective is application-level append orientation plus constrained database permissions where practical.

---

## 8. Retention policy

This public MVP uses synthetic data, so no insurer statutory retention period is claimed.

Default architecture policy:

### Durable audit

- target retention: 180 days in a continuously running demo environment;
- configurable operationally;
- no automatic deletion from ordinary API/Application flows;
- cleanup, if enabled, runs only as an explicit operations/maintenance process;
- Release documentation must clearly state the policy is demo-specific and not regulatory guidance.

### Technical application logs

- target retention: 14 days in hosted/demo operation or bounded by platform log rotation;
- local Docker may use short rotation/bounded files/stdout collection;
- technical logs can expire without invalidating durable audit evidence.

### Security/high-severity diagnostic logs

- target 30 days when the hosting/log platform permits;
- still sanitized and separate from durable audit.

### Idempotency records

- target expiry: 24 hours unless API Contract chooses a different replay window.

---

## 9. Audit access policy

MVP access:

- no public/customer access to raw audit events;
- no MCP access to audit events;
- Claims Operator may see only relevant audit reference/details if required by FR-011 and only through an approved Application/API projection;
- audit repository queries remain server-side;
- full operational audit inspection is a developer/demo capability, not a business permission automatically exposed to the web UI.

The later API Contract must minimize any operator-visible audit payload.

---

## 10. Failure behavior

### Claim creation

If required `CLAIM_CREATED` audit persistence fails inside the transaction, claim creation fails/rolls back.

### State transition

If required `CLAIM_STATE_TRANSITIONED` audit persistence fails, the state/history transaction fails/rolls back.

### Login audit

Authentication security must fail safely. If durable login audit persistence is unavailable, implementation must produce an explicit observable failure policy rather than silently pretending audit succeeded. The precise fail-open/fail-closed decision for login is resolved during implementation/security review, with preference for preserving availability while surfacing a high-severity operational error because no claim mutation occurs.

No claim mutation may succeed without its required durable audit event.

---

## 11. QA obligations

API QA later asserts at minimum:

- successful claim creation -> one `CLAIM_CREATED` durable event;
- successful valid transition -> one `CLAIM_STATE_TRANSITIONED` event with correct actor/target/from/to/requestId;
- failed invalid transition -> no state/history mutation and no false success audit;
- login success/failure -> expected security audit behavior;
- audit rows contain no token/password/raw authorization values;
- technical logs and audit are stored/queried as distinct concerns;
- correlation can connect an API action to the relevant audit row without using a secret.

---

## 12. Blueprint readiness mapping

This artifact provides evidence for:

- `audit.event_catalog`
- `audit.retention_policy`

It follows the Blueprint `dev-event-logging-audit` distinction that logs diagnose software while durable audit proves significant business/security actions.