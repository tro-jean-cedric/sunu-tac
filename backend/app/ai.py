"""Claude (Anthropic) integration: prompts, privacy-safe context builders and SSE streaming helpers.

Privacy rule: nothing sent to Claude identifies a person. Context builders only use scores, profiles,
catégorie/famille, entity names of aggregated (and masked) groups and the item bank text.
"""

from __future__ import annotations

import hashlib
import json
import logging
from collections.abc import Callable, Iterator
from functools import lru_cache
from typing import Any

import anthropic

from app import questionnaire as Q
from app import referentiel as R
from app.config import settings
from app.models import Submission

log = logging.getLogger("tac.ai")

# Plain-language meaning of the four dimensions (the item bank only carries their labels).
DIM_MEANING = {
    "H": "Héritage — fierté d'appartenance au Groupe SUNU, intégrité, respect des règles et des contrôles, "
         "transmission de l'histoire et de l'image du Groupe.",
    "C": "Collaboration — partage d'information, entraide entre services et entre filiales, écoute, "
         "travail en équipe au-delà de son périmètre.",
    "A": "Autonomie — initiative, prise de décision à son niveau, responsabilité de ses choix, capacité à "
         "avancer sans attendre d'être relancé.",
    "P": "Performance — orientation résultats et client, exigence de qualité, mesure de l'effet réel de ses "
         "actions, amélioration continue.",
}


# ----------------------------------------------------------------------------------------- client


@lru_cache
def client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=180.0, max_retries=2)


def _thinking() -> dict[str, Any]:
    return {"type": "adaptive"}


# ----------------------------------------------------------------------------------- framework


@lru_cache
def framework() -> str:
    """Static description of the TAC-SUNU model (identical bytes on every call → prompt-cache friendly)."""
    ref = R.ref()
    names = R.dim_names()
    lines = [
        "# Le Test d'Alignement Culturel SUNU (TAC-SUNU)",
        "Le TAC mesure l'alignement d'un collaborateur du Groupe SUNU (assurance et banque, Afrique de l'Ouest et "
        "centrale) avec les quatre valeurs du Groupe, regroupées sous le sigle HCAP. C'est un outil de "
        "développement, pas d'évaluation de la performance individuelle.",
        "",
        "## Les quatre dimensions",
    ]
    lines += [f"- {d} : {DIM_MEANING.get(d, names[d])}" for d in R.dim_keys()]
    lines += [
        "",
        "## Comment le score est construit",
        "- Partie 1 — 12 mises en situation (choix de la réaction la plus probable, 0 à 3 points).",
        "- Partie 2 — 12 blocs de trois affirmations positives : la personne choisit celle qui lui ressemble le plus "
        "et le moins. On en tire la dimension « dominante haute » (spontanément privilégiée) et « dominante basse » "
        "(sacrifiée en cas d'arbitrage). Ce n'est pas un score : c'est une préférence relative.",
        "- Partie 3 — 26 pratiques auto-évaluées sur une échelle de fréquence (Jamais … Presque toujours).",
        "- Score par dimension (0–100) = 60 % situations + 40 % pratiques (situations seules si la désirabilité "
        "sociale est élevée). Score global = moyenne des quatre dimensions.",
        "",
        "## Profils (bandes du score global)",
    ]
    lines += [f"- {b['label']} (≥ {b['min']}) : {b['description']}" for b in ref["bandes"]]
    lines += ["", "## Pratiques observées (partie 3), par dimension"]
    for d in R.dim_keys():
        lines.append(f"### {names[d]}")
        for it in ref["likert"]:
            if it["dim"] == d:
                lines.append(f"- [{it['id']}{' — formulation inversée' if it['rev'] else ''}] {it['txt']}")
    lines += ["", "## Mises en situation (partie 1)"]
    for q in ref["situations"]:
        lines.append(f"- [{q['id']} · {names[q['dim']]}] {q['txt']}")
    return "\n".join(lines)


EMPLOYEE_RULES = """Tu es « Coach TAC », le coach bienveillant du Test d'Alignement Culturel SUNU.
Tu t'adresses directement au collaborateur qui vient de passer le test, en français, en le vouvoyant.

Règles :
- Ton chaleureux, concret, encourageant, jamais moralisateur ni condescendant. Pas de jargon psychométrique.
- Tu t'appuies uniquement sur ses résultats fournis et sur le référentiel HCAP. N'invente aucun chiffre.
- Le test est un outil de développement : ne parle jamais de sanction, d'évaluation annuelle, de promotion ni de
  décision RH. Pas de diagnostic psychologique ou médical.
- Tu ne révèles pas quelle réponse « rapporte le plus de points » et tu ne donnes pas de conseils pour mieux
  réussir le test : tu aides à progresser au travail, pas à optimiser un score.
- Si une question sort du cadre (sa vie privée, d'autres collègues, sujets sans lien avec le travail et les
  valeurs SUNU), réponds en une phrase aimable que ce n'est pas ton rôle et propose un sujet lié à son profil.
- Si les indicateurs signalent une désirabilité sociale élevée ou une passation rapide, mentionne avec tact que
  les résultats sont à lire avec prudence.
- Mise en forme : Markdown simple uniquement (titres ###, listes « - », **gras**). Pas de tableaux, pas d'emoji
  excessif (un ou deux maximum)."""

