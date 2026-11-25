"""Editable, versioned questionnaires (item banks).

A questionnaire's `content` holds everything about the questions and answers:

    situations  mises en situation — one choice among N options, each worth points (SJT)
    blocs       forced choice — "most like me" / "least like me" among 3+ statements of different dimensions
    likert      frequency statements on the answer scale (`echelle`), optionally reversed
    validite    control items: social desirability (`ds`) and consistency twins (`inc`, paired to a Likert item)
    extras      complementary questions of free types (single, multiple, yesno, scale, ranking, text), optionally
                scored on a dimension and optionally shown only after a given answer (`showIf`)
    echelle     answer scale of the Likert / validity items (2 to 9 points, values 1..n)
    regles      scoring weights and validity thresholds

The dimensions, bands, catégories and familles stay global (shared/referentiel.json) because every dashboard,
trend and export compares campaigns on them. A questionnaire is merged over that file (`merged_ref`) so the
scoring and codec code reads one dictionary.

Lifecycle: draft (editable) → published (frozen, assignable to campaigns) → archived. A published version is
never modified: changes go into a new draft copied from it. That keeps every stored submission interpretable.
"""

from __future__ import annotations

import copy
import re
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import referentiel as R

QUESTION_KEYS = ("situations", "blocs", "likert", "validite", "extras")
EXTRA_TYPES = ("single", "multiple", "yesno", "scale", "ranking", "text")
SCORABLE_EXTRAS = ("single", "multiple", "yesno", "scale")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,16}$")

DEFAULT_RULES: dict[str, Any] = {
    "poids": {"sjt": 0.6, "lik": 0.4, "extra": 0.2},  # weights of the three components of a dimension score
    "dsSeuil": 3,  # n desirability items at the scale max → Likert ignored (dsHaut)
    "incSeuil": 8,  # consistency gap (normalised) → result not usable
    "incNorm": 4,  # gap normalised to this many pairs (legacy: 4)
    "uniformeMin": 20,  # min n Likert answers before the uniform-pattern check applies
    "uniformeSeuil": 0.8,  # share of identical answers → uniform pattern
    "rapideS": 720,  # faster than this (seconds) → flagged as rapid (informative)
    "melangerOptions": True,  # shuffle the situation options per respondent
}

DEFAULT_EXTRAS_TITLE = "Questions complémentaires"


def default_content() -> dict[str, Any]:
    """The legacy item bank (shared/referentiel.json), as editable content."""
    ref = R.ref()
    return normalize({
        **{k: copy.deepcopy(ref[k]) for k in ("situations", "blocs", "likert", "validite", "echelle")},
        "extras": [],
        "regles": dict(DEFAULT_RULES),
    })


def blank_content() -> dict[str, Any]:
    return normalize({"situations": [], "blocs": [], "likert": [], "validite": [], "extras": [],
                      "echelle": copy.deepcopy(R.ref()["echelle"]), "regles": dict(DEFAULT_RULES)})


# ----------------------------------------------------------------------------------- normalisation

def _s(v: Any, n: int = 4000) -> str:
    return ("" if v is None else str(v)).strip()[:n]


def _num(v: Any, default: float | int, cast=float):
    try:
        return cast(v)
    except (TypeError, ValueError):
        return default


def _opts(raw: Any, points: bool = True) -> list[dict[str, Any]]:
    out = []
    for o in raw if isinstance(raw, list) else []:
        o = o if isinstance(o, dict) else {"txt": o}
        item: dict[str, Any] = {"txt": _s(o.get("txt"), 1000)}
        if points:
            item["points"] = _num(o.get("points"), 0, int)
        out.append(item)
    return out


