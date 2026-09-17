from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 3000

METRICS = {
    "window": {
        "from": "2026-08-18T12:00:00.000Z",
        "to": "2026-09-17T12:00:00.000Z",
        "semantics": "[from,to)",
    },
    "generatedAt": "2026-09-17T12:00:00.000Z",
    "openClaims": 24,
    "reportedInWindow": 13,
    "claimsByStatus": {
        "RECEIVED": 6,
        "UNDER_REVIEW": 8,
        "OBSERVED": 3,
        "APPROVED": 4,
        "IN_REPAIR": 3,
        "CLOSED": 17,
    },
    "claimsByOperationalStage": [
        {"stageKey": "INTAKE", "displayName": "Ingreso", "count": 6},
        {"stageKey": "ASSESSMENT", "displayName": "Evaluación", "count": 9},
        {"stageKey": "EVIDENCE", "displayName": "Evidencia", "count": 5},
        {"stageKey": "RESOLUTION", "displayName": "Resolución", "count": 4},
    ],
    "evidencePendingReviewClaims": 5,
    "openTasks": 11,
    "overdueTasks": 3,
    "closedClaims": 17,
}

TASKS = {
    "items": [
        {
            "taskId": "task-visual-001",
            "claimId": "claim-visual-001",
            "trackingCode": "CLM-2026-1842",
            "policyReference": "POL-80421",
            "vehicleReference": "SBC 2481",
            "type": "CLAIM_REVIEW",
            "title": "Revisar declaración inicial",
            "description": None,
            "status": "OPEN",
            "priority": "HIGH",
            "queue": "CLAIMS",
            "assignedOperatorId": None,
            "dueAt": "2026-09-17T15:00:00.000Z",
            "version": 1,
            "createdByType": "SYSTEM",
            "createdById": None,
            "correlationId": None,
            "createdAt": "2026-09-16T12:00:00.000Z",
            "updatedAt": "2026-09-16T12:00:00.000Z",
            "completedAt": None,
            "completedById": None,
            "cancelledAt": None,
            "cancelledById": None,
            "cancellationReason": None,
        },
        {
            "taskId": "task-visual-002",
            "claimId": "claim-visual-002",
            "trackingCode": "CLM-2026-1839",
            "policyReference": "POL-80398",
            "vehicleReference": "SDA 7712",
            "type": "EVIDENCE_REVIEW",
            "title": "Validar evidencia fotográfica",
            "description": None,
            "status": "OPEN",
            "priority": "NORMAL",
            "queue": "CLAIMS",
            "assignedOperatorId": None,
            "dueAt": "2026-09-18T14:00:00.000Z",
            "version": 1,
            "createdByType": "SYSTEM",
            "createdById": None,
            "correlationId": None,
            "createdAt": "2026-09-16T13:00:00.000Z",
            "updatedAt": "2026-09-16T13:00:00.000Z",
            "completedAt": None,
            "completedById": None,
            "cancelledAt": None,
            "cancelledById": None,
            "cancellationReason": None,
        },
        {
            "taskId": "task-visual-003",
            "claimId": "claim-visual-003",
            "trackingCode": "CLM-2026-1832",
            "policyReference": "POL-80351",
            "vehicleReference": "SAA 5309",
            "type": "CLAIM_REVIEW",
            "title": "Confirmar datos de cobertura",
            "description": None,
            "status": "OPEN",
            "priority": "NORMAL",
            "queue": "CLAIMS",
            "assignedOperatorId": None,
            "dueAt": "2026-09-19T11:00:00.000Z",
            "version": 1,
            "createdByType": "SYSTEM",
            "createdById": None,
            "correlationId": None,
            "createdAt": "2026-09-15T16:00:00.000Z",
            "updatedAt": "2026-09-15T16:00:00.000Z",
            "completedAt": None,
            "completedById": None,
            "cancelledAt": None,
            "cancelledById": None,
            "cancellationReason": None,
        },
    ],
    "page": 1,
    "pageSize": 5,
    "totalItems": 3,
    "totalPages": 1,
}

CLAIMS = {
    "items": [
        {
            "claimId": "claim-visual-001",
            "trackingCode": "CLM-2026-1842",
            "status": "RECEIVED",
            "occurredAt": "2026-09-17T08:30:00.000Z",
            "policyReference": "POL-80421",
            "vehicleReference": "SBC 2481",
            "operationalStage": {"stageKey": "INTAKE", "displayName": "Ingreso", "sortOrder": 1},
            "operationalWorkItemVersion": 2,
            "createdAt": "2026-09-17T08:42:00.000Z",
        },
        {
            "claimId": "claim-visual-002",
            "trackingCode": "CLM-2026-1839",
            "status": "RECEIVED",
            "occurredAt": "2026-09-16T19:10:00.000Z",
            "policyReference": "POL-80398",
            "vehicleReference": "SDA 7712",
            "operationalStage": {"stageKey": "ASSESSMENT", "displayName": "Evaluación", "sortOrder": 2},
            "operationalWorkItemVersion": 4,
            "createdAt": "2026-09-16T19:28:00.000Z",
        },
        {
            "claimId": "claim-visual-003",
            "trackingCode": "CLM-2026-1832",
            "status": "RECEIVED",
            "occurredAt": "2026-09-16T11:45:00.000Z",
            "policyReference": "POL-80351",
            "vehicleReference": "SAA 5309",
            "operationalStage": {"stageKey": "EVIDENCE", "displayName": "Evidencia", "sortOrder": 3},
            "operationalWorkItemVersion": 3,
            "createdAt": "2026-09-16T12:02:00.000Z",
        },
    ],
    "page": 1,
    "pageSize": 6,
    "totalItems": 3,
    "totalPages": 1,
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health/live":
            self._json(200, {"status": "ok"})
            return
        if path == "/api/v1/operator/analytics/claims":
            self._json(200, METRICS, {"X-Request-Id": "dashboard-visual-qa-metrics"})
            return
        if path == "/api/v1/operator/tasks":
            self._json(200, TASKS, {"X-Request-Id": "dashboard-visual-qa-tasks"})
            return
        if path == "/api/v1/operator/claims":
            self._json(200, CLAIMS, {"X-Request-Id": "dashboard-visual-qa-claims"})
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
                "accessToken": "dashboard-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": "dashboard-visual-qa-supervisor",
                    "login": "claims.supervisor@visual-qa.invalid",
                    "role": "CLAIMS_SUPERVISOR",
                },
            },
            {"X-Request-Id": "dashboard-visual-qa-login"},
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
