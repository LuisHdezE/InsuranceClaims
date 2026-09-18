from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 3000
CLAIM_ID = "claim-visual-detail-001"
TRACKING = "CLM-2026-1842"

DETAIL = {
    "claimId": CLAIM_ID,
    "trackingCode": TRACKING,
    "policyReference": "POL-80421",
    "vehicleReference": "SBC 2481",
    "verifiedCustomerLabel": "María Rodríguez",
    "eventType": "COLLISION",
    "occurredAt": "2026-09-17T08:30:00.000Z",
    "locationText": "Av. Italia y Propios, Montevideo",
    "description": "Colisión lateral durante circulación urbana. El vehículo conserva movilidad y se registró evidencia fotográfica inicial.",
    "status": "UNDER_REVIEW",
    "allowedTransitions": ["OBSERVED", "APPROVED"],
    "evidence": [
        {
            "evidenceId": "evidence-visual-001",
            "mediaType": "image/jpeg",
            "sizeBytes": 248320,
            "displayFilename": "lateral-derecho.jpg",
            "createdAt": "2026-09-17T08:41:00.000Z",
        },
        {
            "evidenceId": "evidence-visual-002",
            "mediaType": "application/pdf",
            "sizeBytes": 97280,
            "displayFilename": "declaracion.pdf",
            "createdAt": "2026-09-17T08:44:00.000Z",
        },
    ],
    "history": [
        {
            "fromStatus": None,
            "toStatus": "RECEIVED",
            "actorType": "SYSTEM",
            "actorId": None,
            "occurredAt": "2026-09-17T08:42:00.000Z",
        },
        {
            "fromStatus": "RECEIVED",
            "toStatus": "UNDER_REVIEW",
            "actorType": "OPERATOR",
            "actorId": "operator-visual-001",
            "occurredAt": "2026-09-17T09:05:00.000Z",
        },
    ],
    "auditEvents": [
        {
            "eventCode": "CLAIM_CREATED",
            "occurredAt": "2026-09-17T08:42:00.000Z",
            "actorType": "CUSTOMER_PUBLIC",
            "actorId": None,
            "outcome": "SUCCESS",
            "requestId": "req-visual-created",
        },
        {
            "eventCode": "CLAIM_STATE_TRANSITIONED",
            "occurredAt": "2026-09-17T09:05:00.000Z",
            "actorType": "OPERATOR",
            "actorId": "operator-visual-001",
            "outcome": "SUCCESS",
            "requestId": "req-visual-transition",
        },
    ],
    "createdAt": "2026-09-17T08:42:00.000Z",
    "updatedAt": "2026-09-17T09:05:00.000Z",
}

CLAIMS_PAGE = {
    "items": [
        {
            "claimId": CLAIM_ID,
            "trackingCode": TRACKING,
            "status": "UNDER_REVIEW",
            "occurredAt": "2026-09-17T08:30:00.000Z",
            "policyReference": "POL-80421",
            "vehicleReference": "SBC 2481",
            "operationalStage": {
                "stageKey": "ASSESSMENT",
                "displayName": "Evaluación",
                "sortOrder": 2,
            },
            "operationalWorkItemVersion": 4,
            "createdAt": "2026-09-17T08:42:00.000Z",
        }
    ],
    "page": 1,
    "pageSize": 100,
    "totalItems": 1,
    "totalPages": 1,
}

TASKS = [
    {
        "taskId": "task-visual-001",
        "claimId": CLAIM_ID,
        "trackingCode": TRACKING,
        "policyReference": "POL-80421",
        "vehicleReference": "SBC 2481",
        "type": "CLAIM_REVIEW",
        "title": "Revisar declaración inicial",
        "description": None,
        "status": "OPEN",
        "priority": "HIGH",
        "queue": "CLAIMS",
        "assignedOperatorId": None,
        "dueAt": "2026-09-18T14:00:00.000Z",
        "version": 2,
        "createdByType": "SYSTEM",
        "createdById": None,
        "correlationId": None,
        "createdAt": "2026-09-17T08:43:00.000Z",
        "updatedAt": "2026-09-17T08:43:00.000Z",
        "completedAt": None,
        "completedById": None,
        "cancelledAt": None,
        "cancelledById": None,
        "cancellationReason": None,
    },
    {
        "taskId": "task-visual-002",
        "claimId": CLAIM_ID,
        "trackingCode": TRACKING,
        "policyReference": "POL-80421",
        "vehicleReference": "SBC 2481",
        "type": "EVIDENCE_REVIEW",
        "title": "Validar evidencia fotográfica",
        "description": None,
        "status": "OPEN",
        "priority": "NORMAL",
        "queue": "CLAIMS",
        "assignedOperatorId": None,
        "dueAt": "2026-09-19T12:00:00.000Z",
        "version": 1,
        "createdByType": "SYSTEM",
        "createdById": None,
        "correlationId": None,
        "createdAt": "2026-09-17T08:45:00.000Z",
        "updatedAt": "2026-09-17T08:45:00.000Z",
        "completedAt": None,
        "completedById": None,
        "cancelledAt": None,
        "cancelledById": None,
        "cancellationReason": None,
    },
]

