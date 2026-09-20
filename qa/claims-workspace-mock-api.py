from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000

DEMO_PERSONAS = {
    "operations": {
        "id": "00000000-0000-4000-8000-000000000096",
        "login": "demo.operator@eliasworks.invalid",
        "role": "CLAIMS_OPERATOR",
    },
    "supervision": {
        "id": "00000000-0000-4000-8000-000000000095",
        "login": "demo.supervisor@eliasworks.invalid",
        "role": "CLAIMS_SUPERVISOR",
    },
    "administration": {
        "id": "00000000-0000-4000-8000-000000000094",
        "login": "demo.admin@eliasworks.invalid",
        "role": "PLATFORM_ADMIN",
    },
}

CLAIMS = [
    {
        "claimId": "claim-visual-001",
        "trackingCode": "IC-FUW5DaoFvfUvSmuxMvwwID_Fe",
        "status": "RECEIVED",
        "occurredAt": "2026-09-15T12:00:00.000Z",
        "policyReference": "SYN-POL-001",
        "vehicleReference": "SYN-VEH-001",
        "operationalStage": None,
        "operationalWorkItemVersion": None,
        "createdAt": "2026-09-15T12:05:00.000Z",
    },
    {
        "claimId": "claim-visual-002",
        "trackingCode": "SYN-QA-BULK-TRACK-001",
        "status": "RECEIVED",
        "occurredAt": "2026-09-15T11:49:00.000Z",
        "policyReference": "SYN-QA-BULK-POL-001",
        "vehicleReference": "SYN-QA-BULK-VEH-001",
        "operationalStage": {"stageKey": "INTAKE", "displayName": "Ingreso", "sortOrder": 1},
        "operationalWorkItemVersion": 2,
        "createdAt": "2026-09-15T11:51:00.000Z",
    },
    {
        "claimId": "claim-visual-003",
        "trackingCode": "SYN-QA-BULK-TRACK-002",
        "status": "UNDER_REVIEW",
        "occurredAt": "2026-09-15T11:49:00.000Z",
        "policyReference": "SYN-QA-BULK-POL-002",
        "vehicleReference": "SYN-QA-BULK-VEH-002",
        "operationalStage": {"stageKey": "ASSESSMENT", "displayName": "Evaluación", "sortOrder": 2},
        "operationalWorkItemVersion": 3,
        "createdAt": "2026-09-15T11:50:00.000Z",
    },
    {
        "claimId": "claim-visual-004",
        "trackingCode": "SYN-QA-PORTAL-TRACK-001",
        "status": "OBSERVED",
        "occurredAt": "2026-09-15T10:42:00.000Z",
        "policyReference": "SYN-QA-PORTAL-POL-001",
        "vehicleReference": "SYN-QA-PORTAL-VEH-001",
        "operationalStage": {"stageKey": "EVIDENCE", "displayName": "Requiere información", "sortOrder": 3},
        "operationalWorkItemVersion": 4,
        "createdAt": "2026-09-15T10:47:00.000Z",
    },
    {
        "claimId": "claim-visual-005",
        "trackingCode": "CLM-2026-000142",
        "status": "APPROVED",
        "occurredAt": "2026-09-14T18:12:00.000Z",
        "policyReference": "POL-2026-010",
        "vehicleReference": "XYZ-789",
        "operationalStage": {"stageKey": "RESOLUTION", "displayName": "Resolución", "sortOrder": 4},
        "operationalWorkItemVersion": 5,
        "createdAt": "2026-09-14T18:17:00.000Z",
    },
    {
        "claimId": "claim-visual-006",
        "trackingCode": "CLM-2026-000141",
        "status": "IN_REPAIR",
        "occurredAt": "2026-09-14T15:22:00.000Z",
        "policyReference": "POL-2026-008",
        "vehicleReference": "LMN-456",
        "operationalStage": {"stageKey": "REPAIR", "displayName": "Reparación", "sortOrder": 5},
        "operationalWorkItemVersion": 6,
        "createdAt": "2026-09-14T15:27:00.000Z",
    },
    {
        "claimId": "claim-visual-007",
        "trackingCode": "CLM-2026-000140",
        "status": "CLOSED",
        "occurredAt": "2026-09-13T14:05:00.000Z",
        "policyReference": "POL-2026-007",
        "vehicleReference": "JKL-321",
        "operationalStage": {"stageKey": "CLOSED", "displayName": "Cierre", "sortOrder": 6},
        "operationalWorkItemVersion": 7,
        "createdAt": "2026-09-13T14:10:00.000Z",
    },
]

ANALYTICS = {
    "window": {
        "from": "2026-08-19T12:00:00.000Z",
        "to": "2026-09-18T12:00:00.000Z",
        "semantics": "[from,to)",
    },
    "generatedAt": "2026-09-18T12:00:00.000Z",
    "openClaims": 7,
    "reportedInWindow": 7,
    "claimsByStatus": {
        "RECEIVED": 2,
        "UNDER_REVIEW": 1,
        "OBSERVED": 1,
        "APPROVED": 1,
        "IN_REPAIR": 1,
        "CLOSED": 1,
    },
    "claimsByOperationalStage": [],
    "evidencePendingReviewClaims": 0,
    "openTasks": 0,
    "overdueTasks": 0,
    "closedClaims": 1,
}

PAGINATED_EMPTY_PATHS = {
    "/api/v1/operator/tasks",
    "/api/v1/operator/customers",
    "/api/v1/operator/policies",
    "/api/v1/operator/renewals",
    "/api/v1/operator/collections",
    "/api/v1/admin/pipelines",
    "/api/v1/admin/communication-templates",
    "/api/v1/admin/custom-fields",
    "/api/v1/admin/guidance",
}


def paginated_empty(parsed_query: str) -> dict[str, object]:
    params = parse_qs(parsed_query)
    page = max(1, int(params.get("page", ["1"])[0]))
    page_size = max(1, int(params.get("pageSize", ["25"])[0]))
    return {
        "items": [],
        "page": page,
        "pageSize": page_size,
        "totalItems": 0,
        "totalPages": 0,
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
        if path == "/api/v1/operator/claims":
            params = parse_qs(parsed.query)
            status = params.get("status", [None])[0]
            items = [claim for claim in CLAIMS if status is None or claim["status"] == status]
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["20"])[0]))
            self._json(
                200,
                {
                    "items": items,
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": len(items),
                    "totalPages": 1 if items else 0,
                },
                {"X-Request-Id": "claims-workspace-visual-qa-list"},
            )
            return
        if path in PAGINATED_EMPTY_PATHS:
            self._json(
                200,
                paginated_empty(parsed.query),
                {"X-Request-Id": "demo-persona-navigation-empty-list"},
            )
            return
        if path == "/api/v1/operator/analytics/claims":
            self._json(200, ANALYTICS, {"X-Request-Id": "demo-persona-navigation-analytics"})
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

        persona_key = self.headers.get("x-demo-persona", "operations").strip().lower()
        persona = DEMO_PERSONAS.get(persona_key, DEMO_PERSONAS["operations"])

        self._json(
            200,
            {
                "accessToken": f"claims-workspace-visual-qa-{persona_key}-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": persona,
            },
            {"X-Request-Id": f"claims-workspace-visual-qa-login-{persona_key}"},
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
