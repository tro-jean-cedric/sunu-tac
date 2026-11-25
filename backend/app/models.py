from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

JsonType = JSON().with_variant(JSONB(), "postgresql")
BigId = BigInteger().with_variant(Integer(), "sqlite")  # sqlite only autoincrements INTEGER PKs


class Role(str, enum.Enum):
    HR_ADMIN = "HR_ADMIN"  # DRH Groupe: everything
    HR_ENTITY = "HR_ENTITY"  # DRH of one company: scoped results


class Source(str, enum.Enum):
    web = "web"
    code = "code"
    file = "file"


class Company(Base):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    code: Mapped[str | None] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    source_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    username: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    filliale: Mapped[str | None] = mapped_column(String(255))
    department: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), index=True)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    ldap_dn: Mapped[str | None] = mapped_column(Text)
    password_hash: Mapped[str | None] = mapped_column(String(255))  # local accounts only
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    deactivated_by_hr: Mapped[bool] = mapped_column(Boolean, default=False)
    source_id: Mapped[int | None] = mapped_column(BigInteger, index=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    company: Mapped[Company | None] = relationship(lazy="joined")
    roles: Mapped[list[UserRole]] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin"
    )


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role", "company_id", name="uq_user_role"),)
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[Role] = mapped_column(Enum(Role, name="role_enum"))
    # scope for HR_ENTITY; NULL for HR_ADMIN
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    granted_by: Mapped[int | None] = mapped_column(BigInteger)
    granted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="roles")
    company: Mapped[Company | None] = relationship(lazy="joined")


class QStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class Questionnaire(Base):
    """One version of the item bank. Drafts are editable; published versions are frozen (see app/questionnaire.py)."""

    __tablename__ = "questionnaires"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    label: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[QStatus] = mapped_column(Enum(QStatus, name="qstatus_enum"), default=QStatus.draft, index=True)
    content: Mapped[dict[str, Any]] = mapped_column(JsonType)
    revision: Mapped[int] = mapped_column(Integer, default=1)  # optimistic locking of concurrent edits
    based_on_id: Mapped[int | None] = mapped_column(ForeignKey("questionnaires.id", ondelete="SET NULL"))
    created_by: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_by: Mapped[str | None] = mapped_column(String(255))
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())
    published_by: Mapped[str | None] = mapped_column(String(255))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)  # T0, T+12, T+24
    label: Mapped[str] = mapped_column(String(255))
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)
    questionnaire_id: Mapped[int | None] = mapped_column(ForeignKey("questionnaires.id"), index=True)
    # questions drawn per respondent, per category ({"situations": 5, "blocs": 7}); NULL = all questions
    tirage: Mapped[dict[str, Any] | None] = mapped_column(JsonType, nullable=True)

    questionnaire: Mapped[Questionnaire | None] = relationship(lazy="select")


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("matricule", "campaign_id", name="uq_submission_matricule_campaign"),)
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    matricule: Mapped[str] = mapped_column(String(255))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"), index=True)
    filiale_label: Mapped[str | None] = mapped_column(String(255))
    categorie: Mapped[str | None] = mapped_column(String(255))
    famille: Mapped[str | None] = mapped_column(String(255))
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    duree_s: Mapped[int | None] = mapped_column(Integer)
    answers: Mapped[dict[str, Any]] = mapped_column(JsonType)
    scores: Mapped[dict[str, Any]] = mapped_column(JsonType)
    global_score: Mapped[float | None] = mapped_column("global", Float)
    dom: Mapped[dict[str, Any]] = mapped_column(JsonType)
    dom_haut: Mapped[str | None] = mapped_column(String(4))
    dom_bas: Mapped[str | None] = mapped_column(String(4))
    ds: Mapped[int] = mapped_column(Integer)
    inc: Mapped[int] = mapped_column(Integer)
    uniforme: Mapped[bool] = mapped_column(Boolean)
    rapide: Mapped[bool] = mapped_column(Boolean)
    ds_haut: Mapped[bool] = mapped_column(Boolean)
    invalide: Mapped[bool] = mapped_column(Boolean, index=True)
    source: Mapped[Source] = mapped_column(Enum(Source, name="source_enum"), default=Source.web)
    created_by: Mapped[int | None] = mapped_column(BigInteger)

    campaign: Mapped[Campaign] = relationship(lazy="joined")
    company: Mapped[Company | None] = relationship(lazy="joined")


class Draft(Base):
    __tablename__ = "drafts"
    __table_args__ = (UniqueConstraint("user_id", "campaign_id", name="uq_draft_user_campaign"),)
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"))
    payload: Mapped[dict[str, Any]] = mapped_column(JsonType)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(BigInteger)
    actor: Mapped[str | None] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str | None] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AiCache(Base):
    """Generated AI content kept so each debrief / HR analysis is produced once per data snapshot."""

    __tablename__ = "ai_cache"
    __table_args__ = (UniqueConstraint("kind", "key", name="uq_ai_cache_kind_key"),)
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    kind: Mapped[str] = mapped_column(String(32))
    key: Mapped[str] = mapped_column(String(255))
    content: Mapped[dict[str, Any]] = mapped_column(JsonType)
    model: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AiUsage(Base):
    """Per-user daily counter for chat messages (cost guard)."""

    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_ai_usage_user_day"),)
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    day: Mapped[date] = mapped_column(Date)
    count: Mapped[int] = mapped_column(Integer, default=0)
