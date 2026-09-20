from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
OPERATOR_ID = "00000000-0000-4000-8000-000000000137"
DEFINITION_ID = "00000000-0000-4000-8000-000000000501"
ACTIVE_VERSION_ID = "00000000-0000-4000-8000-000000000511"
DRAFT_VERSION_ID = "00000000-0000-4000-8000-000000000512"

GUIDANCE = [
    {
        "definitionId": DEFINITION_ID,
        "key": "claims.intake.help",
        "enabled": True,
        "activeVersionId": ACTIVE_VERSION_ID,
        "version": 4,
        "createdAt": "2026-08-28T12:00:00.000Z",
        "updatedAt": "2026-09-18T16:00:00.000Z",
        "versions": [
            {
                "versionId": ACTIVE_VERSION_ID,
                "versionNumber": 3,
                "insurerContextReference": "CTX_AUTO_UY",
                "guidanceCategory": "INTAKE_SUPPORT",
                "documentCategories": ["POLICY", "CLAIM_FORM", "IDENTITY"],
                "instructions": [
                    "Verificar la referencia de póliza antes de continuar.",
                    "Confirmar que la información declarada corresponda al evento reportado.",
                    "Solicitar evidencia adicional solo cuando el flujo publicado lo requiera.",
                ],
                "assistanceMetadata": {"channel": "operator", "locale": "es-UY"},
                "status": "ACTIVE",
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
                "insurerContextReference": "CTX_AUTO_UY",
                "guidanceCategory": "INTAKE_SUPPORT",
                "documentCategories": ["POLICY", "CLAIM_FORM", "IDENTITY"],
                "instructions": [
                    "Verificar la referencia de póliza antes de continuar.",
                    "Confirmar datos de contacto del cliente.",
                    "Mantener la orientación limitada al contenido configurado.",
                    "Escalar cuando la evidencia publicada sea insuficiente.",
                ],
                "assistanceMetadata": {"channel": "operator", "locale": "es-UY"},
                "status": "DRAFT",
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
        "definitionId": "00000000-0000-4000-8000-000000000502",
        "key": "claims.evidence.help",
        "enabled": False,
        "activeVersionId": None,
        "version": 2,
        "createdAt": "2026-08-30T12:00:00.000Z",
        "updatedAt": "2026-09-16T10:00:00.000Z",
        "versions": [
            {
                "versionId": "00000000-0000-4000-8000-000000000521",
                "versionNumber": 2,
                "insurerContextReference": "CTX_GENERAL",
                "guidanceCategory": "EVIDENCE",
                "documentCategories": ["EVIDENCE"],
                "instructions": ["Revisar únicamente las categorías documentales publicadas."],
                "assistanceMetadata": {},
                "status": "DRAFT",
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-16T10:00:00.000Z",
                "activatedAt": None,
                "retiredAt": None,
            }
        ],
    },
    {
        "definitionId": "00000000-0000-4000-8000-000000000503",
        "key": "claims.repair.help",
        "enabled": True,
        "activeVersionId": "00000000-0000-4000-8000-000000000531",
        "version": 3,
        "createdAt": "2026-09-01T12:00:00.000Z",
        "updatedAt": "2026-09-17T10:00:00.000Z",
        "versions": [
            {
                "versionId": "00000000-0000-4000-8000-000000000531",
                "versionNumber": 2,
                "insurerContextReference": "CTX_REPAIR",
                "guidanceCategory": "REPAIR_GUIDANCE",
                "documentCategories": ["REPAIR_ESTIMATE"],
                "instructions": ["Mostrar la orientación configurada sin inferir reglas adicionales."],
                "assistanceMetadata": {"audience": "operator"},
                "status": "ACTIVE",
                "sourceClassification": "R3_ADMIN",
                "createdByType": "STAFF",
                "createdById": OPERATOR_ID,
                "createdAt": "2026-09-12T10:00:00.000Z",
                "activatedAt": "2026-09-13T09:30:00.000Z",
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

        if path == "/api/v1/admin/guidance":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total_items = len(GUIDANCE)
            start = (page - 1) * page_size
            end = start + page_size
            self._json(
                200,
                {
                    "items": GUIDANCE[start:end],
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total_items,
                    "totalPages": max(1, (total_items + page_size - 1) // page_size),
                },
                {"X-Request-Id": "guidance-r3-list"},
            )
            return

        if path == f"/api/v1/admin/guidance/{DEFINITION_ID}":
            self._json(200, GUIDANCE[0], {"X-Request-Id": "guidance-r3-detail"})
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
                    "accessToken": "guidance-r3-visual-qa-token",
                    "tokenType": "Bearer",
                    "expiresIn": 900,
                    "operator": {
                        "id": OPERATOR_ID,
                        "login": "platform.admin@eliasworks.invalid",
                        "role": "PLATFORM_ADMIN",
                    },
                },
                {"X-Request-Id": "guidance-r3-login"},
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