"""Claude-powered endpoints: employee debrief + coach (after submission only), HR insights + assistant.

Streaming endpoints answer with Server-Sent Events: `delta` {t}, `tool` {name, input}, `done` {}, `error` {detail}.
All DB work happens before the stream starts; the stream itself opens its own short sessions.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import date
from typing import Any, Literal

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import ai
from app import referentiel as R
from app.config import settings
from app.db import SessionLocal
from app.models import AiCache, AiUsage, Campaign, Company, Submission, User
from app.routers.me import _existing
from app.security import DB, CurrentUser, HrScope, Scope, audit
from app.services import filtered_query, summary


def _require_ai() -> None:
    if not settings.ai_enabled:
        raise HTTPException(503, "Les fonctions d'IA ne sont pas activées sur ce serveur.")


router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(_require_ai)])

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def _sse(gen: Iterable[str]) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/event-stream", headers=SSE_HEADERS)


# ------------------------------------------------------------------------------------- schemas


class ChatMsg(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class _Chat(BaseModel):
    messages: list[ChatMsg] = Field(min_length=1, max_length=30)

    @field_validator("messages")
    @classmethod
    def _ends_with_user(cls, v: list[ChatMsg]) -> list[ChatMsg]:
        if v[0].role != "user" or v[-1].role != "user":
            raise ValueError("La conversation doit commencer et se terminer par un message de l'utilisateur.")
        return v


class DebriefIn(BaseModel):
    campaign_id: int


class CoachIn(_Chat):
    campaign_id: int


class AskIn(_Chat):
    pass


class InsightsIn(BaseModel):
    campaign_id: int | None = None
    company_id: int | None = None
    categorie: str | None = None
    famille: str | None = None
    refresh: bool = False


# ------------------------------------------------------------------------------------- helpers


def _cache_get(db: Session, kind: str, key: str) -> AiCache | None:
    return db.scalar(select(AiCache).where(AiCache.kind == kind, AiCache.key == key))


def _cache_put(db: Session, kind: str, key: str, content: dict[str, Any]) -> None:
    row = _cache_get(db, kind, key)
    if row is None:
        db.add(AiCache(kind=kind, key=key, content=content, model=settings.ai_model))
    else:
        row.content, row.model = content, settings.ai_model
    try:
        db.commit()
    except IntegrityError:  # a concurrent request stored it first
        db.rollback()


def _consume(db: Session, user: User) -> None:
    """Count one AI message for today, atomically; 429 once the daily limit is reached."""
    today = date.today()
    for _ in range(2):
        res = db.execute(
            update(AiUsage)
            .where(AiUsage.user_id == user.id, AiUsage.day == today, AiUsage.count < settings.ai_daily_limit)
            .values(count=AiUsage.count + 1)
        )
        if res.rowcount:
            db.commit()
            return
        if db.scalar(select(AiUsage.id).where(AiUsage.user_id == user.id, AiUsage.day == today)):
            db.rollback()
            raise HTTPException(429, f"Limite quotidienne atteinte ({settings.ai_daily_limit} messages). À demain !")
        db.add(AiUsage(user_id=user.id, day=today, count=1))
        try:
            db.commit()
            return
        except IntegrityError:  # a concurrent request created today's row first: retry the UPDATE
            db.rollback()
    raise HTTPException(503, "Réessayez dans un instant.")


def _my_result(db: Session, user: User, campaign_id: int) -> Submission:
    s = _existing(db, user, campaign_id)
    if s is None:
        raise HTTPException(404, "Aucun résultat pour cette campagne.")
    if s.invalide:
        raise HTTPException(409, "Résultat non exploitable : pas de lecture personnalisée.")
    return s


def _debrief_key(s: Submission) -> str:
    return f"{s.id}:{s.submitted_at.isoformat() if s.submitted_at else ''}"


def _filter_labels(db: Session, campaign_id: int | None, company_id: int | None,
                   categorie: str | None, famille: str | None) -> dict[str, Any]:
    camp = db.get(Campaign, campaign_id) if campaign_id else None
    comp = db.get(Company, company_id) if company_id else None
    return {"campagne": camp.code if camp else None, "entite": comp.name if comp else None,
            "categorie": categorie, "famille": famille}


# ------------------------------------------------------------------------------------ employee


@router.post("/me/debrief")
def debrief(body: DebriefIn, user: CurrentUser, db: DB):
    s = _my_result(db, user, body.campaign_id)
    key = _debrief_key(s)
    hit = _cache_get(db, "debrief", key)
    if hit:
        return _sse(iter([ai.sse("delta", {"t": hit.content["text"]}), ai.sse("done", {"cached": True})]))

    system, messages = ai.debrief_messages(s)

    def save(text: str) -> None:
        with SessionLocal() as db2:
            _cache_put(db2, "debrief", key, {"text": text})

    return _sse(ai.stream_text(system, messages, effort="medium", on_done=save))


@router.post("/me/coach")
def coach(body: CoachIn, user: CurrentUser, db: DB):
    s = _my_result(db, user, body.campaign_id)
    _consume(db, user)
    hit = _cache_get(db, "debrief", _debrief_key(s))
    system, messages = ai.coach_messages(s, hit.content["text"] if hit else None,
                                         [m.model_dump() for m in body.messages])
    return _sse(ai.stream_text(system, messages, effort="medium"))


# ------------------------------------------------------------------------------------------ HR


@router.post("/hr/insights")
def insights(body: InsightsIn, db: DB, scope: Scope):
    if body.company_id and not scope.allows(body.company_id):
        raise HTTPException(403, "Entité hors de votre périmètre.")
    filters = body.model_dump(exclude={"refresh"})
    data = summary(db, scope, **filters)
    if data["valid"] < settings.min_group_size:
        raise HTTPException(422, f"Pas assez de répondants valides pour une analyse (minimum {settings.min_group_size}).")
    slim = ai.slim_summary(data, _filter_labels(db, **filters))
    key = ai.fingerprint(slim)
    hit = _cache_get(db, "insights", key)
    if hit and not body.refresh:
        return {**hit.content, "cached": True, "generated_at": hit.created_at}

    _consume(db, scope.user)
    req = ai.insights_request(slim)
    try:
        resp = ai.client().messages.create(
            model=settings.ai_model, max_tokens=16000, thinking={"type": "adaptive"},
            system=req["system"], messages=req["messages"],
            output_config={**req["output_config"], "effort": "high"},
        )
    except anthropic.RateLimitError as exc:
        raise HTTPException(429, ai.friendly_error(exc)) from exc
    except anthropic.APIError as exc:
        raise HTTPException(503, ai.friendly_error(exc)) from exc
    if resp.stop_reason == "refusal":
        raise HTTPException(502, "L'analyse n'a pas pu être produite.")
    text = next((b.text for b in resp.content if b.type == "text"), "")
    try:
        content = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(502, "Réponse de l'IA illisible. Réessayez.") from exc
    _cache_put(db, "insights", key, content)
    audit(db, scope.user, "ai.insights", json.dumps({k: v for k, v in filters.items() if v}, ensure_ascii=False))
    db.commit()
    stored = _cache_get(db, "insights", key)
    return {**content, "cached": False, "generated_at": stored.created_at if stored else None}


def _list_filters(db: Session, scope: HrScope) -> dict[str, Any]:
    ref = R.ref()
    camps = db.scalars(select(Campaign).order_by(Campaign.position, Campaign.id))
    comp_ids = filtered_query(scope).with_only_columns(Submission.company_id).distinct()
    comps = db.scalars(select(Company).where(Company.id.in_(comp_ids)).order_by(Company.name))
    return {
        "campagnes": [{"code": c.code, "label": c.label} for c in camps],
        "entites": [c.name for c in comps],
        "categories": ref["categories"],
        "familles": ref["familles"],
    }


def _hr_summary(db: Session, scope: HrScope, inp: dict[str, Any]) -> dict[str, Any]:
    campaign_id = company_id = None
    if code := (inp.get("campaign_code") or "").strip():
        camp = db.scalar(select(Campaign).where(func.lower(Campaign.code) == code.lower()))
        if camp is None:
            raise ValueError(f"Campagne inconnue « {code} ». Utilise list_filters.")
        campaign_id = camp.id
    if name := (inp.get("company_name") or "").strip():
        comp = db.scalar(select(Company).where(func.lower(Company.name) == name.lower()))
        if comp is None:
            raise ValueError(f"Entité inconnue « {name} ». Utilise list_filters.")
        if not scope.allows(comp.id):
            raise ValueError("Cette entité est hors du périmètre de l'utilisateur.")
        company_id = comp.id
    filters = {"campaign_id": campaign_id, "company_id": company_id,
               "categorie": inp.get("categorie") or None, "famille": inp.get("famille") or None}
    return ai.slim_summary(summary(db, scope, **filters), _filter_labels(db, **filters))


@router.post("/hr/ask")
def ask(body: AskIn, db: DB, scope: Scope):
    _consume(db, scope.user)
    audit(db, scope.user, "ai.ask", body.messages[-1].content[:200])
    db.commit()
    uid = scope.user.id

    def execute(name: str, inp: dict[str, Any]) -> Any:
        with SessionLocal() as db2:
            sc = HrScope(db2.get(User, uid))
            if name == "list_filters":
                return _list_filters(db2, sc)
            if name == "get_summary":
                return _hr_summary(db2, sc, inp)
        raise ValueError(f"Outil inconnu : {name}")

    system = ai.hr_system()
    return _sse(ai.run_tool_loop(system, [m.model_dump() for m in body.messages], execute))