HR_RULES = """Tu es l'assistant d'analyse de la DRH du Groupe SUNU pour le Test d'Alignement Culturel (TAC-SUNU).
Tu travailles uniquement sur des résultats collectifs agrégés. Réponds en français, de façon factuelle et
actionnable, à destination de responsables RH.

Règles :
- N'invente aucun chiffre : cite seulement les données fournies ou obtenues par tes outils, arrondies à l'entier.
- Les groupes de moins de {min_group} répondants sont masqués (scores null) pour protéger l'anonymat : ne
  cherche jamais à les déduire ni à les recouper, et signale-les comme « effectif insuffisant ».
- Aucune donnée individuelle n'est disponible : si on te demande des noms ou des résultats individuels, explique
  que l'assistant ne travaille que sur des agrégats et renvoie vers l'onglet Répondants de la console.
- Distingue constat (données) et hypothèse (interprétation). Signale quand un effectif est faible (< 15).
- Recommandations concrètes : qui, quoi, à quel horizon. Pas de jugement sur des personnes."""


def _system(rules: str, extra: str | None = None) -> list[dict[str, Any]]:
    """Framework + rules are static and cached; per-request context goes after the breakpoint."""
    blocks: list[dict[str, Any]] = [
        {"type": "text", "text": framework()},
        {"type": "text", "text": rules, "cache_control": {"type": "ephemeral"}},
    ]
    if extra:
        blocks.append({"type": "text", "text": extra})
    return blocks


# --------------------------------------------------------------------------- employee context


def profile_context(s: Submission) -> dict[str, Any]:
    """Everything the coach may know about one result — no identity fields."""
    names = R.dim_names()
    final = s.scores.get("final", {})
    lik_answers = (s.answers or {}).get("lik", {})
    practices = []
    qref = Q.ref_for_campaign(None, s.campaign)
    lo, hi = Q.scale_bounds(qref)
    for it in qref["likert"]:
        v = lik_answers.get(it["id"])
        if v is None:
            continue
        # rescaled to 1..5 whatever the questionnaire's scale (5 = the desired behaviour is very frequent)
        aligned = lo + hi - v if it["rev"] else v
        freq = round(1 + (aligned - lo) * 4 / (hi - lo)) if hi > lo else aligned
        practices.append({"id": it["id"], "dimension": names[it["dim"]], "pratique": it["txt"],
                          "inversee": it["rev"], "frequence_alignee_1_5": freq})
    practices.sort(key=lambda p: p["frequence_alignee_1_5"])
    return {
        "campagne": s.campaign.code if s.campaign else None,
        "categorie": s.categorie,
        "famille_metier": s.famille,
        "score_global": _r(s.global_score),
        "profil": None if s.invalide else R.bande(s.global_score),
        "scores_par_dimension": {names[d]: _r(final.get(d)) for d in R.dim_keys()},
        "detail_situations": {names[d]: _r(v) for d, v in (s.scores.get("sjt") or {}).items() if d in names},
        "detail_pratiques": {names[d]: _r(v) for d, v in (s.scores.get("lik") or {}).items() if d in names},
        "dominante_haute": names.get(s.dom_haut or "", None),
        "dominante_basse": names.get(s.dom_bas or "", None),
        "pratiques_les_moins_frequentes": practices[:4],
        "pratiques_les_plus_frequentes": practices[-4:][::-1],
        "indicateurs": {
            "desirabilite_sociale_elevee": s.ds_haut,
            "passation_rapide": s.rapide,
            "resultat_non_exploitable": s.invalide,
        },
    }


def _r(v: Any) -> int | None:
    return None if v is None else int(round(float(v)))


