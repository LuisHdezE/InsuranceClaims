# Security Model and Threat Model — Insurance Claims Legacy Modernization MVP

Date: 2026-09-05
Blueprint: 0.5.2
Mode: GREENFIELD with SIMULATED legacy coexistence
Status: READY_FOR_REVIEW

> All users, policies, vehicles, claims, evidence and operational data in this public case study are synthetic.

This document defines the security architecture for the MVP. It does not describe FAR Seguros controls or infrastructure.

---

## 1. Security objectives

1. Keep API/Application authoritative for authentication, authorization, validation, lifecycle transitions and redaction.
2. Prevent anonymous/public flows from exposing whether partial tracking credentials are valid.
3. Prevent uploaded evidence from becoming executable/public content or trusted filesystem paths.
4. Prevent REST, MCP and web Presentation from bypassing Application into PostgreSQL or the simulated legacy service.
5. Keep credentials, JWT signing material and infrastructure secrets out of source control, logs, audit records and client bundles.
6. Maintain durable accountability for significant operator/business actions without turning technical logs into the audit authority.
7. Ensure the MCP tool exposes only the approved read-only customer-safe projection.
8. Make abuse controls proportionate to a public portfolio demo.

---

## 2. Trust boundaries

```text
Internet / reviewer browser
        |
        v
Web client ----------------------> REST API
                                     |
                                     v
                                Application
                                /          \
                               v            v
                       Infrastructure   Domain
                         |    |    |
                         |    |    +--> private evidence volume
                         |    +-------> PostgreSQL
                         +------------> SIMULATED LEGACY SYSTEM

External MCP host ---> MCP Streamable HTTP ---> MCP Presentation ---> Application
```

Trust boundaries:

- browser to REST API;
- MCP host to MCP server;
- REST/MCP Presentation to Application;
- Infrastructure to PostgreSQL;
- Infrastructure to private evidence storage;
- Infrastructure legacy adapter to simulator;
- deployment environment to injected secrets/configuration.

---

## 3. Actor security model

### Demo Customer

Anonymous public actor with no operator session.

Allowed:

- verify synthetic policy/vehicle pair;
- submit a synthetic claim after server validation;
- track a claim using tracking code + associated policy reference.

Denied:

- listing claims;
- state transitions;
- audit access;
- operator evidence browsing beyond public tracking behavior;
- any direct simulator/database access.

### Claims Operator

Authenticated synthetic backoffice identity with one role: `CLAIMS_OPERATOR`.

Allowed:

- list claims;
- view claim detail/evidence allowed by requirements;
- request valid state transitions.

Denied:

- direct database access through business APIs;
- transitions outside Domain rules;
- arbitrary audit mutation/deletion;
- privileged roles not defined in the MVP.

### MCP Client

Public/demo integration actor using only the approved read-only claim-status tool.

Allowed:

- customer-safe status lookup with the same proof pair as public tracking.

Denied:

- claim creation;
- mutations;
- operator data;
- audit data;
- raw evidence retrieval unless later explicitly approved;
- simulator/database access.

---

## 4. Authentication model

Backoffice uses short-lived bearer JWT access tokens.

Policy:

- access token target lifetime: 15 minutes;
- no refresh token/session database in mandatory MVP;
- issuer/audience values configured explicitly;
- signing key injected through environment/secret;
- minimal claims only: subject/operator ID, role, issuer, audience, issued/expiry times;
- no password, policy, claim or evidence data inside JWT;
- every protected operation verifies token signature/expiry and server-side role/permission intent;
- web client hiding a control is never authorization evidence.

Password storage:

- preferred adapter: Argon2id;
- synthetic seed password must be configurable for demo setup and documented as demo-only;
- repository must never store plaintext production-like credentials;
- `.env.example` contains placeholders only.

Login abuse controls:

- rate limiting by safe request context;
- generic invalid-credential response;
- failed/successful login audit policy per Audit Model;
- no disclosure of whether a synthetic username exists.

---

## 5. Authorization model

Requirement-level permission intents remain canonical inputs:

- `claims.intake.create`
- `claims.tracking.read`
- `claims.backoffice.read`
- `claims.backoffice.transition`
- `claims.mcp.status.read`

Architecture rules:

- API/Application authorizes every protected operation;
- Domain authorizes transition legality by current state;
- MCP only binds to `claims.mcp.status.read` customer-safe behavior;
- customer tracking proof pair is checked server-side;
- no insecure direct object reference based on sequential database IDs;
- opaque tracking code is not sufficient alone; associated synthetic policy reference is also required.

