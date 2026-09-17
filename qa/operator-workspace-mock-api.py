from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = 3000


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/health/live":
            self._json(200, {"status": "ok"})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path != "/api/v1/operator/auth/login":
            self._json(404, {"error": "not_found"})
            return

        length = int(self.headers.get("content-length", "0"))
        if length:
            self.rfile.read(length)

        self._json(
            200,
            {
                "accessToken": "workspace-visual-qa-token",
                "tokenType": "Bearer",
                "expiresIn": 900,
                "operator": {
                    "id": "workspace-visual-qa-admin",
                    "login": "platform.admin@visual-qa.invalid",
                    "role": "PLATFORM_ADMIN",
                },
            },
            extra_headers={"X-Request-Id": "workspace-visual-qa"},
        )

    def _json(self, status: int, payload: dict[str, object], extra_headers: dict[str, str] | None = None) -> None:
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
