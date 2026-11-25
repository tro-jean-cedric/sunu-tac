import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import Campaign, Role, User, UserRole
from app.questionnaire import ensure_default
from app.routers import admin, ai, auth, me, meta, questionnaires, results, tts
from app.security import hash_password, verify_password

log = logging.getLogger("tac")


def bootstrap() -> None:
    """Ensure the bootstrap HR admin and the three standard campaigns exist."""
    if settings.jwt_secret.startswith("change-me"):
        log.warning("JWT_SECRET is the development default — set a random secret in production.")
    if settings.ldap_enabled and settings.dev_password:
        log.warning("DEV_PASSWORD is ignored while LDAP is enabled; consider clearing it.")
    elif settings.dev_password:
        log.warning("Offline mode: LDAP users log in with the shared DEV_PASSWORD.")
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.username == settings.admin_username))
        if u is None:
            u = User(username=settings.admin_username, name=settings.admin_name, active=True,
                     password_hash=hash_password(settings.admin_password))
            db.add(u)
            db.flush()
            log.warning("Bootstrap admin '%s' created", settings.admin_username)
        elif not verify_password(u.password_hash, settings.admin_password):
            u.password_hash = hash_password(settings.admin_password)
        if not any(r.role == Role.HR_ADMIN for r in u.roles):
            u.roles.append(UserRole(role=Role.HR_ADMIN))
        if not db.scalar(select(Campaign.id).limit(1)):
            db.add_all([
                Campaign(code="T0", label="T0 — Mesure initiale", active=True, position=0),
                Campaign(code="T+12", label="T+12 — Mesure à 12 mois", active=False, position=1),
                Campaign(code="T+24", label="T+24 — Mesure à 24 mois", active=False, position=2),
            ])
            db.flush()
        ensure_default(db)
        db.commit()


def start_scheduler():
    if not (settings.ldap_enabled and settings.ldap_sync_cron_hour is not None):
        return None
    from apscheduler.schedulers.background import BackgroundScheduler

    from app import ldap

    def job():
        with SessionLocal() as db:
            log.info("Nightly LDAP sync: %s", ldap.sync(db))

    s = BackgroundScheduler()
    s.add_job(job, "cron", hour=settings.ldap_sync_cron_hour)
    s.start()
    return s


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap()
    sched = start_scheduler()
    yield
    if sched:
        sched.shutdown()


app = FastAPI(title="TAC-SUNU API", version="1.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
for r in (auth.router, meta.router, me.router, results.router, admin.router, ai.router, tts.router,
          questionnaires.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    return {"ok": True}
