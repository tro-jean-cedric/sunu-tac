from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str
    password: str


class CompanyOut(BaseModel):
    id: int
    name: str
    code: str | None = None
    active: bool = True

    model_config = {"from_attributes": True}


class RoleOut(BaseModel):
    id: int
    role: str
    company_id: int | None = None
    company_name: str | None = None


class MeOut(BaseModel):
    id: int
    username: str
    name: str
    email: str | None
    filliale: str | None
    department: str | None
    title: str | None
    company: CompanyOut | None
    roles: list[RoleOut]
    is_hr: bool
    is_hr_admin: bool
    local_account: bool


class CampaignOut(BaseModel):
    id: int
    code: str
    label: str
    opens_at: datetime | None
    closes_at: datetime | None
    active: bool
    position: int
    questionnaire_id: int | None = None
    tirage: dict[str, int] | None = None

    model_config = {"from_attributes": True}


class CampaignIn(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    label: str = Field(min_length=1, max_length=255)
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    active: bool = False
    position: int = 0
    questionnaire_id: int | None = None
    tirage: dict[str, int | None] | None = None


class CampaignPatch(BaseModel):
    label: str | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    active: bool | None = None
    position: int | None = None
    questionnaire_id: int | None = None
    tirage: dict[str, int | None] | None = None


class BlocAnswer(BaseModel):
    most: int | None = None
    least: int | None = None


class Answers(BaseModel):
    sit: dict[str, int] = {}
    bloc: dict[str, BlocAnswer] = {}
    lik: dict[str, int] = {}
    extra: dict[str, Any] = {}


class DraftIn(BaseModel):
    campaign_id: int
    payload: dict[str, Any]


class SubmissionIn(Answers):
    campaign_id: int
    categorie: str
    famille: str
    started_at: datetime | None = None


class ImportCodesIn(BaseModel):
    codes: list[str]


class ImportFilesIn(BaseModel):
    items: list[dict[str, Any]]


class ImportReport(BaseModel):
    imported: int
    replaced: int
    invalid_tests: int
    unreadable: int
    errors: list[str]


class RoleGrantIn(BaseModel):
    role: str
    company_id: int | None = None


class QuestionnaireCreate(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    description: str | None = None
    from_id: int | None = None  # copy of an existing version
    template: str | None = None  # "origine" (legacy bank) | "vide"
    content: dict[str, Any] | None = None  # imported JSON


class QuestionnaireUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    content: dict[str, Any] | None = None
    revision: int


class ContentIn(BaseModel):
    content: dict[str, Any]
