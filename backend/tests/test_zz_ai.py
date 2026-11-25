"""AI endpoints with a fake Anthropic client (no network).

Named test_zz_* so it runs after test_api.py, whose assertions count every submission in the shared DB.
"""

import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import ai
from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models import AiCache, Company, User

from .test_api import CASE, login, submit, t0

AI_USERS = [f"ai.emp{i}" for i in range(5)]


# ----------------------------------------------------------------------------------- fake SDK


def msg(text="", stop="end_turn", tools=()):
    content = [SimpleNamespace(type="thinking", thinking="")]
    if text:
        content.append(SimpleNamespace(type="text", text=text))
    content += [SimpleNamespace(type="tool_use", id=f"tu_{i}", name=n, input=inp) for i, (n, inp) in enumerate(tools)]
    return SimpleNamespace(stop_reason=stop, content=content)


class FakeStream:
    def __init__(self, final, chunks):
        self.final, self.chunks = final, chunks

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def text_stream(self):
        return iter(self.chunks)

    def get_final_message(self):
        return self.final


class FakeClient:
    def __init__(self, script):
        self.script = list(script)
        self.calls: list[dict] = []
        self.messages = self

    def stream(self, **kw):
        self.calls.append(kw)
        final, chunks = self.script.pop(0)
        return FakeStream(final, chunks)

    def create(self, **kw):
        self.calls.append(kw)
        return self.script.pop(0)


def events(body: str):
    out = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if ": " in line)
        out.append((lines.get("event"), json.loads(lines.get("data", "null"))))
    return out


def text_of(body: str) -> str:
    return "".join(d["t"] for e, d in events(body) if e == "delta")


# ------------------------------------------------------------------------------------ fixtures


@pytest.fixture(scope="module")
def ai_users(client):
    with SessionLocal() as db:
        comp = db.query(Company).filter_by(name="SUNU SERVICES").one()
        for u in AI_USERS:
            db.add(User(username=u, name=f"Nom Secret {u}", email=f"{u}@secret.test", company_id=comp.id,
                        filliale=comp.name, ldap_dn=f"CN={u}"))
        db.commit()
    for u in AI_USERS:
        c = login(u)
        assert submit(c, "coherent", t0(c)).status_code == 200
    return AI_USERS


