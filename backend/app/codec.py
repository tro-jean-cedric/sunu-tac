"""`TAC1.` restitution codes, byte-compatible with the legacy HTML encoder/decoder.

Legacy: "TAC1." + btoa(unescape(encodeURIComponent(meta|a|b|c))) == base64(UTF-8 bytes).
meta = matricule~filiale~categorie~famille~campagne~dureeS
a = 1 char per situation (option index + 1, '-' = unanswered)
b = 2 chars per bloc (most+1, least+1, '--' = unanswered)
c = 1 char per Likert+validity item (1..5, '-' = unanswered)
e = optional 5th part, only when the questionnaire has complementary questions: JSON of their answers
    (the legacy decoder reads the first four parts only, so codes stay readable by it)

Positions follow the questionnaire of the campaign: `decode` reads the campaign code first, then asks
`resolve(campaign_code, matricule)` for the matching questions (default: the original item bank) — the
matricule matters when the campaign draws a random subset of questions per respondent.
"""

from __future__ import annotations

import base64
import json
import re
from collections.abc import Callable
from typing import Any

from app import questionnaire as Q

PREFIX = re.compile(r"^TAC1\.")


def encode(ident: dict[str, Any], sit: dict, bloc: dict, lik: dict, duree_s: int,
           ref: dict[str, Any] | None = None, extra: dict[str, Any] | None = None) -> str:
    ref = ref or Q.merged_ref(None)
    a = "".join("-" if sit.get(q["id"]) is None else str(sit[q["id"]] + 1) for q in ref["situations"])
    b_parts = []
    for x in ref["blocs"]:
        c = bloc.get(x["id"]) or {}
        if c.get("most") is not None and c.get("least") is not None:
            b_parts.append(f"{c['most'] + 1}{c['least'] + 1}")
        else:
            b_parts.append("--")
    c_str = "".join("-" if lik.get(i["id"]) is None else str(lik[i["id"]]) for i in Q.likall(ref))
    meta = "~".join(
        [
            str(ident.get("matricule") or ""),
            str(ident.get("filiale") or ""),
            str(ident.get("categorie") or ""),
            str(ident.get("famille") or ""),
            str(ident.get("campagne") or ""),
            str(duree_s),
        ]
    )
    raw = f"{meta}|{a}|{''.join(b_parts)}|{c_str}"
    if ref.get("extras") and extra:
        raw += "|" + json.dumps(extra, ensure_ascii=False, separators=(",", ":"))
    return "TAC1." + base64.b64encode(raw.encode("utf-8")).decode("ascii")


def decode(code: str, resolve: Callable[[str, str], dict[str, Any] | None] | None = None) -> dict[str, Any] | None:
    try:
        raw = base64.b64decode(PREFIX.sub("", code.strip()), validate=True).decode("utf-8")
        parts_all = raw.split("|")
        meta, a, b, c = parts_all[:4]
        parts = meta.split("~")
        parts += [""] * (6 - len(parts))
        matricule, filiale, categorie, famille, campagne, duree = parts[:6]
        ref = (resolve(campagne, matricule) if resolve else None) or Q.merged_ref(None)
        sit: dict[str, int] = {}
        for i, q in enumerate(ref["situations"]):
            ch = a[i] if i < len(a) else ""
            if ch and ch != "-":
                sit[q["id"]] = int(ch) - 1
        bloc: dict[str, dict[str, int]] = {}
        for i, x in enumerate(ref["blocs"]):
            m = b[i * 2] if i * 2 < len(b) else ""
            l = b[i * 2 + 1] if i * 2 + 1 < len(b) else ""
            if m and m != "-" and l and l != "-":
                bloc[x["id"]] = {"most": int(m) - 1, "least": int(l) - 1}
        lik: dict[str, int] = {}
        for i, it in enumerate(Q.likall(ref)):
            ch = c[i] if i < len(c) else ""
            if ch and ch != "-":
                lik[it["id"]] = int(ch)
        extra: dict[str, Any] = {}
        if len(parts_all) > 4:
            try:
                parsed = json.loads("|".join(parts_all[4:]))
                extra = parsed if isinstance(parsed, dict) else {}
            except ValueError:
                extra = {}
        try:
            duree_s = int(duree) or None
        except ValueError:
            duree_s = None
        return {
            "ident": {
                "matricule": matricule,
                "filiale": filiale,
                "categorie": categorie,
                "famille": famille,
                "campagne": campagne,
            },
            "sit": sit,
            "bloc": bloc,
            "lik": lik,
            "extra": extra,
            "dureeS": duree_s,
        }
    except Exception:
        return None
