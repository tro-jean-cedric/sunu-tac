"""Active Directory integration — Python port of sunu-achats' UserBusiness.loginLDAP / findUsersLdap.

Differences from sunu-achats (on purpose):
- all settings come from env (no committed secrets), optional StartTLS/LDAPS;
- company lookup is normalised (no duplicate companies for case/spacing variants);
- managers are resolved in a second pass, so entry order doesn't matter;
- users deactivated by HR are not re-activated by the sync; department/title are refreshed.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Company, User

log = logging.getLogger(__name__)

# Same French messages as sunu-achats' ldapErrorMessage()
AD_ERRORS = {
    "525": "Utilisateur introuvable dans l'annuaire.",
    "52e": "Identifiant ou mot de passe incorrect.",
    "530": "Connexion non autorisée à cette heure.",
    "531": "Connexion non autorisée depuis ce poste.",
    "532": "Votre mot de passe a expiré.",
    "533": "Votre compte est désactivé.",
    "701": "Votre compte a expiré.",
    "773": "Vous devez changer votre mot de passe.",
    "775": "Votre compte est verrouillé.",
}


class LdapAuthError(Exception):
    pass


def _ad_message(err: str) -> str:
    m = re.search(r"data ([0-9a-f]{3})", err or "")
    if m and m.group(1) in AD_ERRORS:
        return AD_ERRORS[m.group(1)]
    return "Identifiant ou mot de passe incorrect."


def _server():
    from ldap3 import Server

    return Server(settings.ldap_url, get_info=None, connect_timeout=8)


def authenticate(user: User, password: str) -> None:
    """Simple bind as the user. Tries stored DN, then UPN (email), then sAMAccountName."""
    from ldap3 import SIMPLE, Connection
    from ldap3.core.exceptions import LDAPException

    if not password:
        raise LdapAuthError("Mot de passe requis.")
    principals = [p for p in (user.ldap_dn, user.email, user.username) if p]
    last_err = ""
    for principal in principals:
        try:
            conn = Connection(_server(), user=principal, password=password, authentication=SIMPLE)
            if settings.ldap_use_tls:
                conn.open()
                conn.start_tls()
            if conn.bind():
                conn.unbind()
                return
            last_err = str(conn.result.get("message", ""))
        except LDAPException as exc:  # network etc.
            last_err = str(exc)
            log.warning("LDAP bind failed for %s: %s", principal, exc)
    raise LdapAuthError(_ad_message(last_err))


def normalise_company(name: str | None) -> str | None:
    if not name:
        return None
    n = re.sub(r"\s+", " ", name).strip()
    return n or None


def company_key(name: str) -> str:
    """Key used to merge spelling variants ("SUNUBANK TOGO" == "SUNU Bank Togo")."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().upper()
    s = re.sub(r"\s+", " ", s).strip()
    s = s.replace("ASSURANNCES", "ASSURANCES").replace("ASSURANCE ", "ASSURANCES ")
    s = s.replace("SUNUBANK", "SUNU BANK")
    return re.sub(r"[^A-Z0-9]", "", s)


def find_or_create_company(db: Session, name: str | None, cache: dict[str, Company]) -> Company | None:
    name = normalise_company(name)
    if not name:
        return None
    if not cache:
        for c in db.scalars(select(Company)):
            cache.setdefault(company_key(c.name), c)
    key = company_key(name)
    if key in cache:
        return cache[key]
    c = Company(name=name, active=True)
    db.add(c)
    db.flush()
    cache[key] = c
    return c


@dataclass
class SyncReport:
    seen: int = 0
    created: int = 0
    updated: int = 0
    skipped: int = 0
    managers: int = 0
    emails_moved: int = 0  # address taken from a stale account now that another AD account owns it
    errors: int = 0        # entries that could not be stored (logged), the rest of the sync goes on


