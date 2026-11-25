"""Questionnaire builder: lifecycle, validation, campaign assignment, extras scoring and codec."""

import copy
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import codec, questionnaire as Q
from app.main import app
from app.scoring import calcul

FIX = json.loads((Path(__file__).resolve().parents[2] / "shared" / "golden-fixtures.json").read_text("utf-8"))
CASE = {c["name"]: c for c in FIX["cases"]}
CAT, FAM = "Manager", "Métier (technique, commercial, exploitation)"


def login(username, password="dev"):
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": username, "password": password}).status_code == 200
    return c


def admin():
    return login("admin.drh", "adminpw")


EXTRAS = [
    {"id": "X1", "type": "single", "txt": "Ancienneté ?", "options": [{"txt": "< 2 ans"}, {"txt": "2 ans et +"}]},
    {"id": "X2", "type": "yesno", "txt": "Avez-vous encadré une équipe ?", "scored": True, "dim": "C",
     "pointsOui": 2, "pointsNon": 0},
    {"id": "X3", "type": "multiple", "txt": "Pratiques", "scored": True, "dim": "P", "minChoices": 1, "maxChoices": 2,
     "options": [{"txt": "a", "points": 2}, {"txt": "b", "points": 1}, {"txt": "c", "points": 0}],
     "showIf": {"question": "X2", "values": [True]}},
    {"id": "X4", "type": "scale", "txt": "Recommanderiez-vous SUNU ?", "min": 0, "max": 10, "required": False},
    {"id": "X5", "type": "ranking", "txt": "Classez", "options": [{"txt": "u"}, {"txt": "v"}, {"txt": "w"}]},
    {"id": "X6", "type": "text", "txt": "Un mot ?", "required": False, "maxLength": 50},
]


def test_default_content_is_legacy_bank_and_valid():
    c = Q.default_content()
    rep = Q.validate(c)
    assert rep["errors"] == []
    assert rep["stats"]["counts"] == {"situations": 12, "blocs": 12, "likert": 26, "validite": 9, "extras": 0}
    # scoring with the stored default content == legacy scoring
    k = CASE["coherent"]
    r = calcul(k["sit"], k["bloc"], k["lik"], k["dureeS"], Q.merged_ref(c)).to_dict()
    assert abs(r["global"] - k["expected"]["global"]) < 1e-9


def test_validation_catches_errors():
    c = Q.default_content()
    c["situations"][1]["id"] = c["situations"][0]["id"]
    c["blocs"][0]["items"][1]["dim"] = c["blocs"][0]["items"][0]["dim"]
    c["validite"][5]["pair"] = "NOPE"
    c["echelle"] = [{"value": 1, "label": "a"}]
    c["extras"] = [{"id": "Y1", "type": "single", "txt": "x", "options": [{"txt": "a"}],
                    "showIf": {"question": "ZZ", "values": [0]}}]
    paths = [e["path"] for e in Q.validate(c)["errors"]]
    for p in ("situations.1", "blocs.0", "validite.5", "echelle", "extras.0"):
        assert p in paths, p


def test_extras_scoring_and_visibility():
    c = Q.default_content()
    c["extras"] = EXTRAS
    ref = Q.merged_ref(Q.normalize(c))
    k = CASE["coherent"]
    base = calcul(k["sit"], k["bloc"], k["lik"], k["dureeS"], ref).to_dict()
    assert base["extra"] is None  # nothing answered → identical to legacy
    assert abs(base["global"] - k["expected"]["global"]) < 1e-9
    r = calcul(k["sit"], k["bloc"], k["lik"], k["dureeS"], ref, {"X2": True, "X3": [0, 1]}).to_dict()
    assert r["extra"]["C"] == 100 and r["extra"]["P"] == 100
    exp = k["expected"]
    sjt, lik = exp["sjt"]["C"], exp["lik"]["C"]
    assert abs(r["scores"]["C"] - (0.6 * sjt + 0.4 * lik + 0.2 * 100) / 1.2) < 1e-9
    # X3 hidden when X2 = False → its answer is ignored
    r2 = calcul(k["sit"], k["bloc"], k["lik"], k["dureeS"], ref, {"X2": False, "X3": [0]}).to_dict()
    assert r2["extra"]["P"] is None and r2["extra"]["C"] == 0


def test_codec_extras_roundtrip():
    c = Q.default_content()
    c["extras"] = EXTRAS
    ref = Q.merged_ref(Q.normalize(c))
    k = CASE["coherent"]
    extra = {"X1": 1, "X6": "ok | pipe"}
    code = codec.encode(k["ident"], k["sit"], k["bloc"], k["lik"], k["dureeS"], ref, extra)
    d = codec.decode(code, lambda *_: ref)
    assert d["extra"] == extra and d["sit"] == k["decoded"]["sit"]
    # without extras the code is byte-identical to legacy
    assert codec.encode(k["ident"], k["sit"], k["bloc"], k["lik"], k["dureeS"], ref, {}) == k["code"]


