"""Static frontend served by the API (WEB_DIR, native Windows install): same routes as deploy/nginx.conf."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.web import mount_web


@pytest.fixture()
def web(tmp_path):
    (tmp_path / "index.html").write_text("TEST")
    (tmp_path / "admin").mkdir()
    (tmp_path / "admin" / "index.html").write_text("CONSOLE")
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-123.js").write_text("js")
    (tmp_path / "logo.png").write_bytes(b"png")
    (tmp_path.parent / "secret.txt").write_text("nope")
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"ok": True}

    mount_web(app, tmp_path)
    return TestClient(app)


def test_test_spa_at_root(web):
    for url in ("/", "/resultats", "/some/deep/link"):
        r = web.get(url)
        assert r.status_code == 200 and r.text == "TEST"
        assert r.headers["cache-control"] == "no-cache"
    assert web.get("/").headers["x-frame-options"] == "SAMEORIGIN"


def test_console_spa(web):
    for url in ("/admin/", "/admin/repondants", "/admin/questionnaires/3"):
        r = web.get(url)
        assert r.status_code == 200 and r.text == "CONSOLE"
        assert r.headers["x-robots-tag"] == "noindex, nofollow"
    r = web.get("/admin", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/admin/"


def test_legacy_redirects(web):
    r = web.get("/test/?c=T0", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/?c=T0"
    r = web.get("/console/repondants", follow_redirects=False)
    assert r.status_code == 301 and r.headers["location"] == "/admin/repondants"


def test_files_and_cache(web):
    r = web.get("/assets/app-123.js")
    assert r.status_code == 200 and r.text == "js" and "immutable" in r.headers["cache-control"]
    assert web.get("/logo.png").content == b"png"


def test_api_untouched(web):
    assert web.get("/api/health").json() == {"ok": True}
    r = web.get("/api/unknown")
    assert r.status_code == 404 and r.json() == {"detail": "Not Found"}


def test_no_path_traversal(web):
    r = web.get("/..%2Fsecret.txt")
    assert "nope" not in r.text


def test_missing_console_build_is_404(tmp_path):
    (tmp_path / "index.html").write_text("TEST")
    app = FastAPI()
    mount_web(app, tmp_path)
    assert TestClient(app).get("/admin/").status_code == 404
