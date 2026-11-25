"""Domain services: storing submissions and computing collective results."""

from __future__ import annotations

import csv
import io
from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import ldap, questionnaire as Q, referentiel as R
from app.config import settings
from app.models import Campaign, Company, Source, Submission, User
from app.scoring import calcul, js_round


def _clean_answers(sit: dict, bloc: dict, lik: dict, ref: dict | None = None,
                   extra: dict | None = None) -> tuple[dict, dict, dict, dict]:
    ref = ref or Q.merged_ref(None)
    lo, hi = Q.scale_bounds(ref)
    sit_ids = {q["id"]: len(q["options"]) for q in ref["situations"]}
    bloc_ids = {b["id"]: len(b["items"]) for b in ref["blocs"]}
    lik_ids = {i["id"] for i in Q.likall(ref)}
    s = {k: int(v) for k, v in (sit or {}).items() if k in sit_ids and v is not None and 0 <= int(v) < sit_ids[k]}
    b: dict[str, dict[str, int | None]] = {}
    for k, v in (bloc or {}).items():
        if k not in bloc_ids or not v:
            continue
        v = v if isinstance(v, dict) else v.model_dump()
        n = bloc_ids[k]
        m, l = v.get("most"), v.get("least")
        m = int(m) if m is not None and 0 <= int(m) < n else None
        l = int(l) if l is not None and 0 <= int(l) < n else None
        b[k] = {"most": m, "least": l}
    li = {k: int(v) for k, v in (lik or {}).items() if k in lik_ids and v is not None and lo <= int(v) <= hi}
    ex: dict = {}
    raw = extra or {}
    for e in ref.get("extras") or []:
        v = Q.clean_extra_answer(e, raw.get(e["id"]))
        if v is not None:
            ex[e["id"]] = v
    # answers to questions hidden by their display condition are dropped
    visible = {e["id"] for e in Q.visible_extras(ref, ex)}
    ex = {k: v for k, v in ex.items() if k in visible}
    return s, b, li, ex


def is_complete(sit: dict, bloc: dict, lik: dict, ref: dict | None = None, extra: dict | None = None) -> bool:
    ref = ref or Q.merged_ref(None)
    extra = {e["id"]: Q.clean_extra_answer(e, (extra or {}).get(e["id"])) for e in ref.get("extras") or []}
    extra = {k: v for k, v in extra.items() if v is not None}
    return (
        all(q["id"] in sit for q in ref["situations"])
        and all(
            b["id"] in bloc and bloc[b["id"]].get("most") is not None and bloc[b["id"]].get("least") is not None
            and bloc[b["id"]]["most"] != bloc[b["id"]]["least"]
            for b in ref["blocs"]
        )
        and all(i["id"] in lik for i in Q.likall(ref))
        and all(Q.extra_answered(e, extra.get(e["id"])) for e in Q.visible_extras(ref, extra) if e["required"])
    )


def upsert_submission(
    db: Session,
    *,
    matricule: str,
    campaign: Campaign,
    sit: dict,
    bloc: dict,
    lik: dict,
    duree_s: int | None,
    user: User | None,
    company: Company | None,
    filiale_label: str | None,
    categorie: str | None,
    famille: str | None,
    source: Source,
    started_at: datetime | None = None,
    submitted_at: datetime | None = None,
    created_by: int | None = None,
    extra: dict | None = None,
) -> tuple[Submission, bool]:
    """Score (server-side, authoritative) with the campaign's questionnaire; insert or replace (matricule + campaign)."""
    ref = Q.ref_for_campaign(db, campaign, matricule)
    sit, bloc, lik, extra = _clean_answers(sit, bloc, lik, ref, extra)
    r = calcul(sit, bloc, lik, duree_s, ref, extra).to_dict()
    sub = db.scalar(
        select(Submission).where(
            func.lower(Submission.matricule) == matricule.lower(), Submission.campaign_id == campaign.id
        )
    )
    replaced = sub is not None
    if sub is None:
        sub = Submission(matricule=matricule, campaign_id=campaign.id)
        db.add(sub)
    sub.user_id = user.id if user else None
    sub.company_id = company.id if company else None
    sub.filiale_label = filiale_label or (company.name if company else None)
    sub.categorie, sub.famille = categorie, famille
    sub.started_at = started_at
    sub.submitted_at = submitted_at or datetime.now(UTC)
    sub.duree_s = duree_s
    sub.answers = {"sit": sit, "bloc": bloc, "lik": lik, **({"extra": extra} if extra else {})}
    sub.scores = {"final": r["scores"], "sjt": r["sjt"], "lik": r["lik"], **({"extra": r["extra"]} if r["extra"] else {})}
    sub.global_score = r["global"]
    sub.dom = r["dom"]
    sub.dom_haut, sub.dom_bas = r["domHaut"], r["domBas"]
    sub.ds, sub.inc = r["ds"], r["inc"]
    sub.uniforme, sub.rapide, sub.ds_haut, sub.invalide = r["uniforme"], r["rapide"], r["dsHaut"], r["invalide"]
    sub.source = source
    sub.created_by = created_by
    db.flush()
    return sub, replaced


