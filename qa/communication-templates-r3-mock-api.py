from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
OPERATOR_ID = "00000000-0000-4000-8000-000000000126"
DEFINITION_ID = "communication-template-visual-001"
ACTIVE_VERSION_ID = "00000000-0000-4000-8000-000000000301"
DRAFT_VERSION_ID = "00000000-0000-4000-8000-000000000302"

TEMPLATES = [
    {
        "definitionId": DEFINITION_ID,
        "key": "claim.status.notice",
        "channel": "EMAIL",
        "enabled": True,
        "activeVersionId": ACTIVE_VERSION_ID,
        "version": 7,
        "createdAt": "2026-08-28T12:00:00.000Z",
        "updatedAt": "2026-09-18T16:00:00.000Z",
        "versions": [
            {
                "versionId": ACTIVE_VERSION_ID,
                "versionNumber": 3,
                "status": "ACTIVE",
                "subject": "Actualización de tu siniestro",
                "body": "Hola {{customerName}}, tu siniestro {{claimNumber}} fue actualizado.",
                "variableSchema": {
                    "customerName": "STRING",
                    "claimNumber": "STRING",
                    "priority": "NUMBER",
                    "requiresAction": "BOOLEAN",
                },
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-01T12:00:00.000Z",
                "activatedAt": "2026-09-03T09:30:00.000Z",
                "retiredAt": None,
            },
            {
                "versionId": DRAFT_VERSION_ID,
                "versionNumber": 4,
                "status": "DRAFT",
                "subject": "Hay una novedad en tu siniestro",
                "body": "Hola {{customerName}}, revisa la nueva información de {{claimNumber}}.",
                "variableSchema": {
                    "customerName": "STRING",
                    "claimNumber": "STRING",
                },
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-18T16:00:00.000Z",
                "activatedAt": None,
                "retiredAt": None,
            },
        ],
    },
    {
        "definitionId": "communication-template-visual-002",
        "key": "collection.reminder.whatsapp",
        "channel": "WHATSAPP",
        "enabled": False,
        "activeVersionId": None,
        "version": 2,
        "createdAt": "2026-09-01T12:00:00.000Z",
        "updatedAt": "2026-09-17T10:00:00.000Z",
        "versions": [
            {
                "versionId": "00000000-0000-4000-8000-000000000311",
                "versionNumber": 1,
                "status": "DRAFT",
                "subject": None,
                "body": "Hola {{customerName}}, tienes un saldo pendiente de {{amount}}.",
                "variableSchema": {"customerName": "STRING", "amount": "NUMBER"},
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-17T10:00:00.000Z",
                "activatedAt": None,
                "retiredAt": None,
            }
        ],
    },
    {
        "definitionId": "communication-template-visual-003",
        "key": "renewal.confirmation.email",
        "channel": "EMAIL",
        "enabled": True,
        "activeVersionId": "00000000-0000-4000-8000-000000000321",
        "version": 4,
        "createdAt": "2026-08-29T12:00:00.000Z",
        "updatedAt": "2026-09-16T10:00:00.000Z",
        "versions": [
            {
                "versionId": "00000000-0000-4000-8000-000000000321",
                "versionNumber": 2,
                "status": "ACTIVE",
                "subject": "Renovación confirmada",
                "body": "Tu póliza {{policyNumber}} fue renovada.",
                "variableSchema": {"policyNumber": "STRING"},
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-02T12:00:00.000Z",
                "activatedAt": "2026-09-04T09:30:00.000Z",
                "retiredAt": None,
            }
        ],
    },
]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health/live":
            self._json(200, {"status": "ok"})
            return

        if path == "/api/v1/admin/communication-templates":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total_items = len(TEMPLATES)
            start = (page - 1) * page_size
            end = start + page_size
            self._json(
                200,
                {
                    "items": TEMPLATES[start:end],
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total_items,
                    "totalPages": (total_items + page_size - 1) // page_size,
                },
                {"X-Request-Id": "communication-templates-r3-list"},
            )
            return

        if path == f"/api/v1/admin/communication-templates/{DEFINITION_ID}":
            self._json(200, TEMPLATES[0], {"X-Request-Id": "communication-templates-r3-detail"})
            return

        self._json(404, {"error": "not_found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)

        if path == "/api/v1/operator/auth/login":
            self._json(
                200,
                {
                    "accessToken": "communication-templates-r3-visual-qa-token",
                    "tokenType": "Bearer",
                    "expiresIn": 900,
                    "operator": {
                        "id": OPERATOR_ID,
                        "login": "platform.admin@eliasworks.invalid",
                        "role": "PLATFORM_ADMIN",
                    },
                },
                {"X-Request-Id": "communication-templates-r3-login"},
            )
            return

        self._json(404, {"error": "not_found", "path": path})

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
