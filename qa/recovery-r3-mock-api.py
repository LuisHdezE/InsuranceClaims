from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
ADMIN_ID = "00000000-0000-4000-8000-000000000094"
EVENT_ID = "88888888-8888-4888-8888-888888888888"
DEAD_LETTER_ID = "77777777-7777-4777-8777-777777777777"

DEAD_LETTERS = [
    {
        "deadLetterId": DEAD_LETTER_ID,
        "jobType": "SYNTHETIC_EXPORT_JOB",
        "status": "DEAD_LETTER",
        "attemptCount": 3,
        "maxAttempts": 5,
        "availableAt": "2026-09-21T12:00:00.000Z",
        "correlationId": "synthetic-recovery-export",
        "failureCategory": "DOWNSTREAM_TIMEOUT",
        "completedAt": None,
        "version": 3,
    },
    {
        "deadLetterId": "77777777-7777-4777-8777-777777777778",
        "jobType": "SYNTHETIC_NOTIFICATION_JOB",
        "status": "DEAD_LETTER",
        "attemptCount": 5,
        "maxAttempts": 5,
        "availableAt": "2026-09-21T11:10:00.000Z",
        "correlationId": "synthetic-recovery-notification",
        "failureCategory": "PROVIDER_UNAVAILABLE",
        "completedAt": None,
        "version": 8,
    },
    {
        "deadLetterId": "77777777-7777-4777-8777-777777777779",
        "jobType": "SYNTHETIC_IMPORT_JOB",
        "status": "DEAD_LETTER",
        "attemptCount": 2,
        "maxAttempts": 4,
        "availableAt": "2026-09-21T10:20:00.000Z",
        "correlationId": "synthetic-recovery-import",
        "failureCategory": "REMOTE_VALIDATION_ERROR",
        "completedAt": None,
        "version": 2,
    },
]

EVENT = {
    "eventId": EVENT_ID,
    "externalEventId": "synthetic-ext-recovery-001",
    "eventType": "SYNTHETIC_POLICY_UPDATED",
    "ingestionStatus": "ACCEPTED",
    "processingStatus": "FAILED",
    "acceptedAt": "2026-09-21T11:45:00.000Z",
    "processedAt": "2026-09-21T11:45:04.000Z",
    "failureCategory": "DOWNSTREAM_TIMEOUT",
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health/live":
            self._json(200, {"status": "ok"})
            return

        if path == "/api/v1/admin/dead-letters":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            start = (page - 1) * page_size
            total = len(DEAD_LETTERS)
            self._json(200, {
                "items": DEAD_LETTERS[start:start + page_size],
                "page": page,
                "pageSize": page_size,
                "totalItems": total,
                "totalPages": max(1, (total + page_size - 1) // page_size),
            })
            return

        if path == f"/api/v1/admin/dead-letters/{DEAD_LETTER_ID}":
            self._json(200, DEAD_LETTERS[0])
            return

        if path == f"/api/v1/admin/integration-events/{EVENT_ID}":
            self._json(200, EVENT)
            return

        self._json(404, {"error": "not_found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("content-length", "0"))
        raw = self.rfile.read(length) if length else b""

        if path == "/api/v1/operator/auth/login":
            self._json(200, {
                "accessToken": "recovery-r3-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": ADMIN_ID,
                    "login": "demo.admin@eliasworks.invalid",
                    "role": "PLATFORM_ADMIN",
                },
            })
            return

        if path in {
            f"/api/v1/admin/dead-letters/{DEAD_LETTER_ID}/requeue",
            f"/api/v1/admin/dead-letters/{DEAD_LETTER_ID}/resolve",
        }:
            payload = json.loads(raw.decode("utf-8")) if raw else {}
            if payload.get("expectedVersion") != 3:
                self._json(409, {"status": 409, "code": "CONCURRENCY_CONFLICT"})
                return
            status = "PENDING" if path.endswith("/requeue") else "CANCELLED"
            self._json(200, {
                **DEAD_LETTERS[0],
                "status": status,
                "version": 4,
                "completedAt": None if status == "PENDING" else "2026-09-21T12:30:00.000Z",
            })
            return

        self._json(404, {"error": "not_found", "path": path})

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Request-Id", "recovery-r3-viewport")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
