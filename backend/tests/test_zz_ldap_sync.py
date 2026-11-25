"""LDAP sync upsert (apply_records): conflicting e-mails, row matching, one bad entry not aborting the sync."""

import pytest
from sqlalchemy import delete, select

from app import ldap
from app.db import SessionLocal
from app.models import Company, User


def rec(username, email, dn, name="Agent", company=None):
    return {"sAMAccountName": username, "name": name, "userPrincipalName": email, "distinguishedName": dn,
            "company": company, "department": None, "title": None, "manager": None}


@pytest.fixture
def db(client):
    with SessionLocal() as s:
        yield s
        s.rollback()
        s.execute(delete(User).where(User.username.like("ls_%")))
        s.execute(delete(Company).where(Company.name.like("LS %")))
        s.commit()


def get(db, username):
    return db.scalar(select(User).where(User.username == username))


def test_email_moves_from_stale_account(db):
    db.add(User(username="ls_old", name="Old", email="annie.a@sunu.test", ldap_dn="CN=old"))
    db.commit()
    rep = ldap.SyncReport()
    # same address, with the stray space seen in AD
    ldap.apply_records(db, [rec("ls_new", "annie.a @sunu.test", "CN=new")], rep)
    assert (rep.created, rep.emails_moved, rep.errors) == (1, 1, 0)
    assert get(db, "ls_new").email == "annie.a@sunu.test"
    assert get(db, "ls_old").email is None


def test_matches_one_row_by_username_first(db):
    db.add_all([User(username="ls_x", name="X", email="x@sunu.test", ldap_dn="CN=x-old"),
                User(username="ls_y", name="Y", email="shared@sunu.test", ldap_dn="CN=x")])
    db.commit()
    rep = ldap.SyncReport()
    # DN and e-mail are on ls_y (stale), but the AD account is ls_x
    ldap.apply_records(db, [rec("ls_x", "Shared@sunu.test", "CN=x")], rep)
    assert (rep.updated, rep.created, rep.errors) == (1, 0, 0)
    assert get(db, "ls_x").email == "Shared@sunu.test" and get(db, "ls_y").email is None
    assert get(db, "ls_y").ldap_dn is None


def test_local_account_keeps_its_email(db):
    db.add(User(username="ls_local", name="Local", email="drh@sunu.test", password_hash="x"))
    db.commit()
    rep = ldap.SyncReport()
    ldap.apply_records(db, [rec("ls_ad", "drh@sunu.test", "CN=ad")], rep)
    assert get(db, "ls_local").email == "drh@sunu.test" and get(db, "ls_ad").email is None


def test_bad_entry_does_not_stop_the_sync(db, monkeypatch):
    real = ldap.find_or_create_company

    def boom(db_, name, cache):
        if name == "LS BOOM":
            raise ValueError("bad entry")
        return real(db_, name, cache)

    monkeypatch.setattr(ldap, "find_or_create_company", boom)
    rep = ldap.SyncReport()
    ldap.apply_records(db, [rec("ls_a", "a@sunu.test", "CN=a", company="LS ONE"),
                            rec("ls_b", "b@sunu.test", "CN=b", company="LS BOOM"),
                            rec("ls_c", "c@sunu.test", "CN=c", company="LS ONE"),
                            rec("ls_d", None, "CN=d")], rep)
    assert (rep.seen, rep.created, rep.errors, rep.skipped) == (4, 2, 1, 1)
    assert get(db, "ls_a") and get(db, "ls_c") and get(db, "ls_b") is None
    assert get(db, "ls_a").company_id == get(db, "ls_c").company_id is not None


def test_renamed_account_keeps_its_row(db):
    db.add(User(username="ls_before", name="R", email="r@sunu.test", ldap_dn="CN=r"))
    db.commit()
    uid = get(db, "ls_before").id
    rep = ldap.SyncReport()
    ldap.apply_records(db, [rec("ls_after", "r@sunu.test", "CN=r")], rep)
    assert (rep.updated, rep.created) == (1, 0) and get(db, "ls_after").id == uid