DEBRIEF_ASK = """Rédige ma lecture personnalisée à partir de mes résultats ci-dessus, en 300 à 420 mots, avec
exactement ces sections :

### Votre profil en un coup d'œil
(2–3 phrases : profil, score global, ce qui ressort.)
### Vos points forts
(2 ou 3 puces, chacune reliée à une dimension et à une pratique concrète.)
### Vos pistes de progrès
(2 puces, formulées positivement, reliées aux pratiques les moins fréquentes ou à la dominante basse.)
### 3 actions pour les 30 prochains jours
(3 puces très concrètes, faisables dans mon quotidien de travail, adaptées à ma catégorie et à ma famille de métier.)
### Votre super-pouvoir
(Une seule phrase mémorable et positive.)"""


def debrief_messages(s: Submission) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ctx = json.dumps(profile_context(s), ensure_ascii=False, indent=1)
    system = _system(EMPLOYEE_RULES)
    messages = [{"role": "user", "content": f"Mes résultats au TAC-SUNU :\n```json\n{ctx}\n```\n\n{DEBRIEF_ASK}"}]
    return system, messages


def coach_messages(s: Submission, debrief: str | None, history: list[dict[str, str]]):
    ctx = json.dumps(profile_context(s), ensure_ascii=False, indent=1)
    extra = f"Résultats du collaborateur (anonymes) :\n```json\n{ctx}\n```"
    if debrief:
        extra += f"\n\nLecture personnalisée qui lui a déjà été présentée :\n{debrief}"
    extra += "\n\nRéponds en 180 mots maximum, sauf si on te demande explicitement plus de détails."
    return _system(EMPLOYEE_RULES, extra), [{"role": m["role"], "content": m["content"]} for m in history]


# ------------------------------------------------------------------------------- HR insights

_POINT: dict[str, Any] = {
    "type": "object",
    "properties": {"title": {"type": "string"}, "detail": {"type": "string"}},
    "required": ["title", "detail"],
    "additionalProperties": False,
}

INSIGHTS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "Une phrase de synthèse (max 25 mots)."},
        "summary": {"type": "string", "description": "3 à 5 phrases de lecture d'ensemble."},
        "strengths": {"type": "array", "items": _POINT},
        "risks": {"type": "array", "items": _POINT},
        "gaps": {"type": "array", "items": _POINT,
                 "description": "Écarts notables entre groupes (filiales, catégories, familles) ou campagnes."},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "owner": {"type": "string", "description": "Qui porte l'action (ex. DRH Groupe, managers…)."},
                    "horizon": {"type": "string", "enum": ["0-3 mois", "3-6 mois", "6-12 mois"]},
                },
                "required": ["title", "detail", "owner", "horizon"],
                "additionalProperties": False,
            },
        },
        "caveats": {"type": "array", "items": {"type": "string"},
                    "description": "Limites de lecture (effectifs, groupes masqués, taux de participation…)."},
    },
    "required": ["headline", "summary", "strengths", "risks", "gaps", "actions", "caveats"],
    "additionalProperties": False,
}


def slim_summary(summary: dict[str, Any], filters: dict[str, Any]) -> dict[str, Any]:
    """The dashboard summary rounded for the model (it is already aggregated and masked)."""

    def rnd(x: Any) -> Any:
        if isinstance(x, float):
            return round(x, 1)
        if isinstance(x, dict):
            return {k: rnd(v) for k, v in x.items()}
        if isinstance(x, list):
            return [rnd(v) for v in x]
        return x

    names = R.dim_names()
    out = rnd({k: v for k, v in summary.items() if k not in ("campaigns_present",)})
    out["par_dim"] = {names.get(k, k): v for k, v in (out.get("par_dim") or {}).items()}
    out["filtres_appliques"] = {k: v for k, v in filters.items() if v}
    return out


def hr_system() -> list[dict[str, Any]]:
    return _system(HR_RULES.format(min_group=settings.min_group_size))


def insights_request(data: dict[str, Any]) -> dict[str, Any]:
    ctx = json.dumps(data, ensure_ascii=False, default=str)
    return dict(
        system=hr_system(),
        messages=[{"role": "user", "content":
                   "Voici les résultats agrégés du tableau de bord (filtres compris) :\n```json\n" + ctx +
                   "\n```\nProduis une analyse pour le comité de direction RH : 2–4 forces, 2–4 risques, les écarts "
                   "significatifs entre groupes, puis 3–5 actions priorisées. Reste strictement fidèle aux données."}],
        output_config={"format": {"type": "json_schema", "schema": INSIGHTS_SCHEMA}},
    )


def fingerprint(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:32]


# --------------------------------------------------------------------------- HR assistant tools

