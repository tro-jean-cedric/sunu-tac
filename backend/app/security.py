from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from argon2 import PasswordHasher
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import ldap
from app.config import settings
from app.db import get_db
from app.models import AuditLog, Role, User

ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return ph.hash(pw)


def verify_password(hashed: str | None, pw: str) -> bool:
    if not hashed:
        return False
    try:
        return ph.verify(hashed, pw)
    except Exception:
        return False


class AuthError(HTTPException):
    def __init__(self, detail: str = "Identifiant ou mot de passe incorrect."):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def check_credentials(db: Session, username: str, password: str) -> User:
    ident = (username or "").strip().lower()
    if not ident or not password:
        raise AuthError()
    u = db.scalar(select(User).where(or_(func.lower(User.username) == ident, func.lower(User.email) == ident)))
    if u is None or not u.active:
        raise AuthError()
    if u.password_hash:  # local account (bootstrap admin)
        if not verify_password(u.password_hash, password):
            raise AuthError()
    elif settings.ldap_enabled:
        try:
            ldap.authenticate(u, password)
        except ldap.LdapAuthError as exc:
            raise AuthError(str(exc)) from exc
    else:
        # offline/dev mode: directory users already in the database share DEV_PASSWORD
        if not settings.dev_password or password != settings.dev_password:
            raise AuthError()
    u.last_login = datetime.now(UTC)
    db.commit()
    return u


def issue_token(response: Response, user: User) -> None:
    now = datetime.now(UTC)
    token = jwt.encode(
        {"sub": user.username, "uid": user.id, "cid": user.company_id, "iat": now,
         "exp": now + timedelta(hours=settings.jwt_ttl_hours)},
        settings.jwt_secret,
        algorithm="HS256",
    )
    response.set_cookie(settings.cookie_name, token, httponly=True, samesite="lax",
                        secure=settings.cookie_secure, max_age=settings.jwt_ttl_hours * 3600, path="/")


def clear_token(response: Response) -> None:
    response.delete_cookie(settings.cookie_name, path="/")


def current_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Non authentifié.")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expirée.") from exc
    # roles/activation re-read from DB on every request (as sunu-achats does)
    u = db.get(User, payload.get("uid"))
    if u is None or not u.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Compte inactif.")
    return u


CurrentUser = Annotated[User, Depends(current_user)]
DB = Annotated[Session, Depends(get_db)]


class HrScope:
    """Which companies an HR user may see. `all_companies` for HR_ADMIN."""

    def __init__(self, user: User):
        self.user = user
        self.all_companies = any(r.role == Role.HR_ADMIN for r in user.roles)
        self.company_ids = {r.company_id for r in user.roles if r.role == Role.HR_ENTITY and r.company_id}

    @property
    def is_hr(self) -> bool:
        return self.all_companies or bool(self.company_ids)

    def allows(self, company_id: int | None) -> bool:
        return self.all_companies or (company_id in self.company_ids)


def hr_scope(user: CurrentUser) -> HrScope:
    s = HrScope(user)
    if not s.is_hr:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès réservé à la DRH.")
    return s


def hr_admin(user: CurrentUser) -> User:
    if not any(r.role == Role.HR_ADMIN for r in user.roles):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Accès réservé à la DRH Groupe.")
    return user


Scope = Annotated[HrScope, Depends(hr_scope)]
Admin = Annotated[User, Depends(hr_admin)]


def audit(db: Session, user: User | None, action: str, target: str | None = None) -> None:
    db.add(AuditLog(actor_id=user.id if user else None, actor=user.username if user else None,
                    action=action, target=target))
