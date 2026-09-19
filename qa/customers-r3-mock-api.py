from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = "127.0.0.1"
PORT = 3000
OPERATOR_ID = "00000000-0000-4000-8000-000000000096"

CUSTOMERS = [
    {
        "customerId": "customer-visual-001",
        "customerRef": "CUS-2026-1042",
        "displayName": "María Fernández",
        "status": "ACTIVE",
        "version": 4,
        "createdAt": "2026-06-02T10:00:00.000Z",
        "updatedAt": "2026-09-18T11:25:00.000Z",
        "policyCount": 2,
        "claimCount": 3,
    },
    {
        "customerId": "customer-visual-002",
        "customerRef": "CUS-2026-1088",
        "displayName": "Diego Pereira",
        "status": "ACTIVE",
        "version": 2,
        "createdAt": "2026-07-10T09:00:00.000Z",
        "updatedAt": "2026-09-17T16:40:00.000Z",
        "policyCount": 1,
        "claimCount": 1,
    },
    {
        "customerId": "customer-visual-003",
        "customerRef": "CUS-2025-0871",
        "displayName": "Lucía Silva",
        "status": "INACTIVE",
        "version": 6,
        "createdAt": "2025-11-22T14:00:00.000Z",
        "updatedAt": "2026-09-10T08:15:00.000Z",
        "policyCount": 1,
        "claimCount": 0,
    },
]

CUSTOMER_DETAIL = {
    "customerId": "customer-visual-001",
    "customerRef": "CUS-2026-1042",
    "displayName": "María Fernández",
    "status": "ACTIVE",
    "version": 4,
    "createdAt": "2026-06-02T10:00:00.000Z",
    "updatedAt": "2026-09-18T11:25:00.000Z",
    "policies": [
        {
            "policyId": "policy-visual-001",
            "customerId": "customer-visual-001",
            "policyReference": "POL-80421",
            "legacyPolicyReference": "LEG-POL-80421",
            "insurerReference": "INS-UY-01",
            "recordStatus": "ACTIVE",
            "operationalMetadata": {},
            "version": 9,
            "createdAt": "2026-05-20T10:00:00.000Z",
            "updatedAt": "2026-09-16T10:00:00.000Z",
            "assets": [
                {
                    "assetId": "asset-visual-001",
                    "assetType": "VEHICLE",
                    "assetReference": "SBC 2481",
                    "legacyAssetReference": "LEG-SBC-2481",
                    "metadata": {},
                    "createdAt": "2026-05-20T10:00:00.000Z",
                },
                {
                    "assetId": "asset-visual-002",
                    "assetType": "VEHICLE",
                    "assetReference": "SDA 7732",
                    "legacyAssetReference": "LEG-SDA-7732",
                    "metadata": {},
                    "createdAt": "2026-05-20T10:00:00.000Z",
                },
            ],
        },
        {
            "policyId": "policy-visual-002",
            "customerId": "customer-visual-001",
            "policyReference": "POL-81104",
            "legacyPolicyReference": "LEG-POL-81104",
            "insurerReference": None,
            "recordStatus": "ACTIVE",
            "operationalMetadata": {},
            "version": 3,
            "createdAt": "2026-08-01T10:00:00.000Z",
            "updatedAt": "2026-09-12T10:00:00.000Z",
            "assets": [
                {
                    "assetId": "asset-visual-003",
                    "assetType": "VEHICLE",
                    "assetReference": "SDF 1108",
                    "legacyAssetReference": "LEG-SDF-1108",
                    "metadata": {},
                    "createdAt": "2026-08-01T10:00:00.000Z",
                }
            ],
        },
    ],
    "claims": [
        {
            "claimId": "claim-visual-001",
            "trackingCode": "CLM-2026-1842",
            "status": "UNDER_REVIEW",
            "policyReference": "POL-80421",
            "vehicleReference": "SBC 2481",
            "occurredAt": "2026-09-14T19:20:00.000Z",
            "createdAt": "2026-09-14T20:05:00.000Z",
        },
        {
            "claimId": "claim-visual-002",
            "trackingCode": "CLM-2026-1877",
            "status": "OBSERVED",
            "policyReference": "POL-80421",
            "vehicleReference": "SDA 7732",
            "occurredAt": "2026-09-16T12:10:00.000Z",
            "createdAt": "2026-09-16T13:00:00.000Z",
        },
        {
            "claimId": "claim-visual-003",
            "trackingCode": "CLM-2026-1794",
            "status": "CLOSED",
            "policyReference": "POL-81104",
            "vehicleReference": "SDF 1108",
            "occurredAt": "2026-09-05T09:00:00.000Z",
            "createdAt": "2026-09-05T10:15:00.000Z",
        },
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

        if path == "/api/v1/operator/customers":
            params = parse_qs(parsed.query)
            search = params.get("search", [""])[0].strip().lower()
            status = params.get("status", [""])[0].strip().upper()
            filtered = list(CUSTOMERS)
            if search:
                filtered = [
                    customer for customer in filtered
                    if search in str(customer["displayName"]).lower()
                    or search in str(customer["customerRef"]).lower()
                ]
            if status:
                filtered = [customer for customer in filtered if customer["status"] == status]

            page = max(1, int(params.get("page", ["1"])[0]))
            page_size = max(1, int(params.get("pageSize", ["25"])[0]))
            total_items = len(filtered)
            start = (page - 1) * page_size
            end = start + page_size
            self._json(
                200,
                {
                    "items": filtered[start:end],
                    "page": page,
                    "pageSize": page_size,
                    "totalItems": total_items,
                    "totalPages": (total_items + page_size - 1) // page_size if total_items else 0,
                },
                {"X-Request-Id": "customers-r3-list"},
            )
            return

        if path == "/api/v1/operator/customers/customer-visual-001":
            self._json(200, CUSTOMER_DETAIL, {"X-Request-Id": "customers-r3-detail"})
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
                "accessToken": "customers-r3-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": OPERATOR_ID,
                    "login": "demo.operator@eliasworks.invalid",
                    "role": "CLAIMS_OPERATOR",
                },
            },
            {"X-Request-Id": "customers-r3-login"},
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
