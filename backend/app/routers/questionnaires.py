"""Questionnaire builder (HR console): versions, editing, publication, item statistics.

Reads are open to HR (labels shown on campaigns); every change is DRH Groupe only and audited.
"""

from __future__ import annotations

import json
import random
from collections import Counter
from datetime import UTC, datetime
from math import sqrt
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from sqlalchemy import func, select

from app import questionnaire as Q
from app.config import settings
from app.models import Campaign, Questionnaire, QStatus, Submission
from app.routers.meta import is_open
from app.schemas import ContentIn, QuestionnaireCreate, QuestionnaireUpdate
from app.security import DB, Admin, CurrentUser, Scope, audit
from app.services import filtered_query

router = APIRouter(tags=["questionnaires"])


def _usage(db, qid: int) -> tuple[list[Campaign], int]:
    camps = list(db.scalars(select(Campaign).where(Campaign.questionnaire_id == qid)
                            .order_by(Campaign.position, Campaign.id)))
    n = db.scalar(select(func.count(Submission.id)).where(Submission.campaign_id.in_([c.id for c in camps]))) \
        if camps else 0
    return camps, n or 0


def _out(db, q: Questionnaire, full: bool = False) -> dict[str, Any]:
    camps, n = _usage(db, q.id)
    out: dict[str, Any] = {
        "id": q.id, "label": q.label, "description": q.description, "version": q.version,
        "status": q.status.value, "revision": q.revision, "based_on_id": q.based_on_id,
        "created_by": q.created_by, "created_at": q.created_at, "updated_by": q.updated_by,
        "updated_at": q.updated_at, "published_by": q.published_by, "published_at": q.published_at,
        "campaigns": [{"id": c.id, "code": c.code, "label": c.label, "active": c.active, "open": is_open(c)}
                      for c in camps],
        "submissions": n,
        "stats": Q.stats(Q.normalize(q.content)),
    }
    if full:
        out["content"] = q.content
        out["validation"] = Q.validate(q.content)
    return out


def _get(db, qid: int) -> Questionnaire:
    q = db.get(Questionnaire, qid)
    if q is None:
        raise HTTPException(404, "Questionnaire introuvable.")
    return q


def _next_version(db) -> int:
    return (db.scalar(select(func.max(Questionnaire.version))) or 0) + 1


@router.get("/questionnaires")
def list_questionnaires(db: DB, _: Scope):
    rows = db.scalars(select(Questionnaire).order_by(Questionnaire.version.desc()))
    return [_out(db, q) for q in rows]


@router.get("/questionnaires/{qid}")
def get_questionnaire(qid: int, db: DB, _: Scope):
    return _out(db, _get(db, qid), full=True)


@router.post("/questionnaires")
def create_questionnaire(body: QuestionnaireCreate, db: DB, admin: Admin):
    based_on = None
    if body.from_id:
        src = _get(db, body.from_id)
        content, based_on = Q.normalize(src.content), src.id
    elif body.content is not None:
        content = Q.normalize(body.content)
    elif body.template == "vide":
        content = Q.blank_content()
    else:
        content = Q.default_content()
    q = Questionnaire(label=body.label.strip(), description=(body.description or "").strip() or None,
                      version=_next_version(db), status=QStatus.draft, content=content, revision=1,
                      based_on_id=based_on, created_by=admin.username, updated_by=admin.username)
    db.add(q)
    db.flush()
    origin = f"copie de #{based_on}" if based_on else ("import" if body.content is not None else body.template or "origine")
    audit(db, admin, "questionnaire.create", f"v{q.version} {q.label} ({origin})")
    db.commit()
    return _out(db, q, full=True)


@router.put("/questionnaires/{qid}")
def update_questionnaire(qid: int, body: QuestionnaireUpdate, db: DB, admin: Admin):
    q = _get(db, qid)
    if q.status != QStatus.draft:
        raise HTTPException(409, "Une version publiée ne se modifie pas : créez une nouvelle version à partir d'elle.")
    if body.revision != q.revision:
        raise HTTPException(409, f"Ce brouillon a été modifié entre-temps par {q.updated_by or 'un autre utilisateur'}. "
                                 "Rechargez-le avant d'enregistrer.")
    if body.label is not None:
        q.label = body.label.strip()
    if body.description is not None:
        q.description = body.description.strip() or None
    if body.content is not None:
        q.content = Q.normalize(body.content)
    q.revision += 1
    q.updated_by = admin.username
    q.updated_at = datetime.now(UTC)
    audit(db, admin, "questionnaire.update", f"v{q.version} rev {q.revision}")
    db.commit()
    return _out(db, q, full=True)


