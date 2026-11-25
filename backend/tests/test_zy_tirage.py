"""Random draw of questions per respondent (campaign.tirage)."""

from collections import Counter

from app import codec
from app import questionnaire as Q
from app import referentiel as R
from tests.test_questionnaires import CAT, FAM, admin, login

TIRAGE = {"situations": 5, "blocs": 7, "likert": 12, "validite": 3}


def _ref():
    return Q.merged_ref(Q.default_content())


def test_draw_is_deterministic_balanced_and_consistent():
    ref = _ref()
    a = Q.draw(ref, TIRAGE, "T9|emp1")
    assert a == Q.draw(ref, TIRAGE, "T9|emp1")
    assert len(a["situations"]) == 5 and len(a["blocs"]) == 7 and len(a["likert"]) == 12
    assert len(a["validite"]) == 3
    # every dimension is measured: 5 situations over 4 dims → each gets 1 or 2, likert 12 → 3 each
    dims = R.dim_keys()
    assert set(Counter(q["dim"] for q in a["situations"])) == set(dims)
    assert set(Counter(q["dim"] for q in a["likert"]).values()) == {12 // len(dims)}
    assert {it["dim"] for b in a["blocs"] for it in b["items"]} == set(dims)
    # bank order kept
    order = [q["id"] for q in ref["situations"]]
    assert [order.index(q["id"]) for q in a["situations"]] == sorted(order.index(q["id"]) for q in a["situations"])
    # consistency twins only when their pair was drawn
    lik_ids = {i["id"] for i in a["likert"]}
    assert all(v["kind"] != "inc" or v["pair"] in lik_ids for v in a["validite"])
    # other respondents get other questions
    others = {tuple(q["id"] for q in Q.draw(ref, TIRAGE, f"T9|emp{i}")["situations"]) for i in range(20)}
    assert len(others) > 5


def test_draw_without_validite_key_keeps_eligible_controls():
    ref = _ref()
    a = Q.draw(ref, {"likert": 8}, "x")
    lik_ids = {i["id"] for i in a["likert"]}
    assert a["situations"] == ref["situations"] and a["blocs"] == ref["blocs"]
    assert a["validite"] == [v for v in ref["validite"] if v["kind"] != "inc" or v["pair"] in lik_ids]


def test_tirage_check():
    c = Q.default_content()
    assert Q.tirage_check(c, TIRAGE)["errors"] == []
    # 2 situations and 2 practices cannot cover 4 dimensions
    errs = Q.tirage_check(c, {"situations": 2, "likert": 2})["errors"]
    assert len(errs) == len(R.dim_keys())
    # all situations kept → coverage guaranteed whatever the likert count
    assert Q.tirage_check(c, {"likert": 1})["errors"] == []
    assert Q.normalize_tirage({"situations": 0, "blocs": "", "likert": "6", "foo": 3}) == {"likert": 6}
    assert Q.normalize_tirage({}) is None


def _answers(ref):
    sit = {q["id"]: max(range(len(q["options"])), key=lambda i: q["options"][i]["points"]) for q in ref["situations"]}
    bloc = {b["id"]: {"most": 0, "least": 1} for b in ref["blocs"]}
    lik = {i["id"]: (2 + n % 3) for n, i in enumerate(Q.likall(ref))}
    return sit, bloc, lik


def test_campaign_tirage_api(client):
    a = admin()
    # refused when a dimension could go unmeasured
    r = a.post("/api/campaigns", json={"code": "TIR1", "label": "Tirage", "tirage": {"situations": 2, "likert": 2}})
    assert r.status_code == 422
    camp = a.post("/api/campaigns", json={"code": "TIR1", "label": "Tirage", "active": True, "tirage": TIRAGE}).json()
    assert camp["tirage"] == TIRAGE
    prev = a.post("/api/campaigns/tirage-check", json={"questionnaire_id": camp["questionnaire_id"],
                                                       "tirage": TIRAGE}).json()
    assert prev["available"]["situations"] >= 5 and prev["errors"] == []

    e1, e2 = login("emp6"), login("emp7")
    r1 = e1.get(f"/api/campaigns/{camp['id']}/questionnaire").json()
    r2 = e2.get(f"/api/campaigns/{camp['id']}/questionnaire").json()
    assert len(r1["situations"]) == 5 and len(r1["blocs"]) == 7 and r1["tirage"] == TIRAGE
    assert r1 == e1.get(f"/api/campaigns/{camp['id']}/questionnaire").json()  # stable for the same person
    assert [q["id"] for q in r1["situations"]] != [q["id"] for q in r2["situations"]] or \
        [q["id"] for q in r1["likert"]] != [q["id"] for q in r2["likert"]]

    # submitting the drawn questions is complete; the score covers every dimension
    sit, bloc, lik = _answers(r1)
    body = {"campaign_id": camp["id"], "categorie": CAT, "famille": FAM, "sit": sit, "bloc": bloc, "lik": lik}
    out = e1.post("/api/me/submissions", json=body)
    assert out.status_code == 200, out.text
    assert out.json()["global"] is not None and out.json()["sjt"]["H"] == 100

    # the TAC1 code of the other employee decodes against their own draw
    sit2, bloc2, lik2 = _answers(r2)
    ident = {"matricule": "emp7", "filiale": "SUNU BANK TOGO", "categorie": CAT, "famille": FAM, "campagne": "TIR1"}
    code = codec.encode(ident, sit2, bloc2, lik2, 900, r2)
    rep = a.post("/api/import/codes", json={"codes": [code]}).json()
    assert rep["imported"] == 1, rep
    res = a.get("/api/results/individuals", params={"campaign_id": camp["id"]}).json()
    rows = res["items"] if isinstance(res, dict) else res
    row = next(x for x in rows if x["matricule"] == "emp7")
    assert row["global"] is not None

    # draw locked once answers exist; other fields still editable
    assert a.patch(f"/api/campaigns/{camp['id']}", json={"tirage": {"situations": 6}}).status_code == 409
    assert a.patch(f"/api/campaigns/{camp['id']}", json={"tirage": TIRAGE, "label": "Tirage 2"}).status_code == 200
    a.patch(f"/api/campaigns/{camp['id']}", json={"active": False})