HR_TOOLS: list[dict[str, Any]] = [
    {
        "name": "list_filters",
        "description": "Liste les valeurs de filtre disponibles dans le périmètre de l'utilisateur : campagnes "
                       "(code), entités/filiales (nom), catégories et familles de métier. À appeler avant "
                       "get_summary si tu n'es pas sûr de l'orthographe exacte d'un filtre.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_summary",
        "description": "Renvoie les résultats agrégés du TAC (scores moyens par dimension, profils, dominances, "
                       "résultats par filiale/catégorie/famille, tendance par campagne) pour une combinaison de "
                       "filtres. Tous les filtres sont optionnels ; sans filtre = tout le périmètre. Les groupes "
                       "trop petits sont masqués. Aucune donnée individuelle.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_code": {"type": "string", "description": "Code de campagne, ex. T0."},
                "company_name": {"type": "string", "description": "Nom exact de l'entité/filiale."},
                "categorie": {"type": "string"},
                "famille": {"type": "string"},
            },
            "additionalProperties": False,
        },
    },
]


# ----------------------------------------------------------------------------------- streaming


def sse(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def friendly_error(exc: Exception) -> str:
    if isinstance(exc, anthropic.RateLimitError):
        return "Le service d'IA est très sollicité. Réessayez dans une minute."
    if isinstance(exc, anthropic.AuthenticationError | anthropic.PermissionDeniedError):
        return "La clé d'API Anthropic est invalide ou non autorisée (configuration serveur)."
    if isinstance(exc, anthropic.APIConnectionError):
        return "Impossible de joindre le service d'IA (réseau)."
    if isinstance(exc, anthropic.APIStatusError) and exc.status_code >= 500:
        return "Le service d'IA est momentanément indisponible. Réessayez plus tard."
    return "La génération a échoué. Réessayez plus tard."


def stream_text(system: list[dict[str, Any]], messages: list[dict[str, Any]], *, effort: str = "medium",
                on_done: Callable[[str], None] | None = None) -> Iterator[str]:
    """Stream a plain-text answer as SSE `delta` events, then `done`. Errors become an `error` event."""
    parts: list[str] = []
    try:
        with client().messages.stream(
            model=settings.ai_model, max_tokens=16000, system=system, messages=messages,
            thinking=_thinking(), output_config={"effort": effort},
        ) as stream:
            for text in stream.text_stream:
                parts.append(text)
                yield sse("delta", {"t": text})
            final = stream.get_final_message()
        if final.stop_reason == "refusal":
            yield sse("error", {"detail": "Je ne peux pas répondre à cette demande."})
            return
        full = "".join(parts)
        if on_done and full.strip():
            on_done(full)
        yield sse("done", {})
    except Exception as exc:  # noqa: BLE001 — surfaced to the client as an SSE error event
        log.warning("AI stream failed: %s", exc)
        yield sse("error", {"detail": friendly_error(exc)})


def run_tool_loop(system: list[dict[str, Any]], messages: list[dict[str, Any]],
                  execute: Callable[[str, dict[str, Any]], Any], *, max_rounds: int = 6) -> Iterator[str]:
    """Manual agentic loop: stream text deltas; run tools between rounds (emitting `tool` events)."""
    msgs = list(messages)
    try:
        for _ in range(max_rounds):
            emitted = False
            with client().messages.stream(
                model=settings.ai_model, max_tokens=16000, system=system, messages=msgs, tools=HR_TOOLS,
                thinking=_thinking(), output_config={"effort": "medium"},
            ) as stream:
                for text in stream.text_stream:
                    emitted = True
                    yield sse("delta", {"t": text})
                final = stream.get_final_message()
            if final.stop_reason == "refusal":
                yield sse("error", {"detail": "Je ne peux pas répondre à cette demande."})
                return
            if final.stop_reason != "tool_use":
                yield sse("done", {})
                return
            if emitted:
                yield sse("delta", {"t": "\n\n"})
            msgs.append({"role": "assistant", "content": final.content})
            results = []
            for block in final.content:
                if block.type != "tool_use":
                    continue
                yield sse("tool", {"name": block.name, "input": block.input})
                try:
                    out = execute(block.name, dict(block.input or {}))
                    results.append({"type": "tool_result", "tool_use_id": block.id,
                                    "content": json.dumps(out, ensure_ascii=False, default=str)})
                except Exception as exc:  # noqa: BLE001 — returned to the model as a tool error
                    results.append({"type": "tool_result", "tool_use_id": block.id,
                                    "content": f"Erreur : {exc}", "is_error": True})
            msgs.append({"role": "user", "content": results})
        yield sse("delta", {"t": "\n\n_(Analyse interrompue : trop d'étapes. Reformulez votre question.)_"})
        yield sse("done", {})
    except Exception as exc:  # noqa: BLE001
        log.warning("AI tool loop failed: %s", exc)
        yield sse("error", {"detail": friendly_error(exc)})
