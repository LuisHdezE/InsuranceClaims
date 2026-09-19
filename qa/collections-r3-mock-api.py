from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
OPERATOR_ID = "00000000-0000-4000-8000-000000000096"

COLLECTIONS = [
    {
        "collectionId": "collection-visual-001",
        "customerId": "customer-visual-001",
        "policyId": "policy-visual-001",
        "status": "OPEN",
        "paymentState": "SERVER_STATE_ALPHA",
        "allowedTransitions": ["COMPLETED", "CANCELLED"],
        "version": 6,
        "customer": {"customerRef": "CUS-2026-1042", "displayName": "María Rodríguez", "status": "ACTIVE"},
        "policy": {"policyReference": "POL-2026-014", "insurerReference": "INS-UY-014", "recordStatus": "ACTIVE"},
        "pipeline": {
            "workItemId": "collection-work-001",
            "consumerType": "COLLECTION",
            "consumerId": "collection-visual-001",
            "pipelineDefinitionId": "collection-pipeline-definition",
            "pipelineVersionId": "collection-pipeline-v2",
            "currentStage": {"stageKey": "CONTACT_ACCOUNT", "displayName": "Contactar cuenta", "sortOrder": 10},
            "allowedNextStageKeys": ["FOLLOW_UP", "REVIEW_CASE"],
            "version": 4,
            "createdAt": "2026-09-03T13:00:00.000Z",
            "updatedAt": "2026-09-18T15:30:00.000Z",
        },
        "createdAt": "2026-09-03T13:00:00.000Z",
        "updatedAt": "2026-09-18T15:30:00.000Z",
        "completedAt": None,
        "cancelledAt": None,
    },
    {
        "collectionId": "collection-visual-002",
        "customerId": "customer-visual-002",
        "policyId": "policy-visual-002",
        "status": "COMPLETED",
        "paymentState": "SERVER_STATE_BETA",
        "allowedTransitions": [],
        "version": 4,
        "customer": {"customerRef": "CUS-2026-1018", "displayName": "Carlos Álvarez", "status": "ACTIVE"},
        "policy": {"policyReference": "POL-2026-008", "insurerReference": None, "recordStatus": "ACTIVE"},
        "pipeline": {
            "workItemId": "collection-work-002",
            "consumerType": "COLLECTION",
            "consumerId": "collection-visual-002",
            "pipelineDefinitionId": "collection-pipeline-definition",
            "pipelineVersionId": "collection-pipeline-v2",
            "currentStage": {"stageKey": "CLOSED", "displayName": "Cerrada", "sortOrder": 30},
            "allowedNextStageKeys": [],
            "version": 5,
            "createdAt": "2026-08-22T10:00:00.000Z",
            "updatedAt": "2026-09-15T10:00:00.000Z",
        },
        "createdAt": "2026-08-22T10:00:00.000Z",
        "updatedAt": "2026-09-15T10:00:00.000Z",
        "completedAt": "2026-09-15T10:00:00.000Z",
        "cancelledAt": None,
    },
    {
        "collectionId": "collection-visual-003",
        "customerId": "customer-visual-003",
        "policyId": "policy-visual-003",
        "status": "OPEN",
        "paymentState": None,
        "allowedTransitions": ["COMPLETED", "CANCELLED"],
        "version": 3,
        "customer": {"customerRef": "CUS-2026-0991", "displayName": "Ana Torres", "status": "ACTIVE"},
        "policy": {"policyReference": "POL-2025-017", "insurerReference": "INS-UY-017", "recordStatus": "ACTIVE"},
        "pipeline": {
            "workItemId": "collection-work-003",
            "consumerType": "COLLECTION",
            "consumerId": "collection-visual-003",
            "pipelineDefinitionId": "collection-pipeline-definition",
            "pipelineVersionId": "collection-pipeline-v2",
            "currentStage": {"stageKey": "REVIEW_CASE", "displayName": "Revisar caso", "sortOrder": 20},
            "allowedNextStageKeys": ["FOLLOW_UP"],
            "version": 2,
            "createdAt": "2026-09-05T09:00:00.000Z",
            "updatedAt": "2026-09-14T14:20:00.000Z",
        },
        "createdAt": "2026-09-05T09:00:00.000Z",
        "updatedAt": "2026-09-14T14:20:00.000Z",
        "completedAt": None,
        "cancelledAt": None,
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

        if path == "/api/v1/operator/collections":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total_items = len(COLLECTIONS)
            start = (page - 1) * page_size
            end = start + page_size
            self._json(
                200,
                {
                    "items": COLLECTIONS[start:end],
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total_items,
                    "totalPages": (total_items + page_size - 1) // page_size,
                },
                {"X-Request-Id": "collections-r3-list"},
            )
            return

        if path == "/api/v1/operator/collections/collection-visual-001":
            self._json(200, COLLECTIONS[0], {"X-Request-Id": "collections-r3-detail"})
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
                    "accessToken": "collections-r3-visual-qa-token",
                    "tokenType": "Bearer",
                    "expiresIn": 900,
                    "operator": {
                        "id": OPERATOR_ID,
                        "login": "demo.operator@eliasworks.invalid",
                        "role": "CLAIMS_OPERATOR",
                    },
                },
                {"X-Request-Id": "collections-r3-login"},
            )
            return

        if path == "/api/v1/operator/collections/collection-visual-001/transitions":
            self._json(200, COLLECTIONS[0], {"X-Request-Id": "collections-r3-transition"})
            return

        if path == "/api/v1/operator/collections/collection-visual-001/operational-transitions":
            self._json(200, COLLECTIONS[0]["pipeline"], {"X-Request-Id": "collections-r3-pipeline-transition"})
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
