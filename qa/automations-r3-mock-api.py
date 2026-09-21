from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
ADMIN_ID = "00000000-0000-4000-8000-000000000094"

DEFINITIONS = [
    {
        "definitionId": "a5000000-0000-4000-8000-000000000001",
        "key": "demo.claim-intake-review",
        "displayName": "Revisión inicial automática",
        "enabled": True,
        "activeVersionId": "a5100000-0000-4000-8000-000000000002",
        "version": 3,
        "createdAt": "2026-09-08T12:00:00.000Z",
        "updatedAt": "2026-09-18T12:00:00.000Z",
        "versions": [
            {
                "versionId": "a5100000-0000-4000-8000-000000000001",
                "versionNumber": 1,
                "status": "RETIRED",
                "content": {
                    "when": {"eventType": "CLAIM_CREATED"},
                    "if": [{"field": "demoPortfolioSafe", "operator": "EQ", "value": True}],
                    "wait": None,
                    "then": [{"key": "create_review_task", "type": "CREATE_TASK", "parameters": {"priority": "NORMAL"}}],
                },
                "sourceClassification": "SYNTHETIC_DEMO",
                "createdByType": "SYSTEM",
                "createdById": None,
                "createdAt": "2026-09-08T12:00:00.000Z",
                "activatedAt": "2026-09-09T12:00:00.000Z",
                "retiredAt": "2026-09-18T12:00:00.000Z",
            },
            {
                "versionId": "a5100000-0000-4000-8000-000000000002",
                "versionNumber": 2,
                "status": "ACTIVE",
                "content": {
                    "when": {"eventType": "CLAIM_CREATED"},
                    "if": [{"field": "demoPortfolioSafe", "operator": "EQ", "value": True}],
                    "wait": None,
                    "then": [{"key": "create_review_task", "type": "CREATE_TASK", "parameters": {"priority": "HIGH"}}],
                },
                "sourceClassification": "SYNTHETIC_DEMO",
                "createdByType": "SYSTEM",
                "createdById": None,
                "createdAt": "2026-09-18T12:00:00.000Z",
                "activatedAt": "2026-09-18T12:00:00.000Z",
                "retiredAt": None,
            },
        ],
    },
]

TRIGGERS = [
    ("CLAIM_STATE_TRANSITIONED", "Aviso por cambio de estado", True, "REQUEST_COMMUNICATION"),
    ("CLAIM_TASK_COMPLETED", "Continuidad tras completar tarea", True, "MOVE_OPERATIONAL_STAGE"),
    ("COMMUNICATION_DELIVERED", "Marca de comunicación entregada", True, "ADD_OPERATIONAL_TAG"),
    ("INBOUND_EVENT_PROCESSED", "Atención de evento integrado", False, "NOTIFY_OPERATOR"),
    ("SCHEDULED_CHECK", "Revisión programada de inactividad", False, "SCHEDULE_CHECK"),
]

for index, (trigger, name, enabled, action_type) in enumerate(TRIGGERS, start=2):
    definition_id = f"a5000000-0000-4000-8000-{index:012d}"
    version_id = f"a5100000-0000-4000-8000-{index + 1:012d}"
    DEFINITIONS.append(
        {
            "definitionId": definition_id,
            "key": f"demo.rule-{index}",
            "displayName": name,
            "enabled": enabled,
            "activeVersionId": version_id if enabled else None,
            "version": 2 if enabled else 1,
            "createdAt": f"2026-09-{8 + index:02d}T12:00:00.000Z",
            "updatedAt": f"2026-09-{13 + index:02d}T12:00:00.000Z",
            "versions": [
                {
                    "versionId": version_id,
                    "versionNumber": 1,
                    "status": "ACTIVE" if enabled else "DRAFT",
                    "content": {
                        "when": {"eventType": trigger},
                        "if": [] if trigger == "SCHEDULED_CHECK" else [{"field": "demoPortfolioSafe", "operator": "EQ", "value": True}],
                        "wait": {"delaySeconds": 2592000} if trigger == "SCHEDULED_CHECK" else None,
                        "then": [{"key": f"action_{index}", "type": action_type, "parameters": {}}],
                    },
                    "sourceClassification": "SYNTHETIC_DEMO",
                    "createdByType": "SYSTEM",
                    "createdById": None,
                    "createdAt": f"2026-09-{13 + index:02d}T12:00:00.000Z",
                    "activatedAt": f"2026-09-{13 + index:02d}T12:00:00.000Z" if enabled else None,
                    "retiredAt": None,
                }
            ],
        }
    )


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/health/live":
            self._json(200, {"status": "ok"})
            return

        if path == "/api/v1/admin/automations":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total = len(DEFINITIONS)
            start = (page - 1) * page_size
            self._json(200, {
                "items": DEFINITIONS[start:start + page_size],
                "page": page,
                "pageSize": page_size,
                "totalItems": total,
                "totalPages": max(1, (total + page_size - 1) // page_size),
            })
            return

        for definition in DEFINITIONS:
            if path == f"/api/v1/admin/automations/{definition['definitionId']}":
                self._json(200, definition)
                return

        self._json(404, {"error": "not_found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)

        if path == "/api/v1/operator/auth/login":
            self._json(200, {
                "accessToken": "automations-r3-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": ADMIN_ID,
                    "login": "demo.admin@eliasworks.invalid",
                    "role": "PLATFORM_ADMIN",
                },
            })
            return

        self._json(403, {"code": "DEMO_READ_ONLY", "status": 403})

    def do_PATCH(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)
        self._json(403, {"code": "DEMO_READ_ONLY", "status": 403})

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Request-Id", "automations-r3-viewport")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
