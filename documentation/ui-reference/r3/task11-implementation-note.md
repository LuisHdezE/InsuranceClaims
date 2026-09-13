# Task 11 · Public Customer Journey R3 implementation note

Implementation branch: `feat/r3-parallel-12-public-customer-journey`.

This task implements the approved `public-customer-journey-r3-approved.md` boundary. R3 does not publish an authenticated customer portal. The public product remains limited to two functional journeys: reporting a claim and tracking its public status.

No backend route, API contract, RBAC policy, claim lifecycle rule, tracking proof, evidence rule or idempotency behavior is changed by this increment. Presentation work focuses on removing non-functional capabilities from the primary action surface, renaming operator access to `Acceso equipo`, keeping public navigation available on small screens, and visually harmonizing landing, report flow and tracking flow.
