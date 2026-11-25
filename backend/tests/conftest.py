import os
import tempfile

_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_db.name}"
os.environ["LDAP_ENABLED"] = "false"
os.environ["DEV_PASSWORD"] = "dev"
os.environ["ADMIN_USERNAME"] = "admin.drh"
os.environ["ADMIN_PASSWORD"] = "adminpw"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Company, User  # noqa: E402


@pytest.fixture(scope="session")
def client():
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        a = Company(name="SUNU SERVICES")
        b = Company(name="SUNU BANK TOGO")
        db.add_all([a, b])
        db.flush()
        for i in range(8):
            db.add(User(username=f"emp{i}", name=f"Employé {i}", email=f"emp{i}@x.test",
                        company_id=a.id if i < 6 else b.id, filliale=a.name if i < 6 else b.name,
                        ldap_dn=f"CN=emp{i}"))
        db.add(User(username="drh.bank", name="DRH Bank", email="drh@x.test", company_id=b.id, ldap_dn="CN=drh"))
        db.commit()
    with TestClient(app) as c:
        yield c
