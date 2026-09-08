"""Authenticated local reverse proxy for the Windows receipt program.

Expose THIS proxy through Cloudflare Tunnel, not the receipt application itself.
The Telegram bot must send X-Receipt-Secret with every request.
"""

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LISTEN_HOST = os.getenv("RECEIPT_PROXY_HOST", "127.0.0.1")
LISTEN_PORT = int(os.getenv("RECEIPT_PROXY_PORT", "8002"))
UPSTREAM = os.getenv("UPSTREAM_RECEIPT_URL", "http://127.0.0.1:8000").rstrip("/")
SECRET = os.getenv("RECEIPT_SECRET", "").strip()
MAX_BODY = 1_000_000

if len(SECRET) < 24:
    raise SystemExit("RECEIPT_SECRET must be configured and at least 24 characters long")


class Handler(BaseHTTPRequestHandler):
    server_version = "MealPointReceiptProxy/1.0"

    def _json(self, status: int, payload: dict):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def _authorized(self) -> bool:
        supplied = self.headers.get("X-Receipt-Secret", "")
        return bool(supplied) and hmac.compare_digest(supplied, SECRET)

    def do_GET(self):
        # Local diagnostics remain possible on the machine, but no customer data
        # is proxied over GET.
        if self.path.rstrip("/") == "/status":
            self._json(200, {"ok": True, "proxy": "receipt-security"})
            return
        self._json(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/order":
            self._json(404, {"ok": False, "error": "Not found"})
            return
        if not self._authorized():
            self._json(401, {"ok": False, "error": "Unauthorized"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json(400, {"ok": False, "error": "Invalid body size"})
            return

        body = self.rfile.read(length)
        try:
            parsed = json.loads(body.decode("utf-8"))
            if not isinstance(parsed, dict):
                raise ValueError("JSON object required")
        except Exception:
            self._json(400, {"ok": False, "error": "Invalid JSON"})
            return

        try:
            request = Request(
                f"{UPSTREAM}/order",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=20) as response:
                response_body = response.read(MAX_BODY)
                status = int(getattr(response, "status", 200))
                content_type = response.headers.get("Content-Type", "application/json; charset=utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(response_body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(response_body)
        except HTTPError as exc:
            self._json(502, {"ok": False, "error": f"Receipt HTTP {exc.code}"})
        except (URLError, TimeoutError, OSError) as exc:
            self._json(502, {"ok": False, "error": f"Receipt unavailable: {exc}"})

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    print(f"Secure receipt proxy: http://{LISTEN_HOST}:{LISTEN_PORT}/order -> {UPSTREAM}/order")
    print("Expose port 8002 through Cloudflare Tunnel. Do NOT expose port 8000 directly.")
    ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler).serve_forever()