@pytest.fixture
def ai_on(monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")

    def install(script):
        fake = FakeClient(script)
        monkeypatch.setattr(ai, "client", lambda: fake)
        return fake

    return install


# --------------------------------------------------------------------------------------- tests


def test_ai_disabled_without_key(client, ai_users, monkeypatch):
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    assert client.get("/api/meta/config").json()["ai_enabled"] is False
    c = login(ai_users[0])
    assert c.post("/api/ai/me/debrief", json={"campaign_id": t0(c)}).status_code == 503


def test_debrief_streams_without_pii_and_is_cached(ai_users, ai_on):
    fake = ai_on([(msg("### Votre profil"), ["### Votre ", "profil"])])
    c = login(ai_users[0])
    assert c.get("/api/meta/config").json()["ai_enabled"] is True
    r = c.post("/api/ai/me/debrief", json={"campaign_id": t0(c)})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    assert text_of(r.text) == "### Votre profil"
    assert events(r.text)[-1][0] == "done"

    sent = json.dumps(fake.calls[0], ensure_ascii=False, default=str)
    for secret in (ai_users[0], "Nom Secret", "@secret.test", "SUNU SERVICES"):
        assert secret not in sent
    assert fake.calls[0]["model"] == settings.ai_model
    assert fake.calls[0]["thinking"] == {"type": "adaptive"}
    assert fake.calls[0]["system"][1]["cache_control"] == {"type": "ephemeral"}

    # second call: served from cache, no new API call
    r2 = c.post("/api/ai/me/debrief", json={"campaign_id": t0(c)})
    assert text_of(r2.text) == "### Votre profil" and events(r2.text)[-1] == ("done", {"cached": True})
    assert len(fake.calls) == 1
    with SessionLocal() as db:
        assert db.query(AiCache).filter_by(kind="debrief").count() == 1


def test_debrief_requires_a_result(client, ai_on):
    ai_on([])
    c = login("emp7")  # never submitted
    assert c.post("/api/ai/me/debrief", json={"campaign_id": t0(c)}).status_code == 404


def test_coach_uses_debrief_and_daily_limit(ai_users, ai_on, monkeypatch):
    monkeypatch.setattr(settings, "ai_daily_limit", 2)
    fake = ai_on([(msg("Bonjour"), ["Bonjour"]), (msg("Encore"), ["Encore"])])
    c = login(ai_users[0])
    cid = t0(c)
    body = {"campaign_id": cid, "messages": [{"role": "user", "content": "Comment progresser ?"}]}
    r = c.post("/api/ai/me/coach", json=body)
    assert r.status_code == 200 and text_of(r.text) == "Bonjour"
    sys_text = " ".join(b["text"] for b in fake.calls[0]["system"])
    assert "### Votre profil" in sys_text  # the cached debrief is given as context
    assert c.post("/api/ai/me/coach", json=body).status_code == 200
    assert c.post("/api/ai/me/coach", json=body).status_code == 429
    bad = {"campaign_id": cid, "messages": [{"role": "assistant", "content": "x"}]}
    assert c.post("/api/ai/me/coach", json=bad).status_code == 422


def test_stream_error_becomes_sse_error(ai_users, ai_on, monkeypatch):
    class Boom(FakeClient):
        def stream(self, **kw):
            raise RuntimeError("network down")

    ai_on([])
    boom = Boom([])
    monkeypatch.setattr(ai, "client", lambda: boom)
    c = login(ai_users[1])
    r = c.post("/api/ai/me/debrief", json={"campaign_id": t0(c)})
    assert events(r.text)[-1][0] == "error"


def test_hr_endpoints_reject_employees(ai_users, ai_on):
    ai_on([])
    c = login(ai_users[0])
    assert c.post("/api/ai/hr/insights", json={}).status_code == 403
    assert c.post("/api/ai/hr/ask", json={"messages": [{"role": "user", "content": "x"}]}).status_code == 403


def test_hr_insights_structured_and_cached(ai_users, ai_on):
    payload = {"headline": "h", "summary": "s", "strengths": [], "risks": [], "gaps": [], "actions": [],
               "caveats": []}
    fake = ai_on([msg(json.dumps(payload))])
    admin = login("admin.drh", "adminpw")
    r = admin.post("/api/ai/hr/insights", json={})
    assert r.status_code == 200, r.text
    assert r.json()["headline"] == "h" and r.json()["cached"] is False
    fmt = fake.calls[0]["output_config"]["format"]
    assert fmt["type"] == "json_schema" and "actions" in fmt["schema"]["required"]
    sent = json.dumps(fake.calls[0], ensure_ascii=False, default=str)
    assert "Nom Secret" not in sent and "ai.emp" not in sent
    r2 = admin.post("/api/ai/hr/insights", json={})
    assert r2.json()["cached"] is True and len(fake.calls) == 1
    audit = admin.get("/api/admin/audit").json()
    assert any(a["action"] == "ai.insights" for a in (audit["items"] if isinstance(audit, dict) else audit))


def test_hr_ask_tool_loop_masks_small_groups(ai_users, ai_on):
    fake = ai_on([
        (msg("Je regarde.", stop="tool_use", tools=[("list_filters", {}), ("get_summary", {"company_name": "sunu bank togo"})]),
         ["Je regarde."]),
        (msg("Réponse finale"), ["Réponse ", "finale"]),
    ])
    admin = login("admin.drh", "adminpw")
    r = admin.post("/api/ai/hr/ask", json={"messages": [{"role": "user", "content": "Et SUNU BANK TOGO ?"}]})
    ev = events(r.text)
    assert [d["name"] for e, d in ev if e == "tool"] == ["list_filters", "get_summary"]
    assert text_of(r.text).endswith("Réponse finale") and ev[-1][0] == "done"

    results = fake.calls[1]["messages"][-1]["content"]
    filters = json.loads(results[0]["content"])
    assert "SUNU BANK TOGO" in filters["entites"] and "T0" in [c["code"] for c in filters["campagnes"]]
    bank = json.loads(results[1]["content"])
    assert bank["valid"] < settings.min_group_size
    assert all(g["masked"] and g["global"] is None for g in bank["groups"]["filiale"])
    assert "ai.emp" not in json.dumps(results) and "matricule" not in json.dumps(results)


def test_hr_ask_unknown_entity_is_tool_error(ai_users, ai_on):
    fake = ai_on([
        (msg(stop="tool_use", tools=[("get_summary", {"company_name": "Nope"})]), []),
        (msg("ok"), ["ok"]),
    ])
    admin = TestClient(app)
    admin.post("/api/auth/login", json={"username": "admin.drh", "password": "adminpw"})
    admin.post("/api/ai/hr/ask", json={"messages": [{"role": "user", "content": "x"}]})
    res = fake.calls[1]["messages"][-1]["content"][0]
    assert res["is_error"] is True and "inconnue" in res["content"]


def test_profile_context_has_no_identity(ai_users):
    from app.models import Submission

    with SessionLocal() as db:
        s = db.query(Submission).filter_by(matricule=ai_users[2]).one()
        ctx = ai.profile_context(s)
    flat = json.dumps(ctx, ensure_ascii=False)
    assert ai_users[2] not in flat and "matricule" not in flat and "SUNU SERVICES" not in flat
    assert set(ctx["scores_par_dimension"]) == {"Héritage", "Collaboration", "Autonomie", "Performance"}
    assert ctx["profil"] and len(ctx["pratiques_les_moins_frequentes"]) == 4
    _ = CASE  # fixtures shared with test_api
