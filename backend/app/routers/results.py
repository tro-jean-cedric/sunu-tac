"""HR console: collective results, individual detail, CSV export, legacy import."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, or_, select

from app import codec, questionnaire as Q
from app.models import Campaign
from app.models import Source, Submission, User
from app.schemas import ImportCodesIn, ImportFilesIn, ImportReport
from app.security import DB, Scope, audit
from app.services import (
    campaign_by_code,
    export_csv,
    filtered_query,
    resolve_identity,
    submission_out,
    summary,
    upsert_submission,
)

router = APIRouter(tags=["results"])


@router.get("/results/summary")
def get_summary(db: DB, scope: Scope, campaign_id: int | None = None, company_id: int | None = None,
                categorie: str | None = None, famille: str | None = None):
    if company_id and not scope.allows(company_id):
        raise HTTPException(403, "Entité hors de votre périmètre.")
    return summary(db, scope, campaign_id, company_id, categorie, famille)


SORTS = {
    "global": Submission.global_score, "matricule": Submission.matricule, "filiale": Submission.filiale_label,
    "submitted_at": Submission.submitted_at, "campagne": Submission.campaign_id,
}


@router.get("/results/individuals")
def individuals(db: DB, scope: Scope, campaign_id: int | None = None, company_id: int | None = None,
                categorie: str | None = None, famille: str | None = None, q: str | None = None,
                invalid: bool | None = None, sort: str = "global", order: str = "desc",
                page: int = Query(0, ge=0), size: int = Query(25, ge=1, le=500)):
    qry = filtered_query(scope, campaign_id, company_id, categorie, famille).outerjoin(
        User, User.id == Submission.user_id)
    if q:
        like = f"%{q.lower()}%"
        qry = qry.where(or_(func.lower(Submission.matricule).like(like), func.lower(User.name).like(like)))
    if invalid is not None:
        qry = qry.where(Submission.invalide.is_(invalid))
    total = db.scalar(select(func.count()).select_from(qry.subquery()))
    col = SORTS.get(sort, Submission.global_score)
    col = col.desc().nulls_last() if order == "desc" else col.asc().nulls_last()
    rows = list(db.scalars(qry.order_by(col, Submission.id).offset(page * size).limit(size)))
    names = {u.id: u.name for u in db.scalars(select(User).where(User.id.in_({r.user_id for r in rows if r.user_id})))}
    return {"total": total, "items": [{**submission_out(r), "name": names.get(r.user_id)} for r in rows]}


@router.get("/results/individuals/{sid}")
def individual(sid: int, db: DB, scope: Scope):
    s = db.get(Submission, sid)
    if s is None or not scope.allows(s.company_id):
        raise HTTPException(404, "Introuvable.")
    audit(db, scope.user, "view_individual", f"{s.matricule}/{s.campaign.code}")
    db.commit()
    u = db.get(User, s.user_id) if s.user_id else None
    out = submission_out(s, with_answers=True)
    out["user"] = {"name": u.name, "email": u.email, "title": u.title, "department": u.department} if u else None
    return out


@router.delete("/submissions/{sid}", status_code=204)
def delete_submission(sid: int, db: DB, scope: Scope):
    s = db.get(Submission, sid)
    if s is None or not scope.allows(s.company_id):
        raise HTTPException(404, "Introuvable.")
    audit(db, scope.user, "delete_submission", f"{s.matricule}/{s.campaign.code}")
    db.delete(s)
    db.commit()


@router.get("/results/export.csv")
def export(db: DB, scope: Scope, campaign_id: int | None = None, company_id: int | None = None,
           categorie: str | None = None, famille: str | None = None):
    rows = list(db.scalars(filtered_query(scope, campaign_id, company_id, categorie, famille)
                           .order_by(Submission.global_score.desc().nulls_last())))
    audit(db, scope.user, "export_csv", f"{len(rows)} lignes")
    db.commit()
    fname = f"TAC-SUNU_resultats_{datetime.now(UTC).date().isoformat()}.csv"
    return Response(export_csv(rows), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{fname}"'})


def _import_one(db, scope, ident: dict, sit, bloc, lik, duree, source: Source, date, cache, rep: dict, extra=None):
    matricule = (ident.get("matricule") or "").strip()
    if not matricule:
        rep["errors"].append("Matricule manquant.")
        rep["unreadable"] += 1
        return
    user, company = resolve_identity(db, matricule, ident.get("filiale"), cache)
    if not scope.allows(company.id if company else None):
        rep["errors"].append(f"{matricule} : entité hors de votre périmètre.")
        rep["unreadable"] += 1
        return
    camp = campaign_by_code(db, ident.get("campagne"))
    submitted = None
    if date:
        try:
            submitted = datetime.fromisoformat(str(date).replace("Z", "+00:00"))
        except ValueError:
            submitted = None
    sub, replaced = upsert_submission(
        db, matricule=matricule, campaign=camp, sit=sit or {}, bloc=bloc or {}, lik=lik or {}, duree_s=duree,
        user=user, company=company, filiale_label=ident.get("filiale") or (company.name if company else None),
        categorie=ident.get("categorie"), famille=ident.get("famille"), source=source,
        submitted_at=submitted, created_by=scope.user.id, extra=extra,
    )
    rep["imported"] += 1
    rep["replaced"] += int(replaced)
    rep["invalid_tests"] += int(sub.invalide)


@router.post("/import/codes", response_model=ImportReport)
def import_codes(body: ImportCodesIn, db: DB, scope: Scope):
    rep = {"imported": 0, "replaced": 0, "invalid_tests": 0, "unreadable": 0, "errors": []}
    cache: dict = {}

    def resolve(code: str, matricule: str):
        camp = db.scalar(select(Campaign).where(Campaign.code == ((code or "T0").strip() or "T0")))
        return Q.ref_for_campaign(db, camp, matricule) if camp else None

    for i, raw in enumerate(x.strip() for x in body.codes):
        if not raw:
            continue
        d = codec.decode(raw, resolve)
        if d is None:
            rep["unreadable"] += 1
            rep["errors"].append(f"Ligne {i + 1} : code illisible.")
            continue
        _import_one(db, scope, d["ident"], d["sit"], d["bloc"], d["lik"], d["dureeS"], Source.code, None, cache, rep,
                    d.get("extra"))
    audit(db, scope.user, "import_codes", f"{rep['imported']} importés")
    db.commit()
    return rep


@router.post("/import/files", response_model=ImportReport)
def import_files(body: ImportFilesIn, db: DB, scope: Scope):
    rep = {"imported": 0, "replaced": 0, "invalid_tests": 0, "unreadable": 0, "errors": []}
    cache: dict = {}
    for i, obj in enumerate(body.items):
        if not isinstance(obj, dict) or not obj.get("sit"):
            rep["unreadable"] += 1
            rep["errors"].append(f"Fichier {i + 1} : format non reconnu.")
            continue
        ident = {k: obj.get(k) for k in ("matricule", "filiale", "categorie", "famille", "campagne")}
        duree = obj.get("dureeS")
        _import_one(db, scope, ident, obj.get("sit"), obj.get("bloc"), obj.get("lik"),
                    int(duree) if isinstance(duree, (int, float)) else None, Source.file, obj.get("date"), cache, rep,
                    obj.get("extra") if isinstance(obj.get("extra"), dict) else None)
    audit(db, scope.user, "import_files", f"{rep['imported']} importés")
    db.commit()
    return rep
