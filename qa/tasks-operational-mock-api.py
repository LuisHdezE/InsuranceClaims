from __future__ import annotations

import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
OPERATOR_ID = "00000000-0000-4000-8000-000000000096"

TASKS = [
    {
        "taskId": "task-visual-001",
        "claimId": "claim-visual-001",
        "trackingCode": "CLM-2026-1842",
        "policyReference": "POL-80421",
        "vehicleReference": "SBC 2481",
        "type": "CLAIM_REVIEW",
        "title": "Revisar declaración inicial",
        "description": "Validar consistencia de la declaración y confirmar que el expediente está listo para evaluación.",
        "status": "OPEN",
        "priority": "HIGH",
        "queue": "CLAIMS",
        "assignedOperatorId": OPERATOR_ID,
        "dueAt": "2099-09-19T14:00:00.000Z",
        "version": 4,
        "createdByType": "SYSTEM",
        "createdById": None,
        "correlationId": None,
        "createdAt": "2026-09-17T08:43:00.000Z",
        "updatedAt": "2026-09-18T10:05:00.000Z",
        "completedAt": None,
        "completedById": None,
        "cancelledAt": None,
        "cancelledById": None,
        "cancellationReason": None,
    },
    {
        "taskId": "task-visual-002",
        "claimId": "claim-visual-002",
        "trackingCode": "CLM-2026-1877",
        "policyReference": "POL-81104",
        "vehicleReference": "SDA 7732",
        "type": "EVIDENCE_REVIEW",
        "title": "Validar evidencia fotográfica",
        "description": "Revisar legibilidad y correspondencia de las imágenes aportadas por el cliente.",
        "status": "OPEN",
        "priority": "NORMAL",
        "queue": "CLAIMS",
        "assignedOperatorId": OPERATOR_ID,
        "dueAt": "2099-09-21T12:00:00.000Z",
        "version": 2,
        "createdByType": "OPERATOR",
        "createdById": OPERATOR_ID,
        "correlationId": None,
        "createdAt": "2026-09-17T11:20:00.000Z",
        "updatedAt": "2026-09-18T09:30:00.000Z",
        "completedAt": None,
        "completedById": None,
        "cancelledAt": None,
        "cancelledById": None,
        "cancellationReason": None,
    },
    {
        "taskId": "task-visual-003",
        "claimId": "claim-visual-003",
        "trackingCode": "CLM-2026-1903",
        "policyReference": "POL-81990",
        "vehicleReference": "SDF 1108",
        "type": "MISSING_DOCUMENT_FOLLOWUP",
        "title": "Solicitar documento pendiente",
        "description": "Falta el documento complementario indicado en la revisión inicial.",
        "status": "OPEN",
        "priority": "HIGH",
        "queue": "CLAIMS",
        "assignedOperatorId": None,
        "dueAt": "2020-01-01T12:00:00.000Z",
        "version": 1,
        "createdByType": "SYSTEM",
        "createdById": None,
        "correlationId": None,
        "createdAt": "2026-09-16T14:10:00.000Z",
        "updatedAt": "2026-09-16T14:10:00.000Z",
        "completedAt": None,
        "completedById": None,
        "cancelledAt": None,
        "cancelledById": None,
        "cancellationReason": None,
    },
    {
        "taskId": "task-visual-004",
        "claimId": "claim-visual-004",
        "trackingCode": "CLM-2026-1794",
        "policyReference": "POL-79211",
        "vehicleReference": "SAX 9014",
        "type": "CUSTOMER_FOLLOWUP",
        "title": "Confirmar contacto con cliente",
        "description": "Seguimiento completado y documentado por el operador.",
        "status": "COMPLETED",
        "priority": "NORMAL",
        "queue": "CLAIMS",
        "assignedOperatorId": OPERATOR_ID,
        "dueAt": "2026-09-17T11:00:00.000Z",
        "version": 5,
        "createdByType": "OPERATOR",
        "createdById": OPERATOR_ID,
        "correlationId": None,
        "createdAt": "2026-09-16T08:10:00.000Z",
        "updatedAt": "2026-09-17T10:45:00.000Z",
        "completedAt": "2026-09-17T10:45:00.000Z",
        "completedById": OPERATOR_ID,
        "cancelledAt": None,
        "cancelledById": None,
        "cancellationReason": None,
    },
]


def is_overdue(task: dict[str, object]) -> bool:
    due_at = task.get("dueAt")
    if task.get("status") != "OPEN" or not isinstance(due_at, str):
        return False
    return datetime.fromisoformat(due_at.replace("Z", "+00:00")) < datetime.now(timezone.utc)


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
            self._json(
                200,
                {"items": [], "page": 1, "pageSize": 100, "totalItems": 0, "totalPages": 0},
                {"X-Request-Id": "tasks-visual-claims"},
            )
            return

        if path == "/api/v1/operator/tasks":
            params = parse_qs(parsed.query)
            filtered = list(TASKS)
            status = params.get("status", [None])[0]
            task_type = params.get("type", [None])[0]
            priority = params.get("priority", [None])[0]
            assigned_operator_id = params.get("assignedOperatorId", [None])[0]
            overdue = params.get("overdue", [None])[0]

            if status:
                filtered = [task for task in filtered if task["status"] == status]
            if task_type:
                filtered = [task for task in filtered if task["type"] == task_type]
            if priority:
                filtered = [task for task in filtered if task["priority"] == priority]
            if assigned_operator_id:
                filtered = [task for task in filtered if task["assignedOperatorId"] == assigned_operator_id]
            if overdue and overdue.lower() == "true":
                filtered = [task for task in filtered if is_overdue(task)]

            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["100"])[0]))
            total_items = len(filtered)
            start = (page - 1) * page_size
            end = start + page_size
            page_items = filtered[start:end]
            total_pages = (total_items + page_size - 1) // page_size if total_items else 0
            self._json(
                200,
                {
                    "items": page_items,
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total_items,
                    "totalPages": total_pages,
                },
                {"X-Request-Id": "tasks-visual-list"},
            )
            return

        if path.startswith("/api/v1/operator/tasks/"):
            task_id = path.removeprefix("/api/v1/operator/tasks/")
            task = next((item for item in TASKS if item["taskId"] == task_id), None)
            if task:
                self._json(200, task, {"X-Request-Id": "tasks-visual-detail"})
            else:
                self._json(404, {"error": "not_found", "path": path})
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
                "accessToken": "tasks-operational-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": OPERATOR_ID,
                    "login": "demo.operator@eliasworks.invalid",
                    "role": "CLAIMS_OPERATOR",
                },
            },
            {"X-Request-Id": "tasks-visual-login"},
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