---

## 6. Public endpoint protection

Applies to policy verification, claim intake, tracking and MCP.

Controls:

- per-route throttling/rate limiting, exact values defined in API Contract;
- body-size limits;
- strict validation and allowlists;
- uniform not-found/invalid-pair responses for tracking;
- correlation/request IDs that are non-secret;
- CORS allowlist appropriate to the demo web origin;
- security headers for browser-facing HTTP where applicable;
- no verbose exception responses.

MCP Streamable HTTP additionally:

- validates allowed `Origin` when present according to active MCP guidance;
- exposes only the one committed read-only tool;
- avoids session state for the MVP by using stateless transport;
- does not accept arbitrary database/query expressions.

---

## 7. Evidence-upload security

Requirements:

- max 5 files;
- max 5 MiB each;
- allow only JPEG, PNG and PDF MIME types;
- customer evidence immutable after submission.

Architecture controls:

1. enforce count and size before acceptance;
2. validate declared MIME and inspect minimal file signature/magic bytes where feasible;
3. never derive storage path from raw user filename;
4. generate server-owned storage key;
5. store outside publicly served web roots;
6. sanitize retained display filename;
7. never execute/process uploaded content as code;
8. return controlled download responses with safe content headers for operator retrieval;
9. no inline HTML/SVG/script uploads;
10. failed database transaction triggers cleanup of newly written orphan files where possible.

Antivirus scanning is not mandatory for this small synthetic MVP, but the storage port keeps room for a future scanning adapter.

---

## 8. Data minimization and redaction

Public tracking/MCP output may expose only:

- tracking code;
- customer-safe summary;
- public status;
- public timeline;
- synthetic next steps.

Never expose publicly:

- operator password hash;
- JWT/signing values;
- audit internals;
- database IDs when not required;
- Prisma/internal errors;
- raw legacy simulator responses;
- filesystem paths;
- request headers containing credentials;
- full technical logs.

Structured logs and audit sanitization must recursively suppress at minimum:

- `authorization`;
- `cookie` if introduced;
- `password` / `passwordHash`;
- JWT/token values;
- API keys/secrets;
- raw file bytes;
- environment secrets.

---

## 9. Secret/configuration policy

Source control may contain:

- `.env.example` placeholders;
- non-secret synthetic IDs/data;
- local public port defaults.

Source control may not contain:

- live JWT signing key;
- real service credentials;
- real insurer data;
- production connection strings;
- secret Kubernetes manifests.

Docker Compose uses environment injection.

Kubernetes proof uses Secret references/templates or local generated secrets, never committed live values.

---

## 10. Threat model

Threat modeling is **applicable** because the MVP has public endpoints, authentication, file uploads, an MCP network endpoint and a legacy integration boundary.

### TM-001 — Tracking enumeration / existence leak

Threat:
Attacker guesses tracking codes/policy references and learns which values exist.

Mitigations:

- require both tracking code and policy reference;
- opaque high-entropy tracking codes;
- generic invalid-pair response;
- rate limiting;
- no partial-validity hints;
- do not log full credentials at info level.

Residual risk: LOW/MEDIUM for public demo.

### TM-002 — Brute-force operator credentials

Threat:
Repeated login attempts against synthetic operator account.

Mitigations:

- modern password hash;
- login rate limiting;
- generic failure response;
- durable/technical evidence per audit policy;
- short-lived JWT.

Residual risk: LOW.

### TM-003 — Stolen/forged JWT

Threat:
Unauthorized backoffice access through token compromise or weak signing.

Mitigations:

- strong environment-injected signing key;
- explicit issuer/audience;
- 15-minute lifetime;
- signature/expiry validation;
- minimal claims;
- HTTPS expected in hosted demo/reverse proxy;
- never log token values.

Residual risk: LOW/MEDIUM in demo depending on hosting.

### TM-004 — IDOR on claim detail/evidence

Threat:
Operator/customer changes identifiers to retrieve another claim/evidence.

Mitigations:

- protected backoffice routes require operator auth;
- customer read uses tracking proof pair, not DB ID;
- evidence retrieval goes through claim authorization/use case;
- opaque identifiers externally.

Residual risk: LOW.

### TM-005 — Invalid state-transition injection

Threat:
Client sends a transition hidden/forbidden by UI.