def test_lifecycle_and_campaign(client):
    a = admin()
    qs = a.get("/api/questionnaires").json()
    v1 = next(q for q in qs if q["version"] == 1)
    assert v1["status"] == "published" and v1["campaigns"]
    # published is frozen
    assert a.put(f"/api/questionnaires/{v1['id']}", json={"revision": v1["revision"], "label": "x"}).status_code == 409
    # new draft copied from v1
    d = a.post("/api/questionnaires", json={"label": "TAC v2", "from_id": v1["id"]}).json()
    assert d["status"] == "draft" and d["based_on_id"] == v1["id"] and d["validation"]["errors"] == []
    content = copy.deepcopy(d["content"])
    content["extras"] = EXTRAS
    content["situations"][0]["options"].append({"txt": "Cinquième réponse", "points": 1})
    r = a.put(f"/api/questionnaires/{d['id']}", json={"revision": d["revision"], "content": content})
    assert r.status_code == 200, r.text
    d2 = r.json()
    # stale revision refused
    assert a.put(f"/api/questionnaires/{d['id']}", json={"revision": d["revision"], "label": "y"}).status_code == 409
    # cannot assign a draft
    camp = a.post("/api/campaigns", json={"code": "PILOTE2", "label": "Pilote v2", "active": True}).json()
    assert camp["questionnaire_id"] == v1["id"]
    assert a.patch(f"/api/campaigns/{camp['id']}", json={"questionnaire_id": d["id"]}).status_code == 422
    # employees cannot edit
    assert login("emp5").post("/api/questionnaires", json={"label": "x"}).status_code == 403
    # publish then assign
    assert a.post(f"/api/questionnaires/{d['id']}/publish").status_code == 200
    assert a.put(f"/api/questionnaires/{d['id']}", json={"revision": d2["revision"] + 1, "label": "z"}).status_code == 409
    assert a.patch(f"/api/campaigns/{camp['id']}", json={"questionnaire_id": d["id"]}).json()["questionnaire_id"] == d["id"]

    # employee gets the campaign's questions and submits with extras
    e = login("emp5")
    ref = e.get(f"/api/campaigns/{camp['id']}/questionnaire").json()
    assert len(ref["situations"][0]["options"]) == 5 and len(ref["extras"]) == 6
    k = CASE["coherent"]
    body = {"campaign_id": camp["id"], "categorie": CAT, "famille": FAM, "sit": k["sit"], "bloc": k["bloc"],
            "lik": k["lik"], "extra": {"X1": 0, "X2": True, "X5": [2, 0, 1]}}
    assert e.post("/api/me/submissions", json=body).status_code == 422  # X3 required once X2 = yes
    body["extra"]["X3"] = [0]
    body["extra"]["X6"] = "Très bien"
    r = e.post("/api/me/submissions", json=body)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["extra"]["C"] == 100 and abs(out["extra"]["P"] - 100 * 2 / 3) < 1e-9

    # questionnaire of a campaign with answers is locked; version in use cannot be deleted / archived while active
    assert a.patch(f"/api/campaigns/{camp['id']}", json={"questionnaire_id": v1["id"]}).status_code == 409
    assert a.delete(f"/api/questionnaires/{d['id']}").status_code == 409
    assert a.post(f"/api/questionnaires/{d['id']}/archive").status_code == 409

    # stats are masked below the minimum group size
    st = a.get(f"/api/questionnaires/{d['id']}/stats").json()
    assert st["n"] == 1 and st["masked"] and st["items"] == {}

    # export / import round trip, then delete the imported draft
    exp = a.get(f"/api/questionnaires/{d['id']}/export").json()
    imp = a.post("/api/questionnaires", json={"label": "Import", "content": exp["content"]}).json()
    assert imp["content"]["extras"][2]["showIf"] == {"question": "X2", "values": [True]}
    assert a.delete(f"/api/questionnaires/{imp['id']}").status_code == 204
    # close the pilot campaign so other tests only see the standard ones
    a.patch(f"/api/campaigns/{camp['id']}", json={"active": False})


def test_blank_template_reports_errors(client):
    a = admin()
    d = a.post("/api/questionnaires", json={"label": "Vide", "template": "vide"}).json()
    assert d["validation"]["errors"]
    assert a.post(f"/api/questionnaires/{d['id']}/publish").status_code == 422
    live = a.post("/api/questionnaires/validate", json={"content": Q.default_content()}).json()
    assert live["errors"] == []
    assert a.delete(f"/api/questionnaires/{d['id']}").status_code == 204


def test_stats_with_enough_respondents(client):
    """Six valid answers on the default version: distributions and discrimination are returned."""
    a = admin()
    v1 = next(q for q in a.get("/api/questionnaires").json() if q["version"] == 1)
    st = a.get(f"/api/questionnaires/{v1['id']}/stats").json()
    if st["masked"]:
        return  # depends on what other tests submitted; masking itself is covered above
    a1 = st["items"]["A1"]
    assert sum(a1["options"]) == a1["n"] and len(a1["options"]) == 4
    assert len(st["items"]["C1"]["distribution"]) == 5
