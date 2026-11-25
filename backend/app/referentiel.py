"""Item bank of the TAC-SUNU test, loaded from the shared JSON (single source of truth).

`shared/referentiel.json` was extracted verbatim from the legacy `TAC-SUNU-test.html`.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import settings


@lru_cache
def load() -> dict[str, Any]:
    path = Path(settings.referentiel_path)
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def ref() -> dict[str, Any]:
    return load()


def dim_keys() -> list[str]:
    return [d["id"] for d in ref()["dims"]]


def dim_names() -> dict[str, str]:
    return {d["id"]: d["label"] for d in ref()["dims"]}


def likall() -> list[dict[str, Any]]:
    """Likert items followed by validity items: the order used by the restitution code."""
    return ref()["likert"] + ref()["validite"]


def bande(value: float | None) -> str:
    if value is None:
        return "—"
    for b in ref()["bandes"]:
        if value >= b["min"]:
            return b["label"]
    return "—"
