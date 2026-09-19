from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
OPERATOR_ID = "00000000-0000-4000-8000-000000000125"
DEFINITION_ID = "pipeline-definition-visual-001"
ACTIVE_VERSION_ID = "00000000-0000-4000-8000-000000000201"
DRAFT_VERSION_ID = "00000000-0000-4000-8000-000000000202"

PIPELINES = [
    {
        "definitionId": DEFINITION_ID,
        "key": "claims-main",
        "consumerType": "CLAIM",
        "displayName": "Siniestros principal",
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
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-01T12:00:00.000Z",
                "activatedAt": "2026-09-03T09:30:00.000Z",
                "retiredAt": None,
                "stages": [
                    {
                        "stageKey": "RECEIVED",
                        "displayName": "Recibido",
                        "sortOrder": 10,
                        "reportingFlags": {"terminal": False},
                        "allowedNextStageKeys": ["UNDER_REVIEW"],
                    },
                    {
                        "stageKey": "UNDER_REVIEW",
                        "displayName": "En revisión",
                        "sortOrder": 20,
                        "reportingFlags": {"terminal": False},
                        "allowedNextStageKeys": ["APPROVED", "REJECTED"],
                    },
                    {
                        "stageKey": "APPROVED",
                        "displayName": "Aprobado",
                        "sortOrder": 30,
                        "reportingFlags": {"terminal": True},
                        "allowedNextStageKeys": [],
                    },
                    {
                        "stageKey": "REJECTED",
                        "displayName": "Rechazado",
                        "sortOrder": 40,
                        "reportingFlags": {"terminal": True},
                        "allowedNextStageKeys": [],
                    },
                ],
            },
            {
                "versionId": DRAFT_VERSION_ID,
                "versionNumber": 4,
                "status": "DRAFT",
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-18T16:00:00.000Z",
                "activatedAt": None,
                "retiredAt": None,
                "stages": [
                    {
                        "stageKey": "RECEIVED",
                        "displayName": "Recibido",
                        "sortOrder": 10,
                        "reportingFlags": {"terminal": False},
                        "allowedNextStageKeys": ["TRIAGE"],
                    },
                    {
                        "stageKey": "TRIAGE",
                        "displayName": "Clasificación",
                        "sortOrder": 20,
                        "reportingFlags": {"terminal": False},
                        "allowedNextStageKeys": ["UNDER_REVIEW"],
                    },
                    {
                        "stageKey": "UNDER_REVIEW",
                        "displayName": "En revisión",
                        "sortOrder": 30,
                        "reportingFlags": {"terminal": False},
                        "allowedNextStageKeys": ["APPROVED", "REJECTED"],
                    },
                    {
                        "stageKey": "APPROVED",
                        "displayName": "Aprobado",
                        "sortOrder": 40,
                        "reportingFlags": {"terminal": True},
                        "allowedNextStageKeys": [],
                    },
                    {
                        "stageKey": "REJECTED",
                        "displayName": "Rechazado",
                        "sortOrder": 50,
                        "reportingFlags": {"terminal": True},
                        "allowedNextStageKeys": [],
                    },
                ],
            },
        ],
    },
    {
        "definitionId": "pipeline-definition-visual-002",
        "key": "renewals-main",
        "consumerType": "RENEWAL",
        "displayName": "Renovaciones principal",
        "enabled": True,
        "activeVersionId": "00000000-0000-4000-8000-000000000211",
        "version": 4,
        "createdAt": "2026-08-29T12:00:00.000Z",
        "updatedAt": "2026-09-16T10:00:00.000Z",
        "versions": [
            {
                "versionId": "00000000-0000-4000-8000-000000000211",
                "versionNumber": 2,
                "status": "ACTIVE",
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-02T12:00:00.000Z",
                "activatedAt": "2026-09-04T09:30:00.000Z",
                "retiredAt": None,
                "stages": [
                    {"stageKey": "PREPARE", "displayName": "Preparar", "sortOrder": 10, "reportingFlags": {}, "allowedNextStageKeys": ["CONTACT"]},
                    {"stageKey": "CONTACT", "displayName": "Contactar", "sortOrder": 20, "reportingFlags": {}, "allowedNextStageKeys": []},
                ],
            }
        ],
    },
    {
        "definitionId": "pipeline-definition-visual-003",
        "key": "collections-main",
        "consumerType": "COLLECTION",
        "displayName": "Cobranzas principal",
        "enabled": False,
        "activeVersionId": None,
        "version": 2,
        "createdAt": "2026-09-01T12:00:00.000Z",
        "updatedAt": "2026-09-12T10:00:00.000Z",
        "versions": [
            {
                "versionId": "00000000-0000-4000-8000-000000000221",
                "versionNumber": 1,
                "status": "DRAFT",
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-12T10:00:00.000Z",
                "activatedAt": None,
                "retiredAt": None,
                "stages": [
                    {"stageKey": "CONTACT", "displayName": "Contactar", "sortOrder": 10, "reportingFlags": {}, "allowedNextStageKeys": []}
                ],
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

        if path == "/api/v1/admin/pipelines":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total_items = len(PIPELINES)
            start = (page - 1) * page_size
            end = start + page_size
            self._json(
                200,
                {
                    "items": PIPELINES[start:end],
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total_items,
                    "totalPages": (total_items + page_size - 1) // page_size,
                },
                {"X-Request-Id": "pipelines-r3-list"},
            )
            return

        if path == f"/api/v1/admin/pipelines/{DEFINITION_ID}":
            self._json(200, PIPELINES[0], {"X-Request-Id": "pipelines-r3-detail"})
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
                    "accessToken": "pipelines-r3-visual-qa-token",
                    "tokenType": "Bearer",
                    "expiresIn": 900,
                    "operator": {
                        "id": OPERATOR_ID,
                        "login": "platform.admin@eliasworks.invalid",
                        "role": "PLATFORM_ADMIN",
                    },
                },
                {"X-Request-Id": "pipelines-r3-login"},
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
