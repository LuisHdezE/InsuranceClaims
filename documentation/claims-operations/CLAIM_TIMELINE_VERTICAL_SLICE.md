# Claim Operations Timeline Vertical Slice

Status: implementation candidate for the approved post-MVP Claims Operations Experience Increment.

## Purpose

Provide operators with one chronological operational projection of meaningful Claim activity without creating a second source of truth and without exposing raw audit detail as the working timeline.

This slice remains part of the synthetic technical case study. It does not represent FAR production workflow.

## Separation of concerns

Three timelines intentionally remain different:

1. **Operator Timeline**: operational projection for staff work.
2. **Audit Log**: technical/security trace retained separately and still visible only in its secondary audit surface.
3. **Public Tracking Timeline**: customer-safe status projection only.

The operator timeline must never become a raw dump of `audit_events`, and the public tracking endpoint must never inherit operator-only task/evidence activity.

## P0 event families

- `CLAIM_REPORTED`
- `EVIDENCE_ADDED`
- `STATUS_CHANGED`
- `TASK_CREATED`
- `TASK_COMPLETED`

No communication, insurer-response, SLA, payment, repair or legacy-verification event is synthesized in this slice because those durable facts are not yet modeled.

## Sources

The timeline is a read projection derived from existing authoritative data:

- `claim_status_history` -> `CLAIM_REPORTED`, `STATUS_CHANGED`
- `claim_evidence` metadata -> `EVIDENCE_ADDED`
- `claim_tasks` -> `TASK_CREATED`, `TASK_COMPLETED`

No `claim_timeline` table is introduced.

### Evidence association time

Evidence is staged before the Claim transaction commits. For the operational projection, an initial evidence item cannot appear as associated with a Claim before that Claim exists. Therefore the projected event time is the later of:

- evidence storage timestamp; or
- Claim creation timestamp.

This is a projection rule, not a mutation of the stored evidence timestamp.

## Application contract

`ClaimTimelineApplication` owns composition of the read model. It depends only on Application ports:

- `ClaimRepository`
- `ClaimTaskRepository`

It requires `claims.backoffice.read` and returns typed semantic events. Presentation is responsible for localized labels and visual treatment.

## REST increment

### GET `/api/v1/operator/claims/{claimId}/timeline`

Requires the existing operator bearer token and `claims.backoffice.read` permission.

Response shape:

```json
{
  "claimId": "uuid",
  "trackingCode": "synthetic tracking code",
  "events": [
    {
      "eventId": "history:uuid",
      "eventType": "CLAIM_REPORTED",
      "source": "CLAIM_HISTORY",
      "occurredAt": "RFC3339",
      "actorType": "SYSTEM",
      "actorId": null,
      "status": "RECEIVED"
    }
  ],
  "totalItems": 1
}
```

Events are returned in deterministic chronological order. Same-timestamp events use a stable semantic ordering so the projection remains reproducible.

## UI target

The existing Claim Operations Detail timeline card evolves from status-history-only to the combined operational timeline.

The card should show:

- event icon/tone by semantic event family;
- localized event title;
- concise detail;
- actor label when durable actor information exists;
- exact date/time;
- total event count.

The technical audit table remains in the separate collapsible section below the operational workspace.

## Acceptance criteria

- [ ] Timeline endpoint is authentication-protected.
- [ ] Claim creation produces `CLAIM_REPORTED`.
- [ ] Claim evidence produces `EVIDENCE_ADDED` without exposing storage paths.
- [ ] Initial ClaimTask projection produces `TASK_CREATED` entries.
- [ ] Task completion produces `TASK_COMPLETED`.
- [ ] Claim transition produces `STATUS_CHANGED`.
- [ ] Timeline is deterministic and chronological.
- [ ] Raw audit `eventCode`, request IDs and technical metadata are absent from the timeline response.
- [ ] Public tracking remains status-only and customer-safe.
- [ ] No new database table is introduced.
- [ ] Memory and PostgreSQL runtime use the same Application projection.
- [ ] Claim Detail renders the timeline responsively in the approved Claims Operations identity.

## Explicit non-goals

No communication timeline, webhook timeline, SLA timeline, generic event store, CQRS infrastructure, notification center, insurer production events, customer-message events or editable timeline entries are introduced in this slice.
