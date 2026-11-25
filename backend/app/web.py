"""Serve the built frontend from the API process (native Windows install, no nginx).

Same routing as deploy/nginx.conf:
  /                      → employee test (index.html, SPA fallback)
  /admin/…               → HR console (admin/index.html, SPA fallback, noindex)
  /admin                 → 301 /admin/
  /test/…, /console/…    → 301 to / and /admin/… (old links, QR codes)
  /assets/…              → long-lived immutable cache
"""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "SAMEORIGIN",
}


def _redirect(request: Request, path: str) -> RedirectResponse:
    query = request.url.query
    return RedirectResponse(path + (f"?{query}" if query else ""), status_code=301)


def mount_web(app: FastAPI, web_dir: Path) -> None:
    root = web_dir.resolve()
    test_index = root / "index.html"
    admin_index = root / "admin" / "index.html"

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers.setdefault(k, v)
        return response

    def page(index: Path, admin: bool = False) -> Response:
        if not index.is_file():  # e.g. a test-only build has no console
            return Response("Not found", status_code=404)
        headers = {"Cache-Control": "no-cache"}
        if admin:
            headers["X-Robots-Tag"] = "noindex, nofollow"
        return FileResponse(index, headers=headers)

    @app.api_route("/admin", methods=["GET", "HEAD"], include_in_schema=False)
    def admin_slash(request: Request):
        return _redirect(request, "/admin/")

    @app.api_route("/test/{rest:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def legacy_test(request: Request, rest: str):
        return _redirect(request, "/")

    @app.api_route("/console/{rest:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def legacy_console(request: Request, rest: str):
        return _redirect(request, f"/admin/{rest}")

    # registered last: everything the API routers did not match
    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def static(path: str):
        if path == "api" or path.startswith("api/"):
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        target = (root / path).resolve()
        if path and target.is_relative_to(root) and target.is_file():
            headers = {"Cache-Control": "public, max-age=2592000, immutable"} if path.startswith("assets/") else {}
            if path.endswith(".html"):
                headers["Cache-Control"] = "no-cache"
            return FileResponse(target, headers=headers)
        if path.startswith("admin/"):
            return page(admin_index, admin=True)
        return page(test_index)
