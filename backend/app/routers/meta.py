from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import select

from app import referentiel as R
from app.config import settings
from app.models import Campaign, Company
from app.schemas import CampaignOut, CompanyOut
from app.security import DB, CurrentUser, Scope

router = APIRouter(tags=["meta"])


@router.get("/meta/referentiel")
def referentiel():
    return R.ref()


@router.get("/meta/config")
def config():
    return {"ldap_enabled": settings.ldap_enabled, "min_group_size": settings.min_group_size,
            "ai_enabled": settings.ai_enabled, "tts_enabled": settings.tts_enabled}


def is_open(c: Campaign, now: datetime | None = None) -> bool:
    now = now or datetime.now(UTC)
    if not c.active:
        return False
    if c.opens_at and now < c.opens_at:
        return False
    if c.closes_at and now > c.closes_at:
        return False
    return True


@router.get("/campaigns/open", response_model=list[CampaignOut])
def open_campaigns(db: DB, _: CurrentUser):
    return [c for c in db.scalars(select(Campaign).order_by(Campaign.position, Campaign.id)) if is_open(c)]


@router.get("/companies", response_model=list[CompanyOut])
def companies(db: DB, scope: Scope):
    q = select(Company).order_by(Company.name)
    if not scope.all_companies:
        q = q.where(Company.id.in_(scope.company_ids or {-1}))
    return list(db.scalars(q))