@router.post("/questionnaires/validate")
def validate_content(body: ContentIn, _: Admin):
    """Live validation of unsaved editor content."""
    return Q.validate(body.content)


@router.post("/questionnaires/{qid}/publish")
def publish(qid: int, db: DB, admin: Admin):
    q = _get(db, qid)
    if q.status != QStatus.draft:
        raise HTTPException(409, "Seul un brouillon peut être publié.")
    rep = Q.validate(q.content)
    if rep["errors"]:
        raise HTTPException(422, f"{len(rep['errors'])} erreur(s) à corriger avant publication.")
    q.content = Q.normalize(q.content)
    q.status = QStatus.published
    q.published_by, q.published_at = admin.username, datetime.now(UTC)
    q.revision += 1
    audit(db, admin, "questionnaire.publish", f"v{q.version} {q.label}")
    db.commit()
    return _out(db, q, full=True)


@router.post("/questionnaires/{qid}/archive")
def archive(qid: int, db: DB, admin: Admin):
    q = _get(db, qid)
    if q.status != QStatus.published:
        raise HTTPException(409, "Seule une version publiée peut être archivée.")
    camps, _ = _usage(db, q.id)
    if any(c.active for c in camps):
        raise HTTPException(409, "Cette version est utilisée par une campagne active : changez d'abord son questionnaire.")
    q.status = QStatus.archived
    audit(db, admin, "questionnaire.archive", f"v{q.version}")
    db.commit()
    return _out(db, q, full=True)


@router.post("/questionnaires/{qid}/restore")
def restore(qid: int, db: DB, admin: Admin):
    q = _get(db, qid)
    if q.status != QStatus.archived:
        raise HTTPException(409, "Cette version n'est pas archivée.")
    q.status = QStatus.published
    audit(db, admin, "questionnaire.restore", f"v{q.version}")
    db.commit()
    return _out(db, q, full=True)


@router.delete("/questionnaires/{qid}", status_code=204)
def delete(qid: int, db: DB, admin: Admin):
    q = _get(db, qid)
    camps, n = _usage(db, q.id)
    if camps or n:
        raise HTTPException(409, "Cette version est rattachée à une campagne : elle ne peut pas être supprimée.")
    if q.status == QStatus.published:
        raise HTTPException(409, "Archivez cette version publiée plutôt que de la supprimer.")
    for child in db.scalars(select(Questionnaire).where(Questionnaire.based_on_id == q.id)):
        child.based_on_id = None
    audit(db, admin, "questionnaire.delete", f"v{q.version} {q.label}")
    db.delete(q)
    db.commit()


