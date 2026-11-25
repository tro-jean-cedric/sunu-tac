from fastapi import APIRouter, HTTPException
from sqlalchemy import func, or_, select

from app import ldap
from app.config import settings
from app.models import AuditLog, Campaign, Company, QStatus, Questionnaire, Role, Submission, User, UserRole
from app.questionnaire import TIRAGE_KEYS, default_questionnaire, normalize, normalize_tirage, tirage_check
from app.schemas import CampaignIn, CampaignOut, CampaignPatch, RoleGrantIn
from app.security import DB, Admin, Scope, audit

router = APIRouter(tags=["admin"])


# ---------------- campaigns
@router.get("/campaigns", response_model=list[CampaignOut])
def list_campaigns(db: DB, _: Scope):
    return list(db.scalars(select(Campaign).order_by(Campaign.position, Campaign.id)))


def _check_questionnaire(db, qid: int) -> Questionnaire:
    q = db.get(Questionnaire, qid)
    if q is None:
        raise HTTPException(404, "Questionnaire introuvable.")
    if q.status != QStatus.published:
        raise HTTPException(422, "Seule une version publiée du questionnaire peut être utilisée par une campagne.")
    return q


def _check_tirage(db, qid: int | None, tirage) -> dict | None:
    """Normalised draw, refused when it could leave a dimension unmeasured for some respondents."""
    t = normalize_tirage(tirage)
    q = db.get(Questionnaire, qid) if (t and qid) else None
    if q is not None:
        errs = tirage_check(q.content, t)["errors"]
        if errs:
            raise HTTPException(422, errs[0])
    return t


def _has_answers(db, c: Campaign) -> bool:
    return bool(db.scalar(select(func.count(Submission.id)).where(Submission.campaign_id == c.id)))


@router.post("/campaigns/tirage-check")
def tirage_preview(body: dict, db: DB, _: Admin):
    """Questions available per category in a questionnaire, and errors / warnings of a draw (campaign dialog)."""
    q = db.get(Questionnaire, body.get("questionnaire_id") or -1)
    if q is None:
        raise HTTPException(404, "Questionnaire introuvable.")
    c = normalize(q.content)
    return {"available": {k: len(c[k]) for k in TIRAGE_KEYS},
            **tirage_check(c, normalize_tirage(body.get("tirage")))}


@router.post("/campaigns", response_model=CampaignOut)
def create_campaign(body: CampaignIn, db: DB, admin: Admin):
    if db.scalar(select(Campaign).where(Campaign.code == body.code)):
        raise HTTPException(409, "Ce code de campagne existe déjà.")
    if body.questionnaire_id is not None:
        _check_questionnaire(db, body.questionnaire_id)
    else:
        d = default_questionnaire(db)
        body.questionnaire_id = d.id if d else None
    data = body.model_dump()
    data["tirage"] = _check_tirage(db, body.questionnaire_id, body.tirage)
    c = Campaign(**data)
    db.add(c)
    audit(db, admin, "create_campaign", body.code)
    db.commit()
    return c


@router.patch("/campaigns/{cid}", response_model=CampaignOut)
def patch_campaign(cid: int, body: CampaignPatch, db: DB, admin: Admin):
    c = db.get(Campaign, cid)
    if c is None:
        raise HTTPException(404, "Introuvable.")
    changes = body.model_dump(exclude_unset=True)
    qid = changes.get("questionnaire_id")
    if "questionnaire_id" in changes and qid != c.questionnaire_id:
        if qid is None:
            raise HTTPException(422, "Choisissez un questionnaire.")
        _check_questionnaire(db, qid)
        if _has_answers(db, c):
            raise HTTPException(409, "Des réponses ont déjà été reçues pour cette campagne : son questionnaire "
                                     "ne peut plus changer (les résultats deviendraient incomparables).")
        audit(db, admin, "campaign_questionnaire", f"{c.code} → #{qid}")
    if "tirage" in changes:
        changes["tirage"] = normalize_tirage(changes["tirage"])
        if changes["tirage"] != normalize_tirage(c.tirage):
            if _has_answers(db, c):
                raise HTTPException(409, "Des réponses ont déjà été reçues pour cette campagne : le nombre de "
                                         "questions tirées ne peut plus changer (les collaborateurs déjà passés "
                                         "ne retrouveraient pas leurs questions).")
            audit(db, admin, "campaign_tirage", f"{c.code} → {changes['tirage']}")
    if "tirage" in changes or "questionnaire_id" in changes:
        _check_tirage(db, changes.get("questionnaire_id", c.questionnaire_id), changes.get("tirage", c.tirage))
    for k, v in changes.items():
        setattr(c, k, v)
    audit(db, admin, "update_campaign", c.code)
    db.commit()
    return c