def normalize(content: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce client/imported JSON to the canonical shape (types, known keys only). Never raises."""
    c = content if isinstance(content, dict) else {}
    lst = lambda k: [x for x in (c.get(k) or []) if isinstance(x, dict)]  # noqa: E731
    out: dict[str, Any] = {}
    out["situations"] = [
        {"id": _s(q.get("id"), 32), "dim": _s(q.get("dim"), 4), "txt": _s(q.get("txt")),
         **({"aide": _s(q["aide"], 1000)} if _s(q.get("aide")) else {}),
         "options": _opts(q.get("options"))}
        for q in lst("situations")
    ]
    out["blocs"] = [
        {"id": _s(b.get("id"), 32),
         "items": [{"txt": _s(i.get("txt"), 1000), "dim": _s(i.get("dim"), 4)}
                   for i in (b.get("items") or []) if isinstance(i, dict)]}
        for b in lst("blocs")
    ]
    out["likert"] = [
        {"id": _s(i.get("id"), 32), "dim": _s(i.get("dim"), 4), "comp": _s(i.get("comp"), 32),
         "rev": bool(i.get("rev")), "txt": _s(i.get("txt"), 1000)}
        for i in lst("likert")
    ]
    val = []
    for v in lst("validite"):
        kind = "inc" if v.get("kind") == "inc" else "ds"
        item: dict[str, Any] = {"id": _s(v.get("id"), 32), "kind": kind, "txt": _s(v.get("txt"), 1000)}
        if kind == "inc":
            item["pair"] = _s(v.get("pair"), 32)
            item["opp"] = bool(v.get("opp"))
        val.append(item)
    out["validite"] = val
    out["echelle"] = [{"value": _num(e.get("value"), 0, int), "label": _s(e.get("label"), 120)} for e in lst("echelle")]
    out["extras"] = [_norm_extra(x) for x in lst("extras")]
    out["extrasTitre"] = _s(c.get("extrasTitre"), 200) or DEFAULT_EXTRAS_TITLE
    out["extrasIntro"] = _s(c.get("extrasIntro"), 2000)
    rules = c.get("regles") if isinstance(c.get("regles"), dict) else {}
    poids = rules.get("poids") if isinstance(rules.get("poids"), dict) else {}
    out["regles"] = {
        "poids": {k: max(0.0, _num(poids.get(k), DEFAULT_RULES["poids"][k])) for k in ("sjt", "lik", "extra")},
        "dsSeuil": _num(rules.get("dsSeuil"), DEFAULT_RULES["dsSeuil"], int),
        "incSeuil": _num(rules.get("incSeuil"), DEFAULT_RULES["incSeuil"], int),
        "incNorm": _num(rules.get("incNorm"), DEFAULT_RULES["incNorm"], int),
        "uniformeMin": _num(rules.get("uniformeMin"), DEFAULT_RULES["uniformeMin"], int),
        "uniformeSeuil": _num(rules.get("uniformeSeuil"), DEFAULT_RULES["uniformeSeuil"]),
        "rapideS": _num(rules.get("rapideS"), DEFAULT_RULES["rapideS"], int),
        "melangerOptions": bool(rules.get("melangerOptions", DEFAULT_RULES["melangerOptions"])),
    }
    return out


def _norm_extra(x: dict[str, Any]) -> dict[str, Any]:
    t = x.get("type") if x.get("type") in EXTRA_TYPES else "single"
    e: dict[str, Any] = {
        "id": _s(x.get("id"), 32), "type": t, "txt": _s(x.get("txt")), "aide": _s(x.get("aide"), 1000),
        "required": bool(x.get("required", True)),
        "dim": _s(x.get("dim"), 4) or None, "scored": bool(x.get("scored")) and t in SCORABLE_EXTRAS,
    }
    if t in ("single", "multiple", "ranking"):
        e["options"] = _opts(x.get("options"), points=t != "ranking")
        e["shuffle"] = bool(x.get("shuffle"))
    if t == "multiple":
        e["minChoices"] = max(0, _num(x.get("minChoices"), 1, int))
        e["maxChoices"] = max(0, _num(x.get("maxChoices"), 0, int))  # 0 = no limit
    if t == "yesno":
        e["labels"] = [_s((x.get("labels") or ["Oui", "Non"])[0], 60) or "Oui",
                       _s((x.get("labels") or ["Oui", "Non"])[-1], 60) or "Non"]
        e["pointsOui"] = _num(x.get("pointsOui"), 1, int)
        e["pointsNon"] = _num(x.get("pointsNon"), 0, int)
    if t == "scale":
        e["min"] = _num(x.get("min"), 0, int)
        e["max"] = _num(x.get("max"), 10, int)
        e["step"] = max(1, _num(x.get("step"), 1, int))
        e["minLabel"] = _s(x.get("minLabel"), 80)
        e["maxLabel"] = _s(x.get("maxLabel"), 80)
        e["rev"] = bool(x.get("rev"))
    if t == "text":
        e["multiline"] = bool(x.get("multiline", True))
        e["maxLength"] = min(4000, max(1, _num(x.get("maxLength"), 1000, int)))
        e["dim"], e["scored"] = None, False
    si = x.get("showIf")
    if isinstance(si, dict) and _s(si.get("question")):
        vals = si.get("values") if isinstance(si.get("values"), list) else []
        e["showIf"] = {"question": _s(si.get("question"), 32),
                       "values": [v if isinstance(v, bool) else _num(v, 0, int) for v in vals]}
    else:
        e["showIf"] = None
    return e


def merged_ref(content: dict[str, Any] | None) -> dict[str, Any]:
    """Global referentiel (dims, bands, catégories…) overlaid with a questionnaire's questions."""
    base = R.ref()
    if content is None:
        return {**base, "extras": [], "regles": dict(DEFAULT_RULES), "extrasTitre": DEFAULT_EXTRAS_TITLE,
                "extrasIntro": ""}
    return {**base, **content}


def likall(ref: dict[str, Any]) -> list[dict[str, Any]]:
    """Likert items followed by validity items: the order used by the restitution code."""
    return list(ref["likert"]) + list(ref["validite"])


def scale_bounds(ref: dict[str, Any]) -> tuple[int, int]:
    vals = [e["value"] for e in ref.get("echelle") or []] or [1, 5]
    return min(vals), max(vals)


# ----------------------------------------------------------------------------------- extras helpers

def visible_extras(ref: dict[str, Any], extra_answers: dict[str, Any]) -> list[dict[str, Any]]:
    """Extras whose display condition is met by the answers (conditions chain in order)."""
    shown: dict[str, dict[str, Any]] = {}
    for e in ref.get("extras") or []:
        si = e.get("showIf")
        if si:
            parent = shown.get(si["question"])
            if parent is None or not _matches(parent, extra_answers.get(si["question"]), si["values"]):
                continue
        shown[e["id"]] = e
    return list(shown.values())


def _matches(parent: dict[str, Any], answer: Any, values: list[Any]) -> bool:
    if answer is None:
        return False
    if parent["type"] == "multiple" and isinstance(answer, list):
        return any(v in answer for v in values)
    return answer in values


def clean_extra_answer(e: dict[str, Any], v: Any) -> Any:
    """Validated answer for one extra question, or None when unusable."""
    t = e["type"]
    try:
        if v is None:
            return None
        if t == "single":
            i = int(v)
            return i if 0 <= i < len(e["options"]) else None
        if t == "multiple":
            if not isinstance(v, list):
                return None
            idx = sorted({int(i) for i in v if 0 <= int(i) < len(e["options"])})
            return idx if (not e.get("maxChoices") or len(idx) <= e["maxChoices"]) else None
        if t == "yesno":
            return v if isinstance(v, bool) else None
        if t == "scale":
            x = int(v)
            return x if e["min"] <= x <= e["max"] and (x - e["min"]) % e["step"] == 0 else None
        if t == "ranking":
            if not isinstance(v, list):
                return None
            idx = [int(i) for i in v]
            return idx if sorted(idx) == list(range(len(e["options"]))) else None
        if t == "text":
            s = str(v).strip()[: e.get("maxLength", 1000)]
            return s or None
    except (TypeError, ValueError):
        return None
    return None


def extra_answered(e: dict[str, Any], v: Any) -> bool:
    if v is None:
        return False
    if e["type"] == "multiple":
        return len(v) >= max(1, e.get("minChoices") or 0)
    return True


def extra_points(e: dict[str, Any], v: Any) -> tuple[float, float] | None:
    """(earned, max) for a scored extra; None when unscored or unanswered."""
    if not e.get("scored") or not e.get("dim") or v is None:
        return None
    t = e["type"]
    if t == "single":
        pts = [o["points"] for o in e["options"]]
        return float(pts[v]), float(max(pts + [0]))
    if t == "multiple":
        pts = [o["points"] for o in e["options"]]
        pos = sorted((p for p in pts if p > 0), reverse=True)
        cap = e.get("maxChoices") or len(pos)
        return float(max(0, sum(pts[i] for i in v))), float(sum(pos[:cap]))
    if t == "yesno":
        return float(e["pointsOui"] if v else e["pointsNon"]), float(max(e["pointsOui"], e["pointsNon"], 0))
    if t == "scale":
        span = e["max"] - e["min"]
        frac = (v - e["min"]) / span if span else 0
        return (1 - frac if e.get("rev") else frac), 1.0
    return None


# ----------------------------------------------------------------------------------- validation

# calibrated so the original bank gives ≈ 33 min, as announced to employees ("30 à 35 minutes")
EST_SECONDS = {"situations": 75, "blocs": 45, "likert": 15, "validite": 15, "extras": 25}


def validate(content: dict[str, Any]) -> dict[str, Any]:
    """Blocking errors (publication refused) and warnings, each with a path the editor can focus."""
    c = normalize(content)
    dims = set(R.dim_keys())
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    err = lambda path, msg: errors.append({"path": path, "message": msg})  # noqa: E731
    warn = lambda path, msg: warnings.append({"path": path, "message": msg})  # noqa: E731

    seen: dict[str, str] = {}
    for key in QUESTION_KEYS:
        for i, q in enumerate(c[key]):
            p = f"{key}.{i}"
            if not ID_RE.match(q["id"]):
                err(p, f"Identifiant « {q['id'] or '(vide)'} » invalide : 1 à 16 caractères (lettres, chiffres, - ou _).")
            elif q["id"].lower() in seen:
                err(p, f"Identifiant « {q['id']} » déjà utilisé ({seen[q['id'].lower()]}).")
            else:
                seen[q["id"].lower()] = p
            if key != "blocs" and not q.get("txt"):
                err(p, "Le texte de la question est vide.")
            if key in ("situations", "likert") and q["dim"] not in dims:
                err(p, "Choisissez la dimension mesurée.")

    for i, q in enumerate(c["situations"]):
        p = f"situations.{i}"
        if not 2 <= len(q["options"]) <= 9:
            err(p, "Une mise en situation doit proposer entre 2 et 9 réponses.")
        if any(not o["txt"] for o in q["options"]):
            err(p, "Une réponse est vide.")
        if any(o["points"] < 0 for o in q["options"]):
            err(p, "Les points d'une réponse ne peuvent pas être négatifs.")
        pts = [o["points"] for o in q["options"]]
        if pts and max(pts) == 0:
            err(p, "Au moins une réponse doit rapporter des points.")
        elif pts and pts.count(max(pts)) > 1:
            warn(p, "Plusieurs réponses rapportent le maximum de points.")

    for i, b in enumerate(c["blocs"]):
        p = f"blocs.{i}"
        if not 3 <= len(b["items"]) <= 6:
            err(p, "Un bloc doit contenir entre 3 et 6 affirmations.")
        if any(not it["txt"] for it in b["items"]):
            err(p, "Une affirmation est vide.")
        bd = [it["dim"] for it in b["items"]]
        if any(d not in dims for d in bd):
            err(p, "Chaque affirmation doit être rattachée à une dimension.")
        elif len(set(bd)) != len(bd):
            err(p, "Les affirmations d'un bloc doivent porter sur des dimensions différentes.")

    lik_ids = {i["id"] for i in c["likert"]}
    for i, v in enumerate(c["validite"]):
        if v["kind"] == "inc" and v.get("pair") not in lik_ids:
            err(f"validite.{i}", "Un item de cohérence doit être apparié à un énoncé de pratique existant.")

    ech = [e["value"] for e in c["echelle"]]
    if ech != list(range(1, len(ech) + 1)) or not 2 <= len(ech) <= 9:
        err("echelle", "L'échelle doit compter de 2 à 9 niveaux numérotés 1, 2, 3…")
    if any(not e["label"] for e in c["echelle"]):
        err("echelle", "Chaque niveau de l'échelle doit avoir un libellé.")

    extra_ids: dict[str, dict[str, Any]] = {}
    for i, e in enumerate(c["extras"]):
        p = f"extras.{i}"
        t = e["type"]
        if t in ("single", "multiple", "ranking"):
            if not 2 <= len(e["options"]) <= 20:
                err(p, "Proposez entre 2 et 20 réponses.")
            if any(not o["txt"] for o in e["options"]):
                err(p, "Une réponse est vide.")
        if t == "multiple" and e.get("maxChoices") and e["minChoices"] > e["maxChoices"]:
            err(p, "Le minimum de choix dépasse le maximum.")
        if t == "multiple" and e["minChoices"] > len(e.get("options", [])):
            err(p, "Le minimum de choix dépasse le nombre de réponses.")
        if t == "scale":
            if e["min"] >= e["max"]:
                err(p, "Le minimum de l'échelle doit être inférieur au maximum.")
            elif (e["max"] - e["min"]) / e["step"] > 100:
                err(p, "L'échelle compte trop de valeurs (100 au plus).")
        if e["scored"]:
            if e["dim"] not in dims:
                err(p, "Une question notée doit mesurer une dimension.")
            if t in ("single", "multiple") and max([o["points"] for o in e["options"]] + [0]) <= 0:
                err(p, "Une question notée doit avoir au moins une réponse qui rapporte des points.")
        if t == "text":
            warn(p, "Réponse libre : rappelez aux répondants de ne pas y écrire de données personnelles.")
        si = e.get("showIf")
        if si:
            parent = extra_ids.get(si["question"])
            if parent is None:
                err(p, "La condition d'affichage doit porter sur une question complémentaire placée avant.")
            elif parent["type"] not in ("single", "multiple", "yesno"):
                err(p, "La condition d'affichage doit porter sur une question à choix ou oui/non.")
            elif not si["values"]:
                err(p, "Choisissez la ou les réponses qui déclenchent l'affichage.")
            if e["required"] and si:
                pass  # required only when shown
        extra_ids[e["id"]] = e

    if not c["situations"]:
        err("situations", "Ajoutez au moins une mise en situation.")
    if not c["blocs"]:
        err("blocs", "Ajoutez au moins un bloc de choix forcé.")
    if not c["likert"]:
        err("likert", "Ajoutez au moins un énoncé de pratique.")
    names = R.dim_names()
    for d in sorted(dims):
        scored = (any(q["dim"] == d for q in c["situations"]) or any(q["dim"] == d for q in c["likert"])
                  or any(e["scored"] and e["dim"] == d for e in c["extras"]))
        if not scored:
            err("coverage", f"La dimension {names[d]} n'est mesurée par aucune question : le score global serait impossible.")
        if c["blocs"] and not any(it["dim"] == d for b in c["blocs"] for it in b["items"]):
            err("coverage", f"La dimension {names[d]} n'apparaît dans aucun bloc de choix forcé.")
        if sum(q["dim"] == d for q in c["likert"]) < 3 and c["likert"]:
            warn("coverage", f"{names[d]} : moins de 3 énoncés de pratique, la mesure sera fragile.")
    per_dim = {d: sum(q["dim"] == d for q in c["situations"]) for d in dims}
    if c["situations"] and len(set(per_dim.values())) > 1:
        warn("coverage", "Les mises en situation ne sont pas réparties également entre les dimensions.")
    if c["likert"] and not any(i["rev"] for i in c["likert"]):
        warn("likert", "Aucun énoncé inversé : les réponses « tout en haut » ne seront pas détectées.")

    r = c["regles"]
    if r["poids"]["sjt"] + r["poids"]["lik"] + r["poids"]["extra"] <= 0:
        err("regles", "La somme des poids doit être positive.")
    if any(e["scored"] for e in c["extras"]) and r["poids"]["extra"] == 0:
        warn("regles", "Des questions complémentaires sont notées mais leur poids est nul.")
    n_ds = sum(v["kind"] == "ds" for v in c["validite"])
    if n_ds and r["dsSeuil"] > n_ds:
        warn("regles", "Le seuil de désirabilité dépasse le nombre d'items de désirabilité : il ne se déclenchera jamais.")
    if not c["validite"]:
        warn("validite", "Aucun item de contrôle : la désirabilité sociale et la cohérence ne seront pas mesurées.")
    if c["likert"] and r["uniformeMin"] > len(c["likert"]):
        warn("regles", "Le contrôle des réponses uniformes ne s'appliquera jamais (pas assez d'énoncés).")
    if not 0 < r["uniformeSeuil"] <= 1:
        err("regles", "Le seuil de réponses uniformes doit être compris entre 0 et 1.")

    return {"errors": errors, "warnings": warnings, "stats": stats(c)}


def stats(c: dict[str, Any]) -> dict[str, Any]:
    dims = R.dim_keys()
    counts = {k: len(c[k]) for k in QUESTION_KEYS}
    by_dim = {d: {"situations": sum(q["dim"] == d for q in c["situations"]),
                  "likert": sum(q["dim"] == d for q in c["likert"]),
                  "blocs": sum(it["dim"] == d for b in c["blocs"] for it in b["items"]),
                  "extras": sum(bool(e["scored"]) and e["dim"] == d for e in c["extras"])} for d in dims}
    seconds = sum(counts[k] * EST_SECONDS[k] for k in QUESTION_KEYS)
    return {"counts": counts, "total": sum(counts.values()), "by_dim": by_dim,
            "duration_min": round(seconds / 60), "extra_types": {t: sum(e["type"] == t for e in c["extras"])
                                                                 for t in EXTRA_TYPES}}


# ----------------------------------------------------------------------------------- DB helpers

def default_questionnaire(db: Session):
    from app.models import Questionnaire, QStatus

    return db.scalar(select(Questionnaire).where(Questionnaire.status == QStatus.published)
                     .order_by(Questionnaire.id).limit(1))


def ensure_default(db: Session) -> None:
    """First start: the legacy bank becomes published version 1, and campaigns without a questionnaire use it."""
    from app.models import Campaign, Questionnaire, QStatus

    q = db.scalar(select(Questionnaire).order_by(Questionnaire.id).limit(1))
    if q is None:
        q = Questionnaire(label="TAC-SUNU — référentiel d'origine", version=1, status=QStatus.published,
                          description="Banque d'items du test HTML d'origine (TAC1).", content=default_content(),
                          created_by="système", published_by="système", published_at=datetime.now(UTC))
        db.add(q)
        db.flush()
    default = default_questionnaire(db) or q
    for c in db.scalars(select(Campaign).where(Campaign.questionnaire_id.is_(None))):
        c.questionnaire_id = default.id


def ref_for_campaign(db: Session | None, campaign, matricule: str | None = None) -> dict[str, Any]:
    """The campaign's questions. With a matricule and a campaign draw (`tirage`), only that person's questions."""
    q = getattr(campaign, "questionnaire", None) if campaign is not None else None
    if q is None and db is not None and campaign is not None and campaign.questionnaire_id:
        from app.models import Questionnaire

        q = db.get(Questionnaire, campaign.questionnaire_id)
    ref = merged_ref(q.content if q is not None else None)
    tirage = normalize_tirage(getattr(campaign, "tirage", None))
    if matricule and tirage:
        return draw(ref, tirage, f"{campaign.code}|{matricule.strip().lower()}")
    return ref


# ----------------------------------------------------------------------------------- random draw per respondent
#
# A campaign may ask each respondent only N questions of a category, drawn from the questionnaire's bank
# (campaign.tirage = {"situations": 5, "blocs": 7, ...}; missing key = every question). The draw is seeded by
# campaign code + matricule: the same person always gets the same questions (draft resumed, server re-scoring,
# TAC1 codes — which carry both — decoded against the right positions), and nothing needs to be stored.
# Scoring only ever iterates the questions of the ref it gets, so scores are computed on the questions asked.
# The extras are never drawn (their display conditions chain from one question to the next).

TIRAGE_KEYS = ("situations", "blocs", "likert", "validite")


def normalize_tirage(raw: Any) -> dict[str, int] | None:
    if not isinstance(raw, dict):
        return None
    out = {}
    for k in TIRAGE_KEYS:
        v = raw.get(k)
        if v is None or v == "":
            continue
        n = _num(v, 0, int)
        if n >= 1:
            out[k] = n
    return out or None


def _round_robin(items: list[dict[str, Any]], n: int, rng, key: str) -> list[dict[str, Any]]:
    """n items spread as evenly as possible across the values of `key` (dimension, kind), in bank order."""
    if n >= len(items):
        return list(items)
    groups: dict[str, list[int]] = {}
    for i, it in enumerate(items):
        groups.setdefault(it.get(key) or "", []).append(i)
    order = list(groups)
    rng.shuffle(order)
    for g in order:
        rng.shuffle(groups[g])
    picked: list[int] = []
    while len(picked) < n:
        for g in order:
            if groups[g] and len(picked) < n:
                picked.append(groups[g].pop())
    return [items[i] for i in sorted(picked)]


def _draw_blocs(blocs: list[dict[str, Any]], n: int, rng) -> list[dict[str, Any]]:
    """n blocs, chosen first so that every dimension appears in at least one, then at random."""
    if n >= len(blocs):
        return list(blocs)
    idx = list(range(len(blocs)))
    rng.shuffle(idx)
    picked: list[int] = []
    seen: set[str] = set()
    for i in idx:
        dims = {it["dim"] for it in blocs[i]["items"]}
        if len(picked) < n and not dims <= seen:
            picked.append(i)
            seen |= dims
    for i in idx:
        if len(picked) >= n:
            break
        if i not in picked:
            picked.append(i)
    return [blocs[i] for i in sorted(picked)]


def draw(ref: dict[str, Any], tirage: dict[str, int], seed: str) -> dict[str, Any]:
    import random

    rng = random.Random(seed)  # str seeds are hashed with SHA-512: stable across runs and Python versions
    out = dict(ref)
    if "situations" in tirage:
        out["situations"] = _round_robin(ref["situations"], tirage["situations"], rng, "dim")
    if "blocs" in tirage:
        out["blocs"] = _draw_blocs(ref["blocs"], tirage["blocs"], rng)
    if "likert" in tirage:
        out["likert"] = _round_robin(ref["likert"], tirage["likert"], rng, "dim")
    # consistency twins are only usable when their paired practice item was drawn
    lik_ids = {i["id"] for i in out["likert"]}
    eligible = [v for v in ref["validite"] if v["kind"] != "inc" or v.get("pair") in lik_ids]
    out["validite"] = (_round_robin(eligible, tirage["validite"], rng, "kind") if "validite" in tirage
                       else eligible)
    return out


def tirage_check(content: dict[str, Any], tirage: dict[str, int] | None) -> dict[str, list[str]]:
    """Errors (refused) and warnings of a campaign draw against a questionnaire."""
    errors: list[str] = []
    warnings: list[str] = []
    if not tirage:
        return {"errors": errors, "warnings": warnings}
    c = normalize(content)
    names = R.dim_names()
    for k in ("situations", "blocs", "likert"):
        if k in tirage and tirage[k] >= len(c[k]):
            warnings.append(f"{_LABELS[k]} : {tirage[k]} demandés pour {len(c[k])} disponibles, "
                            f"toutes seront posées.")

    def guaranteed(key: str, d: str) -> bool:
        present = {q["dim"] for q in c[key]}
        if d not in present:
            return False
        return key not in tirage or tirage[key] >= len(present)

    for d in R.dim_keys():
        if not (guaranteed("situations", d) or guaranteed("likert", d)
                or any(e["scored"] and e["dim"] == d for e in c["extras"])):
            errors.append(f"Avec ce tirage, la dimension {names[d]} pourrait n'être mesurée par aucune question "
                          f"pour certains collaborateurs (score global impossible). Tirez au moins autant de mises "
                          f"en situation ou d'énoncés que de dimensions.")
    if "blocs" in tirage:
        n_dims = len({it["dim"] for b in c["blocs"] for it in b["items"]})
        per_bloc = max((len(b["items"]) for b in c["blocs"]), default=1)
        if tirage["blocs"] * per_bloc < n_dims:
            warnings.append("Trop peu de blocs tirés pour que chaque dimension apparaisse en choix forcé.")
    r = c["regles"]
    n_lik = min(tirage.get("likert", len(c["likert"])), len(c["likert"]))
    if c["likert"] and r["uniformeMin"] > n_lik:
        warnings.append(f"Le contrôle des réponses uniformes demande {r['uniformeMin']} énoncés : "
                        f"il ne s'appliquera pas avec {n_lik}.")
    if c["validite"] and ("validite" in tirage or "likert" in tirage):
        warnings.append("Items de contrôle : seuls ceux tirés (et les items de cohérence dont l'énoncé apparié "
                        "a été tiré) sont posés ; les seuils de validité s'appliquent à ce sous-ensemble.")
    return {"errors": errors, "warnings": warnings}


_LABELS = {"situations": "Mises en situation", "blocs": "Blocs de choix forcé", "likert": "Énoncés de pratique",
           "validite": "Items de contrôle"}
