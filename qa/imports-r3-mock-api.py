from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
ADMIN_ID = "00000000-0000-4000-8000-000000000094"


def counts(total: int, valid: int, invalid: int, unchanged: int, committed: int, rejected: int, failed: int) -> dict[str, int]:
    return {
        "total": total,
        "valid": valid,
        "invalid": invalid,
        "unchanged": unchanged,
        "committed": committed,
        "rejected": rejected,
        "failed": failed,
    }


JOBS = [
    {
        "importJobId": "a6000000-0000-4000-8000-000000000001",
        "importType": "SYNTHETIC_REFERENCE_RECORDS",
        "status": "COMPLETED",
        "source": {"mediaType": "text/csv", "sizeBytes": 512},
        "sourceHeaders": ["ref", "label", "class"],
        "mapping": {"externalReference": "ref", "label": "label", "classification": "class"},
        "counts": counts(4, 4, 0, 1, 4, 0, 0),
        "correlationId": "demo-import-completed",
        "version": 7,
        "createdAt": "2026-09-13T12:00:00.000Z",
        "updatedAt": "2026-09-13T12:06:00.000Z",
        "startedAt": "2026-09-13T12:01:00.000Z",
        "completedAt": "2026-09-13T12:06:00.000Z",
    },
    {
        "importJobId": "a6000000-0000-4000-8000-000000000002",
        "importType": "SYNTHETIC_REFERENCE_RECORDS",
        "status": "COMPLETED_WITH_ERRORS",
        "source": {"mediaType": "text/csv", "sizeBytes": 640},
        "sourceHeaders": ["ref", "label", "class"],
        "mapping": {"externalReference": "ref", "label": "label", "classification": "class"},
        "counts": counts(4, 3, 1, 0, 3, 1, 0),
        "correlationId": "demo-import-partial",
        "version": 7,
        "createdAt": "2026-09-16T12:00:00.000Z",
        "updatedAt": "2026-09-16T12:05:00.000Z",
        "startedAt": "2026-09-16T12:01:00.000Z",
        "completedAt": "2026-09-16T12:05:00.000Z",
    },
    {
        "importJobId": "a6000000-0000-4000-8000-000000000003",
        "importType": "SYNTHETIC_REFERENCE_RECORDS",
        "status": "DRY_RUN_READY",
        "source": {"mediaType": "text/csv", "sizeBytes": 448},
        "sourceHeaders": ["ref", "label", "class"],
        "mapping": {"externalReference": "ref", "label": "label", "classification": "class"},
        "counts": counts(3, 2, 1, 0, 0, 0, 0),
        "correlationId": "demo-import-dry-run",
        "version": 5,
        "createdAt": "2026-09-19T12:00:00.000Z",
        "updatedAt": "2026-09-19T12:03:00.000Z",
        "startedAt": "2026-09-19T12:01:00.000Z",
        "completedAt": None,
    },
    {
        "importJobId": "a6000000-0000-4000-8000-000000000004",
        "importType": "SYNTHETIC_REFERENCE_RECORDS",
        "status": "VALIDATED",
        "source": {"mediaType": "text/csv", "sizeBytes": 420},
        "sourceHeaders": ["ref", "label", "class"],
        "mapping": {"externalReference": "ref", "label": "label", "classification": "class"},
        "counts": counts(3, 2, 1, 0, 0, 0, 0),
        "correlationId": "demo-import-validated",
        "version": 4,
        "createdAt": "2026-09-20T12:00:00.000Z",
        "updatedAt": "2026-09-20T12:02:00.000Z",
        "startedAt": "2026-09-20T12:01:00.000Z",
        "completedAt": None,
    },
]

ROWS = {
    JOBS[0]["importJobId"]: [
        {"importRowId": "a6100000-0000-4000-8000-000000000001", "rowNumber": 1, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "CREATE", "commitOutcome": "CREATED", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000002", "rowNumber": 2, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "UPDATE", "commitOutcome": "UPDATED", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000003", "rowNumber": 3, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "UNCHANGED", "commitOutcome": "UNCHANGED", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000004", "rowNumber": 4, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "CREATE", "commitOutcome": "CREATED", "targetType": None, "targetId": None},
    ],
    JOBS[1]["importJobId"]: [
        {"importRowId": "a6100000-0000-4000-8000-000000000011", "rowNumber": 1, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "CREATE", "commitOutcome": "CREATED", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000012", "rowNumber": 2, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "UPDATE", "commitOutcome": "UPDATED", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000013", "rowNumber": 3, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "CREATE", "commitOutcome": "CREATED", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000014", "rowNumber": 4, "validationStatus": "INVALID", "validationErrors": ["label is required"], "dryRunOutcome": "REJECTED", "commitOutcome": "REJECTED", "targetType": None, "targetId": None},
    ],
    JOBS[2]["importJobId"]: [
        {"importRowId": "a6100000-0000-4000-8000-000000000021", "rowNumber": 1, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "CREATE", "commitOutcome": "PENDING", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000022", "rowNumber": 2, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "UPDATE", "commitOutcome": "PENDING", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000023", "rowNumber": 3, "validationStatus": "INVALID", "validationErrors": ["label is required"], "dryRunOutcome": "REJECTED", "commitOutcome": "PENDING", "targetType": None, "targetId": None},
    ],
    JOBS[3]["importJobId"]: [
        {"importRowId": "a6100000-0000-4000-8000-000000000031", "rowNumber": 1, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "PENDING", "commitOutcome": "PENDING", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000032", "rowNumber": 2, "validationStatus": "VALID", "validationErrors": [], "dryRunOutcome": "PENDING", "commitOutcome": "PENDING", "targetType": None, "targetId": None},
        {"importRowId": "a6100000-0000-4000-8000-000000000033", "rowNumber": 3, "validationStatus": "INVALID", "validationErrors": ["label is required"], "dryRunOutcome": "PENDING", "commitOutcome": "PENDING", "targetType": None, "targetId": None},
    ],
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

        if path == "/api/v1/admin/import-jobs":
            params = parse_qs(parsed.query)
            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total = len(JOBS)
            start = (page - 1) * page_size
            self._json(200, {
                "items": JOBS[start:start + page_size],
                "page": page,
                "pageSize": page_size,
                "totalItems": total,
                "totalPages": max(1, (total + page_size - 1) // page_size),
            })
            return

        for job in JOBS:
            job_id = str(job["importJobId"])
            if path == f"/api/v1/admin/import-jobs/{job_id}":
                self._json(200, job)
                return
            if path == f"/api/v1/admin/import-jobs/{job_id}/rows":
                params = parse_qs(parsed.query)
                page = max(1, int(params.get("page", ["1"])[0]))
                page_size = max(1, int(params.get("pageSize", ["50"])[0]))
                all_rows = ROWS[job_id]
                start = (page - 1) * page_size
                self._json(200, {
                    "items": all_rows[start:start + page_size],
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": len(all_rows),
                    "totalPages": max(1, (len(all_rows) + page_size - 1) // page_size),
                })
                return

        self._json(404, {"error": "not_found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)

        if path == "/api/v1/operator/auth/login":
            self._json(200, {
                "accessToken": "imports-r3-visual-qa-token",
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

    def do_PUT(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)
        self._json(403, {"code": "DEMO_READ_ONLY", "status": 403})

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Request-Id", "imports-r3-viewport")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