Mitigations:

- Domain owns transition matrix;
- Application invokes Domain transition behavior;
- API rejects invalid state regardless of UI;
- tests cover negative transitions.

Residual risk: LOW.

### TM-006 — Duplicate/replay claim submission

Threat:
Network retry or malicious replay creates duplicate claims.

Mitigations:

- mandatory idempotency strategy;
- persisted idempotency record;
- same key + incompatible payload produces conflict semantics defined in API Contract;
- transaction protects final creation.

Residual risk: LOW after implementation evidence.

### TM-007 — Malicious file upload / path traversal

Threat:
Executable content, oversized payload, crafted filename or path traversal.

Mitigations:

- type/size/count allowlist;
- server storage key;
- private storage;
- filename sanitation;
- body/upload limits;
- no SVG/HTML/executables;
- controlled retrieval headers.

Residual risk: MEDIUM without antivirus, acceptable for synthetic constrained MVP.

### TM-008 — SQL injection / persistence bypass

Threat:
Untrusted input reaches raw SQL or direct persistence paths.

Mitigations:

- Prisma adapter for normal persistence;
- no controller/MCP Prisma access;
- input validation;
- raw SQL discouraged and requires reviewed parameterization if ever needed;
- architecture fitness tests.

Residual risk: LOW.

### TM-009 — Legacy simulator trust abuse

Threat:
Malformed/untrusted legacy response is treated as valid domain truth or legacy URL is abused.

Mitigations:

- fixed configured simulator base URL;
- no user-supplied target URL;
- Infrastructure DTO validation;
- anti-corruption mapping;
- malformed/timeout response fails closed for claim creation;
- Domain/Application never consume raw wire shape.

Residual risk: LOW.

### TM-010 — MCP data leakage or bypass

Threat:
MCP tool exposes operator/audit data or reads database directly.

Mitigations:

- one allowlisted read-only tool;
- customer-safe Application use case;
- same lookup proof as tracking;
- architecture import test blocks Prisma in MCP Presentation;
- output schema/redaction tests;
- rate limiting/origin validation.

Residual risk: LOW.

### TM-011 — Secret leakage through logs/errors/audit

Threat:
Tokens, passwords, legacy payloads or paths are persisted or returned.

Mitigations:

- centralized redaction;
- RFC 9457 safe error mapper;
- explicit forbidden-field tests;
- separate audit DTOs containing minimum metadata;
- no request-body blanket logging.

Residual risk: LOW/MEDIUM until QA proves sanitization.

### TM-012 — Audit tampering

Threat:
Normal application path edits/deletes accountability records.

Mitigations:

- append-oriented AuditPort/repository;
- no ordinary update/delete business use case;
- DB role/schema permissions tightened where practical in demo;
- transaction includes state-transition audit;
- audit QA verifies immutability behavior.

Residual risk: LOW for MVP.

### TM-013 — DNS rebinding/origin abuse on MCP HTTP

Threat:
Browser-originated requests target local MCP service improperly.

Mitigations:

- validate Origin per MCP transport guidance;
- bind/host intentionally;
- CORS/origin allowlist;
- no privileged mutation tools.

Residual risk: LOW.

### TM-014 — Denial of service through public endpoints

Threat:
Large/repeated validation, tracking, upload or MCP requests consume resources.

Mitigations:

- throttling;
- request and upload size caps;
- timeouts on simulator calls;
- stateless MCP;
- Kubernetes/Docker resource limits;
- health probes.

Residual risk: MEDIUM for public hobby/demo hosting, acceptable with documented constraints.

---

## 11. Security verification obligations

Later implementation/QA must prove:

- unauthenticated backoffice access denied;
- invalid/expired JWT denied;
- invalid claim transition cannot mutate state;
- tracking wrong pair leaks no partial validity;
- upload limit/type/path controls;
- MCP cannot mutate and returns customer-safe fields only;
- no Prisma import/use from REST/MCP Presentation;
- secrets absent from Problem Details/log/audit fixtures;
- rate-limit behavior for selected public/auth routes;
- audit record exists for required critical actions.

---

## 12. Security readiness mapping

This artifact provides evidence for:

- `architecture.security_model`
- `architecture.threat_model`

It also supports later:

- `api.auth_contract`
- `api.permission_matrix`
- `api.security_qa`
- `qa.security`
- `release.security_accepted`

The security/threat design is ready for human review but cannot self-approve `architecture_ready`.