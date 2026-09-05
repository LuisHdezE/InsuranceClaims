# Architecture Decision Clarifications

Date: 2026-09-05
Blueprint: 0.5.2
Status: READY_FOR_REVIEW

This companion artifact closes three ambiguities found during the architecture self-review. Where wording in an earlier architecture-phase artifact is softer, these decisions are authoritative for this consumer boundary.

## CLAR-001 — Frontend Clean Architecture is mandatory

The React client is also bound by the consumer requirement for Clean Architecture / Ports & Adapters. Detailed Client Architecture remains intentionally deferred until after API Gate, but these invariants are already frozen:

```text
React presentation
    -> feature/application orchestration
        -> client-side ports/contracts
            <- HTTP/API adapters
```

Rules:

- React components/pages do not become the authority for claim lifecycle, permissions or validation truth;
- business data/actions come from approved API adapters after API Gate;
- transport details are isolated from reusable feature/application logic;
- the web app cannot import Prisma, PostgreSQL, server Infrastructure or legacy simulator code;
- UI authorization is presentation-only; API authorization remains authoritative;
- detailed routing, caching, forms and generated API-client strategy are frozen later by `client_architecture_ready` for each slice/platform.

## CLAR-002 — Argon2id is required for demo operator password hashing

The mandatory MVP password hashing adapter shall use **Argon2id**. This is no longer merely a preferred option.

If the implementation environment demonstrates a concrete compatibility blocker, changing the algorithm requires a reviewed architecture amendment rather than a silent substitution.

The hash implementation stays in Infrastructure behind `PasswordHasherPort`; Domain/Application never depend on a hashing library.

## CLAR-003 — Login audit failure behavior

Authentication and audit behavior is fixed as follows:

- successful credentials do not receive an access token unless `AUTH_LOGIN_SUCCEEDED` durable audit persistence succeeds;
- therefore a durable-audit outage makes successful operator login fail closed for the MVP;
- failed credentials are always denied regardless of audit availability;
- the system attempts `AUTH_LOGIN_FAILED` audit for rejected credentials;
- if that failure-audit write itself fails, authentication remains denied and a sanitized high-severity technical log is emitted;
- claim mutations already remain fail-closed when their required audit event cannot be persisted.

This policy favors accountability over backoffice availability in the small public demo and removes the prior unresolved fail-open/fail-closed choice.