def submission_out(s: Submission, with_answers: bool = False) -> dict[str, Any]:
    out = {
        "id": s.id,
        "matricule": s.matricule,
        "user_id": s.user_id,
        "company_id": s.company_id,
        "filiale": s.filiale_label,
        "categorie": s.categorie,
        "famille": s.famille,
        "campaign": {"id": s.campaign.id, "code": s.campaign.code, "label": s.campaign.label},
        "submitted_at": s.submitted_at,
        "duree_s": s.duree_s,
        "global": s.global_score,
        "scores": s.scores.get("final", {}),
        "sjt": s.scores.get("sjt", {}),
        "lik": s.scores.get("lik", {}),
        "extra": s.scores.get("extra"),
        "dom": s.dom,
        "dom_haut": s.dom_haut,
        "dom_bas": s.dom_bas,
        "ds": s.ds,
        "inc": s.inc,
        "uniforme": s.uniforme,
        "rapide": s.rapide,
        "ds_haut": s.ds_haut,
        "invalide": s.invalide,
        "profil": None if s.invalide else R.bande(s.global_score),
        "source": s.source.value,
    }
    out["questionnaire_id"] = s.campaign.questionnaire_id
    if with_answers:
        out["answers"] = s.answers
    return out


# ---------------------------------------------------------------- import (legacy pilot data)

def campaign_by_code(db: Session, code: str | None) -> Campaign:
    code = (code or "T0").strip() or "T0"
    c = db.scalar(select(Campaign).where(Campaign.code == code))
    if c is None:
        d = Q.default_questionnaire(db)
        c = Campaign(code=code, label=f"Campagne {code}", active=False, position=99,
                     questionnaire_id=d.id if d else None)
        db.add(c)
        db.flush()
    return c


def resolve_identity(db: Session, matricule: str, filiale: str | None, cache: dict) -> tuple[User | None, Company | None]:
    user = db.scalar(select(User).where(func.lower(User.username) == matricule.lower())) if matricule else None
    if user is not None:
        return user, user.company
    company = ldap.find_or_create_company(db, filiale, cache) if filiale else None
    return None, company


# ---------------------------------------------------------------- collective results

def _mean(xs: list[float]) -> float | None:
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def _aggregate(rows: list[Submission]) -> dict[str, Any]:
    dims = R.dim_keys()
    n = len(rows)
    return {
        "n": n,
        "global": _mean([r.global_score for r in rows]),
        "scores": {d: _mean([r.scores.get("final", {}).get(d) for r in rows]) for d in dims},
        "aligned_pct": (sum(1 for r in rows if (r.global_score or 0) >= 65) / n * 100) if n else None,
    }


def _masked(agg: dict[str, Any]) -> dict[str, Any]:
    if agg["n"] >= settings.min_group_size:
        return {**agg, "masked": False}
    return {"n": agg["n"], "global": None, "scores": {d: None for d in R.dim_keys()}, "aligned_pct": None,
            "masked": True}


def filtered_query(scope, campaign_id=None, company_id=None, categorie=None, famille=None):
    q = select(Submission)
    if not scope.all_companies:
        q = q.where(Submission.company_id.in_(scope.company_ids or {-1}))
    if campaign_id:
        q = q.where(Submission.campaign_id == campaign_id)
    if company_id:
        q = q.where(Submission.company_id == company_id)
    if categorie:
        q = q.where(Submission.categorie == categorie)
    if famille:
        q = q.where(Submission.famille == famille)
    return q


