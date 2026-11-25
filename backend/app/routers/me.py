"""Employee endpoints: draft autosave and submission. Identity comes from the session, not the form."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app import questionnaire as Q
from app.models import Campaign, Draft, Source, Submission
from app.routers.meta import is_open
from app.schemas import DraftIn, SubmissionIn
from app.security import DB, CurrentUser
from app.services import is_complete, submission_out, upsert_submission

router = APIRouter(prefix="/me", tags=["employee"])


@router.get("/draft")
def get_draft(campaign_id: int, user: CurrentUser, db: DB):
    d = db.scalar(select(Draft).where(Draft.user_id == user.id, Draft.campaign_id == campaign_id))
    return {"payload": d.payload if d else None, "updated_at": d.updated_at if d else None}


@router.put("/draft", status_code=204)
def put_draft(body: DraftIn, user: CurrentUser, db: DB):
    d = db.scalar(select(Draft).where(Draft.user_id == user.id, Draft.campaign_id == body.campaign_id))
    if d is None:
        db.add(Draft(user_id=user.id, campaign_id=body.campaign_id, payload=body.payload))
    else:
        d.payload = body.payload
    db.commit()


@router.delete("/draft", status_code=204)
def delete_draft(campaign_id: int, user: CurrentUser, db: DB):
    d = db.scalar(select(Draft).where(Draft.user_id == user.id, Draft.campaign_id == campaign_id))
    if d:
        db.delete(d)
        db.commit()


def _existing(db, user, campaign_id):
    return db.scalar(select(Submission).where(
        func.lower(Submission.matricule) == user.username.lower(), Submission.campaign_id == campaign_id))


@router.get("/submissions/latest")
def latest(campaign_id: int, user: CurrentUser, db: DB):
    s = _existing(db, user, campaign_id)
    return submission_out(s) if s else None


@router.post("/submissions")
def submit(body: SubmissionIn, user: CurrentUser, db: DB):
    camp = db.get(Campaign, body.campaign_id)
    if camp is None or not is_open(camp):
        raise HTTPException(400, "Cette campagne n'est pas ouverte.")
    ref = Q.ref_for_campaign(db, camp, user.username)
    if body.categorie not in ref["categories"] or body.famille not in ref["familles"]:
        raise HTTPException(422, "Catégorie ou famille de métier invalide.")
    prev = _existing(db, user, camp.id)
    if prev is not None and not prev.invalide:
        raise HTTPException(409, "Vous avez déjà transmis vos réponses pour cette campagne.")
    bloc = {k: v.model_dump() for k, v in body.bloc.items()}
    if not is_complete(body.sit, bloc, body.lik, ref, body.extra):
        raise HTTPException(422, "Le test n'est pas complet.")
    now = datetime.now(UTC)
    duree = None
    if body.started_at:
        started = body.started_at if body.started_at.tzinfo else body.started_at.replace(tzinfo=UTC)
        duree = max(0, min(int((now - started).total_seconds()), 7 * 24 * 3600))
    sub, _ = upsert_submission(
        db, matricule=user.username, campaign=camp, sit=body.sit, bloc=bloc, lik=body.lik, duree_s=duree,
        user=user, company=user.company, filiale_label=user.filliale or (user.company.name if user.company else None),
        categorie=body.categorie, famille=body.famille, source=Source.web,
        started_at=body.started_at, submitted_at=now, created_by=user.id, extra=body.extra,
    )
    d = db.scalar(select(Draft).where(Draft.user_id == user.id, Draft.campaign_id == camp.id))
    if d:
        db.delete(d)
    db.commit()
    return submission_out(sub)
