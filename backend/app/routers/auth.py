from fastapi import APIRouter, Response

from app.models import Role
from app.schemas import CompanyOut, LoginIn, MeOut, RoleOut
from app.security import DB, CurrentUser, HrScope, audit, check_credentials, clear_token, issue_token

router = APIRouter(prefix="/auth", tags=["auth"])


def me_out(u) -> MeOut:
    s = HrScope(u)
    return MeOut(
        id=u.id, username=u.username, name=u.name, email=u.email, filliale=u.filliale,
        department=u.department, title=u.title,
        company=CompanyOut.model_validate(u.company) if u.company else None,
        roles=[RoleOut(id=r.id, role=r.role.value, company_id=r.company_id,
                       company_name=r.company.name if r.company else None) for r in u.roles],
        is_hr=s.is_hr, is_hr_admin=s.all_companies, local_account=bool(u.password_hash),
    )


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, response: Response, db: DB):
    u = check_credentials(db, body.username, body.password)
    issue_token(response, u)
    if any(r.role in (Role.HR_ADMIN, Role.HR_ENTITY) for r in u.roles):
        audit(db, u, "login_hr")
        db.commit()
    return me_out(u)


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser):
    return me_out(user)


@router.post("/logout", status_code=204)
def logout(response: Response):
    clear_token(response)
