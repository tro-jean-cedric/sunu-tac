import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

FIX = json.loads((Path(__file__).resolve().parents[2] / "shared" / "golden-fixtures.json").read_text("utf-8"))
CASE = {c["name"]: c for c in FIX["cases"]}
CAT, FAM = "Manager", "Métier (technique, commercial, exploitation)"


def login(username, password="dev"):
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return c


def t0(c):
    camps = c.get("/api/campaigns/open").json()
    return next(x for x in camps if x["code"] == "T0")["id"]


def submit(c, case, cid):
    k = CASE[case]
    return c.post("/api/me/submissions", json={"campaign_id": cid, "categorie": CAT, "famille": FAM,
                                               "sit": k["sit"], "bloc": k["bloc"], "lik": k["lik"]})


def test_login_failures(client):
    assert client.post("/api/auth/login", json={"username": "emp0", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "nobody", "password": "dev"}).status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_employee_cannot_see_console(client):
    c = login("emp0")
    assert c.get("/api/results/summary").status_code == 403
    me = c.get("/api/auth/me").json()
    assert me["company"]["name"] == "SUNU SERVICES" and not me["is_hr"]


def test_submission_scored_server_side(client):
    c = login("emp0")
    cid = t0(c)
    r = submit(c, "coherent", cid)
    assert r.status_code == 200, r.text
    body = r.json()
    assert abs(body["global"] - CASE["coherent"]["expected"]["global"]) < 1e-9
    assert body["matricule"] == "emp0" and body["filiale"] == "SUNU SERVICES"
    # second valid submission refused
    assert submit(c, "random1", cid).status_code == 409
    assert c.get(f"/api/me/submissions/latest?campaign_id={cid}").json()["id"] == body["id"]


def test_incomplete_refused(client):
    c = login("emp1")
    assert submit(c, "partial", t0(c)).status_code == 422


def test_invalid_can_be_retaken(client):
    c = login("emp1")
    cid = t0(c)
    r = submit(c, "uniform", cid)
    assert r.status_code == 200 and r.json()["invalide"] is True
    r2 = submit(c, "random1", cid)
    assert r2.status_code == 200 and r2.json()["invalide"] is False and r2.json()["id"] == r.json()["id"]


def test_draft_roundtrip(client):
    c = login("emp2")
    cid = t0(c)
    assert c.put("/api/me/draft", json={"campaign_id": cid, "payload": {"sit": {"A1": 2}}}).status_code == 204
    assert c.get(f"/api/me/draft?campaign_id={cid}").json()["payload"] == {"sit": {"A1": 2}}


def test_summary_masks_small_groups_and_scopes(client):
    for u in ("emp2", "emp3", "emp4", "emp6"):
        c = login(u)
        assert submit(c, "random2", t0(c)).status_code == 200
    admin = login("admin.drh", "adminpw")
    s = admin.get("/api/results/summary").json()
    assert s["valid"] == 6 and s["population"] == 9
    fil = {g["key"]: g for g in s["groups"]["filiale"]}
    assert fil["SUNU SERVICES"]["n"] == 5 and not fil["SUNU SERVICES"]["masked"]
    assert fil["SUNU BANK TOGO"]["masked"] and fil["SUNU BANK TOGO"]["global"] is None
    assert [r["priority"] for r in s["ranking"]] == [True, True, False, False]

    # scope an HR_ENTITY user to SUNU BANK TOGO
    users = admin.get("/api/admin/users?q=drh.bank").json()
    bank_id = users[0]["company"]["id"]
    assert admin.post(f"/api/admin/users/{users[0]['id']}/roles",
                      json={"role": "HR_ENTITY", "company_id": bank_id}).status_code == 200
    hr = login("drh.bank")
    sb = hr.get("/api/results/summary").json()
    assert sb["total"] == 1
    assert hr.get("/api/admin/users").status_code == 403
    items = admin.get("/api/results/individuals").json()["items"]
    other = next(i for i in items if i["filiale"] == "SUNU SERVICES")
    assert hr.get(f"/api/results/individuals/{other['id']}").status_code == 404


def test_import_codes_replace_and_csv(client):
    admin = login("admin.drh", "adminpw")
    code = CASE["random3"]["code"]  # matricule T1003, SUNU Services, T0
    r = admin.post("/api/import/codes", json={"codes": [code, "garbage"]}).json()
    assert r["imported"] == 1 and r["unreadable"] == 1 and r["replaced"] == 0
    r = admin.post("/api/import/codes", json={"codes": [code]}).json()
    assert r["replaced"] == 1
    item = admin.get("/api/results/individuals?q=t1003").json()["items"][0]
    assert abs(item["global"] - CASE["random3"]["expected"]["global"]) < 1e-9
    assert item["rapide"] is True
    csv = admin.get("/api/results/export.csv")
    assert csv.status_code == 200 and csv.text.startswith("﻿\"matricule\";")
    files = admin.post("/api/import/files", json={"items": [{**CASE["dshigh"]["ident"], "sit": CASE["dshigh"]["sit"],
                                                            "bloc": CASE["dshigh"]["bloc"], "lik": CASE["dshigh"]["lik"],
                                                            "dureeS": 1500}]}).json()
    assert files["imported"] == 1