EVIDENCE_ATTENTION = {
    "claimId": CLAIM_ID,
    "trackingCode": TRACKING,
    "attentionState": "PENDING_REVIEW",
    "evidenceCount": 2,
    "evidence": [
        {
            "evidenceId": "evidence-visual-001",
            "mediaType": "image/jpeg",
            "sizeBytes": 248320,
            "displayFilename": "lateral-derecho.jpg",
            "createdAt": "2026-09-17T08:41:00.000Z",
        },
        {
            "evidenceId": "evidence-visual-002",
            "mediaType": "application/pdf",
            "sizeBytes": 97280,
            "displayFilename": "declaracion.pdf",
            "createdAt": "2026-09-17T08:44:00.000Z",
        },
    ],
    "reviewTasks": [
        {
            "taskId": "task-visual-002",
            "title": "Validar evidencia fotográfica",
            "status": "OPEN",
            "priority": "NORMAL",
            "assignedOperatorId": None,
            "createdAt": "2026-09-17T08:45:00.000Z",
            "completedAt": None,
            "completedById": None,
        }
    ],
    "openReviewTaskCount": 1,
    "completedReviewTaskCount": 0,
}

TIMELINE = {
    "claimId": CLAIM_ID,
    "trackingCode": TRACKING,
    "events": [
        {
            "eventId": "timeline-1",
            "eventType": "CLAIM_REPORTED",
            "source": "CLAIM_HISTORY",
            "occurredAt": "2026-09-17T08:42:00.000Z",
            "actorType": "SYSTEM",
            "actorId": None,
            "status": "RECEIVED",
        },
        {
            "eventId": "timeline-2",
            "eventType": "EVIDENCE_ADDED",
            "source": "CLAIM_EVIDENCE",
            "occurredAt": "2026-09-17T08:44:00.000Z",
            "actorType": "SYSTEM",
            "actorId": None,
            "evidenceId": "evidence-visual-002",
            "displayFilename": "declaracion.pdf",
            "mediaType": "application/pdf",
        },
        {
            "eventId": "timeline-3",
            "eventType": "TASK_CREATED",
            "source": "CLAIM_TASK",
            "occurredAt": "2026-09-17T08:45:00.000Z",
            "actorType": "SYSTEM",
            "actorId": None,
            "taskId": "task-visual-002",
            "taskType": "EVIDENCE_REVIEW",
            "taskTitle": "Validar evidencia fotográfica",
        },
        {
            "eventId": "timeline-4",
            "eventType": "STATUS_CHANGED",
            "source": "CLAIM_HISTORY",
            "occurredAt": "2026-09-17T09:05:00.000Z",
            "actorType": "OPERATOR",
            "actorId": "operator-visual-001",
            "fromStatus": "RECEIVED",
            "toStatus": "UNDER_REVIEW",
        },
    ],
    "totalItems": 4,
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health/live":
            self._json(200, {"status": "ok"})
            return
        if path == "/api/v1/operator/claims":
            self._json(200, CLAIMS_PAGE, {"X-Request-Id": "claim-detail-list"})
            return
        if path == f"/api/v1/operator/claims/{CLAIM_ID}":
            self._json(200, DETAIL, {"X-Request-Id": "claim-detail-detail"})
            return
        if path == f"/api/v1/operator/claims/{CLAIM_ID}/tasks":
            self._json(200, TASKS, {"X-Request-Id": "claim-detail-tasks"})
            return
        if path == f"/api/v1/operator/claims/{CLAIM_ID}/evidence-attention":
            self._json(200, EVIDENCE_ATTENTION, {"X-Request-Id": "claim-detail-evidence"})
            return
        if path == f"/api/v1/operator/claims/{CLAIM_ID}/timeline":
            self._json(200, TIMELINE, {"X-Request-Id": "claim-detail-timeline"})
            return
        self._json(404, {"error": "not_found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        if path != "/api/v1/operator/auth/login":
            self._json(404, {"error": "not_found", "path": path})
            return

        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)

        self._json(
            200,
            {
                "accessToken": "claim-detail-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": "00000000-0000-4000-8000-000000000096",
                    "login": "demo.operator@eliasworks.invalid",
                    "role": "CLAIMS_OPERATOR",
                },
            },
            {"X-Request-Id": "claim-detail-login"},
        )

    def _json(self, status: int, payload: object, extra_headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