def summary(db: Session, scope, campaign_id=None, company_id=None, categorie=None, famille=None) -> dict[str, Any]:
    ref = R.ref()
    names = R.dim_names()
    rows = list(db.scalars(filtered_query(scope, campaign_id, company_id, categorie, famille)))
    valid = [r for r in rows if not r.invalide]
    agg = _aggregate(valid)

    ranking = sorted(
        [(d, agg["scores"][d]) for d in R.dim_keys() if agg["scores"][d] is not None], key=lambda t: t[1]
    )
    bands = Counter(R.bande(r.global_score) for r in valid)

    def groups(attr: str) -> list[dict[str, Any]]:
        m: dict[str, list[Submission]] = defaultdict(list)
        for r in valid:
            m[getattr(r, attr) or "Non renseigné"].append(r)
        return [{"key": k, **_masked(_aggregate(v))} for k, v in sorted(m.items(), key=lambda kv: -len(kv[1]))]

    # campaign trend (all campaigns, same other filters)
    trend = []
    all_rows = list(db.scalars(filtered_query(scope, None, company_id, categorie, famille)))
    camps = list(db.scalars(select(Campaign).order_by(Campaign.position, Campaign.id)))
    for c in camps:
        cr = [r for r in all_rows if r.campaign_id == c.id and not r.invalide]
        if cr:
            trend.append({"campaign_id": c.id, "code": c.code, "label": c.label, **_masked(_aggregate(cr))})

    # population for participation rate
    pop_q = select(func.count(User.id)).where(User.active.is_(True), User.password_hash.is_(None))
    if company_id:
        pop_q = pop_q.where(User.company_id == company_id)
    elif not scope.all_companies:
        pop_q = pop_q.where(User.company_id.in_(scope.company_ids or {-1}))
    population = db.scalar(pop_q) or 0

    dom_haut = Counter(r.dom_haut for r in valid)
    dom_bas = Counter(r.dom_bas for r in valid)
    campaigns_present = sorted({r.campaign.code for r in rows})
    return {
        "total": len(rows),
        "valid": len(valid),
        "invalid": len(rows) - len(valid),
        "population": population,
        "participation_pct": (len(rows) / population * 100) if population else None,
        "global": agg["global"],
        "aligned_pct": agg["aligned_pct"],
        "par_dim": agg["scores"],
        "ranking": [
            {"rank": i + 1, "dim": d, "label": names[d], "score": s, "priority": i < 2}
            for i, (d, s) in enumerate(ranking)
        ],
        "bands": [
            {"label": b["label"], "count": bands.get(b["label"], 0),
             "pct": (bands.get(b["label"], 0) / len(valid) * 100) if valid else 0}
            for b in ref["bandes"]
        ],
        "dominance": [
            {"dim": d, "label": names[d], "haut": dom_haut.get(d, 0), "bas": dom_bas.get(d, 0)}
            for d in R.dim_keys()
        ],
        "groups": {"filiale": groups("filiale_label"), "categorie": groups("categorie"), "famille": groups("famille")},
        "trend": trend,
        "campaigns_present": campaigns_present,
        "min_group_size": settings.min_group_size,
    }


CSV_HEAD = ["matricule", "entite", "categorie", "famille", "campagne", "date", "global", "profil",
            "Héritage", "Collaboration", "Autonomie", "Performance",
            "dominance_haute", "dominance_basse", "DS", "INC", "exploitable"]


def export_csv(rows: list[Submission]) -> str:
    """Same format as the legacy console: ';' separator, all fields quoted, UTF-8 BOM, CRLF."""
    names = R.dim_names()
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    w.writerow(CSV_HEAD)
    for r in rows:
        inv = r.invalide
        sc = r.scores.get("final", {})
        w.writerow([
            r.matricule, r.filiale_label or "", r.categorie or "", r.famille or "", r.campaign.code,
            r.submitted_at.isoformat() if r.submitted_at else "",
            "" if inv or r.global_score is None else js_round(r.global_score),
            "" if inv else R.bande(r.global_score),
            *["" if inv or sc.get(d) is None else js_round(sc[d]) for d in R.dim_keys()],
            "" if inv else names.get(r.dom_haut, ""), "" if inv else names.get(r.dom_bas, ""),
            r.ds, r.inc, "non" if inv else "oui",
        ])
    return "﻿" + buf.getvalue()
