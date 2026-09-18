from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

HOST = "127.0.0.1"
PORT = 3000
SUPERVISOR_ID = "00000000-0000-4000-8000-000000000197"

METRICS = {
    "window": {
        "from": "2026-08-19T12:00:00.000Z",
        "to": "2026-09-18T12:00:00.000Z",
        "semantics": "[from,to)",
    },
    "generatedAt": "2026-09-18T12:00:00.000Z",
    "openClaims": 128,
    "reportedInWindow": 42,
    "claimsByStatus": {
        "RECEIVED": 48,
        "UNDER_REVIEW": 61,
        "OBSERVED": 20,
        "APPROVED": 26,
        "IN_REPAIR": 35,
        "CLOSED": 72,
    },
    "claimsByOperationalStage": [
        {"stageKey": "INTAKE", "displayName": "Ingreso", "count": 52},
        {"stageKey": "ASSESSMENT", "displayName": "Evaluación", "count": 63},
        {"stageKey": "RESOLUTION", "displayName": "Resolución", "count": 37},
        {"stageKey": "REPAIR", "displayName": "Reparación", "count": 26},
        {"stageKey": "CLOSURE", "displayName": "Cierre operativo", "count": 16},
    ],
    "evidencePendingReviewClaims": 17,
    "openTasks": 64,
    "overdueTasks": 9,
    "closedClaims": 311,
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
            self._json(
                200,
                {"items": [], "page": 1, "pageSize": 100, "totalItems": 0, "totalPages": 0},
                {"X-Request-Id": "analytics-visual-claims"},
            )
            return

        if path == "/api/v1/operator/tasks":
            self._json(
                200,
                {"items": [], "page": 1, "pageSize": 100, "totalItems": 0, "totalPages": 0},
                {"X-Request-Id": "analytics-visual-tasks"},
            )
            return

        if path == "/api/v1/operator/analytics/claims":
            self._json(200, METRICS, {"X-Request-Id": "analytics-visual-metrics"})
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
                "accessToken": "analytics-r3-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": SUPERVISOR_ID,
                    "login": "analytics.supervisor@eliasworks.invalid",
                    "role": "CLAIMS_SUPERVISOR",
                },
            },
            {"X-Request-Id": "analytics-visual-login"},
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