@router.get("/questionnaires/{qid}/export")
def export(qid: int, db: DB, admin: Admin):
    q = _get(db, qid)
    payload = {"format": "tac-sunu-questionnaire", "formatVersion": 1, "label": q.label,
               "description": q.description, "version": q.version, "status": q.status.value,
               "exportedAt": datetime.now(UTC).isoformat(), "content": Q.normalize(q.content)}
    audit(db, admin, "questionnaire.export", f"v{q.version}")
    db.commit()
    return Response(json.dumps(payload, ensure_ascii=False, indent=2), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="questionnaire-v{q.version}.json"'})


# ------------------------------------------------------------------------------------ item statistics

def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    return sxy / sqrt(sxx * syy) if sxx and syy else None


@router.get("/questionnaires/{qid}/stats")
def item_stats(qid: int, db: DB, scope: Scope, campaign_id: int | None = None):
    """Answer distribution per item and discrimination (item ↔ dimension score correlation), valid tests only.

    Collective data: hidden below MIN_GROUP_SIZE respondents, never linked to a person."""
    q = _get(db, qid)
    camps, _ = _usage(db, q.id)
    ids = [c.id for c in camps if campaign_id in (None, c.id)]
    rows = [r for r in db.scalars(filtered_query(scope).where(Submission.campaign_id.in_(ids or [-1])))
            if not r.invalide]
    n = len(rows)
    out: dict[str, Any] = {"n": n, "min_group_size": settings.min_group_size, "masked": n < settings.min_group_size,
                           "items": {}}
    if out["masked"]:
        return out
    ref = Q.merged_ref(Q.normalize(q.content))
    lo, hi = Q.scale_bounds(ref)
    final = [r.scores.get("final", {}) for r in rows]
    items: dict[str, Any] = {}

    for it in ref["situations"]:
        ans = [(r.answers.get("sit", {}).get(it["id"]), f) for r, f in zip(rows, final)]
        ans = [(a, f) for a, f in ans if a is not None]
        cnt = Counter(a for a, _ in ans)
        pts = [it["options"][a]["points"] for a, _ in ans if a < len(it["options"])]
        mx = max(o["points"] for o in it["options"]) or 1
        items[it["id"]] = {
            "n": len(ans), "options": [cnt.get(k, 0) for k in range(len(it["options"]))],
            "mean_pct": (sum(pts) / len(pts) / mx * 100) if pts else None,
            "discrimination": _pearson([float(p) for p in pts],
                                       [f.get(it["dim"]) or 0.0 for a, f in ans if a < len(it["options"])]),
        }
    for b in ref["blocs"]:
        most = Counter()
        least = Counter()
        for r in rows:
            c = r.answers.get("bloc", {}).get(b["id"]) or {}
            if c.get("most") is not None:
                most[c["most"]] += 1
            if c.get("least") is not None:
                least[c["least"]] += 1
        items[b["id"]] = {"n": sum(most.values()), "most": [most.get(k, 0) for k in range(len(b["items"]))],
                          "least": [least.get(k, 0) for k in range(len(b["items"]))]}
    for it in Q.likall(ref):
        vals = [(r.answers.get("lik", {}).get(it["id"]), f) for r, f in zip(rows, final)]
        vals = [(v, f) for v, f in vals if v is not None]
        cnt = Counter(v for v, _ in vals)
        entry: dict[str, Any] = {"n": len(vals), "distribution": [cnt.get(k, 0) for k in range(lo, hi + 1)],
                                 "mean": (sum(v for v, _ in vals) / len(vals)) if vals else None}
        if it in ref["likert"]:
            aligned = [float(lo + hi - v if it["rev"] else v) for v, _ in vals]
            entry["discrimination"] = _pearson(aligned, [f.get(it["dim"]) or 0.0 for _, f in vals])
        items[it["id"]] = entry
    for e in ref.get("extras") or []:
        vals = [r.answers.get("extra", {}).get(e["id"]) for r in rows]
        vals = [v for v in vals if v is not None]
        entry = {"n": len(vals)}
        if e["type"] in ("single", "multiple"):
            cnt = Counter(i for v in vals for i in (v if isinstance(v, list) else [v]))
            entry["options"] = [cnt.get(k, 0) for k in range(len(e["options"]))]
        elif e["type"] == "yesno":
            entry["options"] = [sum(1 for v in vals if v is True), sum(1 for v in vals if v is False)]
        elif e["type"] == "scale":
            cnt = Counter(vals)
            entry["distribution"] = [cnt.get(k, 0) for k in range(e["min"], e["max"] + 1, e["step"])]
            entry["mean"] = sum(vals) / len(vals) if vals else None
        elif e["type"] == "ranking":
            # mean rank of each option (1 = first)
            ranks = {k: [] for k in range(len(e["options"]))}
            for v in vals:
                for pos, k in enumerate(v):
                    ranks.setdefault(k, []).append(pos + 1)
            entry["mean_rank"] = [sum(x) / len(x) if x else None for _, x in sorted(ranks.items())]
        elif e["type"] == "text":
            texts = [str(v) for v in vals]
            random.shuffle(texts)  # no link with the order of submissions
            entry["texts"] = texts[:300]
        items[e["id"]] = entry
    out["items"] = items
    audit(db, scope.user, "questionnaire.stats", f"v{q.version} n={n}")
    db.commit()
    return out


# ------------------------------------------------------------------------------------ test app

@router.get("/campaigns/{cid}/questionnaire")
def campaign_questionnaire(cid: int, db: DB, user: CurrentUser):
    """The questions of a campaign, for the employee test (open campaigns) or HR (any campaign)."""
    c = db.get(Campaign, cid)
    if c is None:
        raise HTTPException(404, "Campagne introuvable.")
    from app.security import HrScope

    if not is_open(c) and not HrScope(user).is_hr:
        raise HTTPException(404, "Campagne introuvable.")
    ref = Q.ref_for_campaign(db, c, user.username)
    return {**ref, "questionnaire_id": c.questionnaire_id, "tirage": Q.normalize_tirage(c.tirage)}