# ---------------- users & roles
def user_row(u: User) -> dict:
    return {
        "id": u.id, "username": u.username, "name": u.name, "email": u.email, "title": u.title,
        "department": u.department, "company": {"id": u.company.id, "name": u.company.name} if u.company else None,
        "active": u.active, "last_login": u.last_login, "local_account": bool(u.password_hash),
        "roles": [{"id": r.id, "role": r.role.value, "company_id": r.company_id,
                   "company_name": r.company.name if r.company else None} for r in u.roles],
    }


@router.get("/admin/users")
def search_users(db: DB, _: Admin, q: str = "", hr_only: bool = False, limit: int = 30):
    qry = select(User)
    if q:
        like = f"%{q.lower()}%"
        qry = qry.where(or_(func.lower(User.username).like(like), func.lower(User.name).like(like),
                            func.lower(User.email).like(like)))
    if hr_only:
        qry = qry.where(User.roles.any())
    return [user_row(u) for u in db.scalars(qry.order_by(User.name).limit(min(limit, 100)))]


@router.post("/admin/users/{uid}/roles")
def grant_role(uid: int, body: RoleGrantIn, db: DB, admin: Admin):
    u = db.get(User, uid)
    if u is None:
        raise HTTPException(404, "Utilisateur introuvable.")
    try:
        role = Role(body.role)
    except ValueError as exc:
        raise HTTPException(422, "Rôle inconnu.") from exc
    company_id = body.company_id if role == Role.HR_ENTITY else None
    if role == Role.HR_ENTITY and (company_id is None or db.get(Company, company_id) is None):
        raise HTTPException(422, "Choisissez l'entité de ce rôle.")
    if any(r.role == role and r.company_id == company_id for r in u.roles):
        return user_row(u)
    u.roles.append(UserRole(role=role, company_id=company_id, granted_by=admin.id))
    audit(db, admin, "grant_role", f"{u.username}:{role.value}:{company_id or ''}")
    db.commit()
    db.refresh(u)
    return user_row(u)


@router.delete("/admin/roles/{rid}")
def revoke_role(rid: int, db: DB, admin: Admin):
    r = db.get(UserRole, rid)
    if r is None:
        raise HTTPException(404, "Introuvable.")
    if r.user_id == admin.id and r.role == Role.HR_ADMIN:
        raise HTTPException(400, "Vous ne pouvez pas retirer votre propre rôle DRH Groupe.")
    u = r.user
    audit(db, admin, "revoke_role", f"{u.username}:{r.role.value}")
    db.delete(r)
    db.commit()
    db.refresh(u)
    return user_row(u)


@router.get("/admin/status")
def status(db: DB, _: Admin):
    return {
        "ldap_enabled": settings.ldap_enabled,
        "users": db.scalar(select(func.count(User.id))),
        "companies": db.scalar(select(func.count(Company.id))),
        "last_sync": db.scalar(select(func.max(AuditLog.at)).where(AuditLog.action == "ldap_sync")),
    }


@router.post("/admin/ldap/sync")
def ldap_sync(db: DB, admin: Admin):
    if not settings.ldap_enabled:
        raise HTTPException(400, "LDAP désactivé (mode hors réseau). Activez LDAP_ENABLED.")
    try:
        rep = ldap.sync(db)
    except Exception as exc:
        raise HTTPException(502, f"Synchronisation impossible : {exc}") from exc
    audit(db, admin, "ldap_sync", str(rep.__dict__))
    db.commit()
    return rep.__dict__


@router.get("/admin/audit")
def audit_log(db: DB, _: Admin, limit: int = 100):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.at.desc()).limit(min(limit, 500)))
    return [{"at": a.at, "actor": a.actor, "action": a.action, "target": a.target} for a in rows]
