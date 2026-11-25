"""Parity of the Python scoring/codec with the legacy JavaScript (golden fixtures)."""

import json
from pathlib import Path

import pytest

from app import codec
from app.scoring import calcul

FIX = json.loads((Path(__file__).resolve().parents[2] / "shared" / "golden-fixtures.json").read_text("utf-8"))
CASES = FIX["cases"]


def close(a, b):
    if a is None or b is None:
        return a is b
    return abs(a - b) < 1e-9


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_calcul_matches_legacy(case):
    r = calcul(case["sit"], case["bloc"], case["lik"], case["dureeS"]).to_dict()
    exp = case["expected"]
    for key in ("ds", "inc", "uniforme", "rapide", "dsHaut", "invalide", "domHaut", "domBas", "dureeS"):
        assert r[key] == exp[key], key
    assert close(r["global"], exp["global"])
    for group in ("scores", "sjt", "lik", "dom"):
        for d, v in exp[group].items():
            assert close(r[group][d], v), (group, d)


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_encode_matches_legacy(case):
    code = codec.encode(case["ident"], case["sit"], case["bloc"], case["lik"], case["dureeS"])
    assert code == case["code"]


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_decode_matches_legacy(case):
    d = codec.decode(case["code"])
    exp = case["decoded"]
    assert d["ident"] == exp["ident"]
    assert d["sit"] == exp["sit"]
    assert d["bloc"] == exp["bloc"]
    assert d["lik"] == exp["lik"]
    assert d["dureeS"] == exp["dureeS"]


def test_unicode_code():
    d = codec.decode(FIX["unicode"]["code"])
    assert d["ident"] == FIX["unicode"]["decoded"]["ident"]


def test_garbage_code():
    assert codec.decode("TAC1.@@@") is None
    assert codec.decode("") is None