def sync(db: Session) -> SyncReport:
    """Paged search of AD users and upsert into `users` / `companies`."""
    from ldap3 import SIMPLE, SUBTREE, Connection

    rep = SyncReport()
    conn = Connection(
        _server(), user=settings.ldap_bind_dn, password=settings.ldap_bind_password, authentication=SIMPLE
    )
    if settings.ldap_use_tls:
        conn.open()
        conn.start_tls()
    if not conn.bind():
        raise RuntimeError(f"LDAP service bind failed: {conn.result.get('description')}")
    attrs = ["sAMAccountName", "name", "userPrincipalName", "distinguishedName",
             "company", "department", "title", "manager"]
    entries = conn.extend.standard.paged_search(
        settings.ldap_base_dn, settings.ldap_user_filter, SUBTREE, attributes=attrs,
        paged_size=1000, generator=True,
    )
    records = []
    for e in entries:
        if e.get("type") != "searchResEntry":
            continue
        a = e["attributes"]

        def val(k: str, a=a) -> str | None:
            v = a.get(k)
            if isinstance(v, list):
                v = v[0] if v else None
            return str(v).strip() if v else None

        records.append({k: val(k) for k in attrs})
    apply_records(db, records, rep)
    conn.unbind()
    return rep


def clean_email(v: str | None) -> str | None:
    """AD sometimes holds addresses with stray spaces ("prenom.nom @sunu-group.com")."""
    v = "".join((v or "").split())
    return v or None


def _find_user(db: Session, username: str, dn: str) -> User | None:
    """The account (matricule — results are keyed on it), else the same AD object under a new account name.

    Never by e-mail: an address that moves to another account must not hijack the old account's row."""
    u = db.scalar(select(User).where(func.lower(User.username) == username.lower()).order_by(User.id).limit(1))
    if u is None:
        u = db.scalar(select(User).where(User.ldap_dn == dn, User.password_hash.is_(None)).order_by(User.id).limit(1))
        if u is not None:
            u.username = username  # sAMAccountName renamed in AD
    return u


def apply_records(db: Session, records: list[dict[str, str | None]], rep: SyncReport) -> None:
    """Upsert AD entries (attribute → value) into users / companies, then link managers; commits."""
    cache: dict[str, Company] = {}
    managers: dict[int, str] = {}
    for r in records:
        username, name, dn = r.get("sAMAccountName"), r.get("name"), r.get("distinguishedName")
        email = clean_email(r.get("userPrincipalName"))
        rep.seen += 1
        if not (username and name and email and dn):
            rep.skipped += 1
            continue
        try:
            with db.begin_nested():  # savepoint: a bad entry is skipped, not the whole sync
                u = _find_user(db, username, dn)
                if u is None:
                    u = User(username=username, name=name, active=True)
                    db.add(u)
                    created = True
                else:
                    created = False
                holder = db.scalar(select(User).where(func.lower(User.email) == email.lower()).limit(1))
                if holder is not None and holder is not u:
                    if holder.password_hash:  # a local account keeps its address
                        email = None
                    else:
                        holder.email = None
                        db.flush()  # release before the new owner's UPDATE (unique constraint)
                        rep.emails_moved += 1
                for stale in db.scalars(select(User).where(User.ldap_dn == dn)):
                    if stale is not u:
                        stale.ldap_dn = None  # the DN now belongs to this account
                u.name, u.email, u.ldap_dn = name, email, dn
                u.filliale = normalise_company(r.get("company"))
                u.department, u.title = r.get("department"), r.get("title")
                u.company = find_or_create_company(db, r.get("company"), cache)
                if not u.deactivated_by_hr:
                    u.active = True
                db.flush()
        except Exception as exc:  # noqa: BLE001 — one entry must not stop the directory sync
            log.warning("LDAP sync: entry %s not stored: %s", username, exc)
            rep.errors += 1
            cache.clear()  # companies created in the rolled-back savepoint are gone
            continue
        rep.created += int(created)
        rep.updated += int(not created)
        if r.get("manager"):
            managers[u.id] = r["manager"]
    by_dn = {dn: uid for uid, dn in db.execute(select(User.id, User.ldap_dn).where(User.ldap_dn.is_not(None)))}
    for uid, mdn in managers.items():
        mid = by_dn.get(mdn)
        if mid and mid != uid:
            db.get(User, uid).manager_id = mid
            rep.managers += 1
    db.commit()
