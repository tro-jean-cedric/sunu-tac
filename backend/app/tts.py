"""Natural French text-to-speech with an on-disk MP3 cache.

Providers (the first with a key wins): Google Cloud Text-to-Speech, then Azure AI Speech.
The test's question texts are fixed, so each one is synthesised once per voice and then served from
the cache; only the dynamic texts (AI debrief, coach answers) cost new characters.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

import httpx

from app.config import settings

log = logging.getLogger("tac.tts")

AZURE_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
LOCALES = ("fr-FR", "fr-CA", "fr-BE", "fr-CH")
SAMPLE_TEXT = "Bonjour ! Je suis la voix qui vous lira les questions du test d'alignement culturel."


class TtsError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def provider() -> str | None:
    if settings.google_tts_api_key.strip():
        return "google"
    if settings.azure_speech_key.strip() and settings.azure_speech_region.strip():
        return "azure"
    return None


def normalise(text: str) -> str:
    return " ".join((text or "").split())


def cache_key(text: str, voice: str) -> str:
    return hashlib.sha256(f"{provider()}\n{voice}\nmp3\n{normalise(text)}".encode()).hexdigest()


def _http_error(name: str, r: httpx.Response) -> TtsError:
    if r.status_code in (400,) and "API key" in r.text:
        return TtsError(503, f"Clé {name} invalide (configuration serveur).")
    if r.status_code in (401, 403):
        return TtsError(503, f"Clé {name} invalide, API non activée ou facturation non configurée (configuration serveur).")
    if r.status_code == 429:
        return TtsError(429, "Synthèse vocale très sollicitée, réessayez dans un instant.")
    log.warning("%s TTS error %s: %s", name, r.status_code, r.text[:300])
    return TtsError(502, "La synthèse vocale a échoué.")


def _request(method: str, url: str, name: str, **kw: Any) -> httpx.Response:
    try:
        r = httpx.request(method, url, timeout=30.0, **kw)
    except httpx.HTTPError as exc:
        log.warning("%s TTS unreachable: %s", name, exc)
        raise TtsError(503, "Service de synthèse vocale injoignable.") from exc
    if r.status_code != 200:
        raise _http_error(name, r)
    return r


# ------------------------------------------------------------------------------------- voices

# quality rank of Google voice families (higher = more natural)
GOOGLE_RANK = {"Chirp3-HD": 6, "Chirp-HD": 5, "Studio": 5, "Neural2": 4, "Wavenet": 3, "Polyglot": 2, "Standard": 1}
GOOGLE_LABEL = {"Chirp3-HD": "Chirp 3 HD", "Chirp-HD": "Chirp HD", "Studio": "Studio", "Neural2": "Neural2",
                "Wavenet": "WaveNet", "Polyglot": "Polyglot", "Standard": "Standard"}
REGION = {"fr-FR": "France", "fr-CA": "Canada", "fr-BE": "Belgique", "fr-CH": "Suisse"}


def _google_voice(v: dict[str, Any]) -> dict[str, Any] | None:
    name = v.get("name", "")
    locale = next((c for c in v.get("languageCodes", []) if c in LOCALES), None)
    m = re.match(r"^([a-z]{2}-[A-Z]{2})-(Chirp3-HD|Chirp-HD|Studio|Neural2|Wavenet|Polyglot|Standard)-(.+)$", name)
    if not locale or not m:
        return None
    family, short = m.group(2), m.group(3)
    gender = {"FEMALE": "F", "MALE": "M"}.get(v.get("ssmlGender", ""))
    return {
        "id": name,
        "name": short if len(short) > 1 else f"Voix {short}",
        "gender": gender,
        "locale": locale,
        "region": REGION.get(locale, locale),
        "quality": GOOGLE_LABEL[family],
        "rank": GOOGLE_RANK[family],
    }


def _azure_voice(v: dict[str, Any]) -> dict[str, Any] | None:
    locale = v.get("Locale")
    if locale not in LOCALES or "Neural" not in (v.get("VoiceType") or "Neural"):
        return None
    multi = "Multilingual" in v.get("ShortName", "")
    return {
        "id": v["ShortName"],
        "name": v.get("LocalName") or v["ShortName"].split("-")[-1].replace("Neural", ""),
        "gender": {"Female": "F", "Male": "M"}.get(v.get("Gender", "")),
        "locale": locale,
        "region": REGION.get(locale, locale),
        "quality": "Neural multilingue" if multi else "Neural",
        "rank": 5 if multi else 4,
    }


_voices_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
VOICES_TTL = 6 * 3600


def list_voices() -> list[dict[str, Any]]:
    """French voices of the active provider, best first (cached in memory)."""
    p = provider()
    if p is None:
        return []
    hit = _voices_cache.get(p)
    if hit and time.time() - hit[0] < VOICES_TTL:
        return hit[1]
    if p == "google":
        r = _request("GET", "https://texttospeech.googleapis.com/v1/voices", "Google",
                     params={"languageCode": "fr"}, headers={"X-Goog-Api-Key": settings.google_tts_api_key})
        voices = [x for x in (_google_voice(v) for v in r.json().get("voices", [])) if x]
    else:
        r = _request("GET", f"https://{settings.azure_speech_region}.tts.speech.microsoft.com/cognitiveservices/voices/list",
                     "Azure", headers={"Ocp-Apim-Subscription-Key": settings.azure_speech_key})
        voices = [x for x in (_azure_voice(v) for v in r.json()) if x]
    voices.sort(key=lambda v: (LOCALES.index(v["locale"]), -v["rank"], v["name"]))
    _voices_cache[p] = (time.time(), voices)
    return voices


def default_voice(voices: list[dict[str, Any]]) -> str | None:
    ids = {v["id"] for v in voices}
    if settings.tts_voice and settings.tts_voice in ids:
        return settings.tts_voice
    return voices[0]["id"] if voices else None


def resolve_voice(requested: str | None) -> str:
    voices = list_voices()
    if requested:
        if requested not in {v["id"] for v in voices}:
            raise TtsError(422, "Voix inconnue.")
        return requested
    v = default_voice(voices)
    if not v:
        raise TtsError(503, "Aucune voix française disponible.")
    return v


# ---------------------------------------------------------------------------------- synthesis


def ssml(text: str, voice: str) -> str:
    lang = "-".join(voice.split("-")[:2]) or "fr-FR"
    return (
        f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='{lang}'>"
        f"<voice name='{escape(voice, {chr(39): '&apos;'})}'>{escape(normalise(text))}</voice></speak>"
    )


def _google(text: str, voice: str) -> bytes:
    lang = "-".join(voice.split("-")[:2])
    r = _request("POST", "https://texttospeech.googleapis.com/v1/text:synthesize", "Google",
                 headers={"X-Goog-Api-Key": settings.google_tts_api_key},
                 json={"input": {"text": normalise(text)}, "voice": {"languageCode": lang, "name": voice},
                       "audioConfig": {"audioEncoding": "MP3"}})
    content = r.json().get("audioContent")
    if not content:
        raise TtsError(502, "La synthèse vocale a échoué.")
    return base64.b64decode(content)


def _azure(text: str, voice: str) -> bytes:
    r = _request("POST", f"https://{settings.azure_speech_region}.tts.speech.microsoft.com/cognitiveservices/v1",
                 "Azure", content=ssml(text, voice).encode("utf-8"),
                 headers={"Ocp-Apim-Subscription-Key": settings.azure_speech_key,
                          "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": AZURE_FORMAT,
                          "User-Agent": "tac-sunu"})
    if not r.content:
        raise TtsError(502, "La synthèse vocale a échoué.")
    return r.content


def _cache_dir() -> Path:
    d = Path(settings.tts_cache_dir)
    d.mkdir(parents=True, exist_ok=True)
    return d


def synthesize(text: str, voice: str | None = None) -> tuple[bytes, bool]:
    """Return (mp3 bytes, served_from_cache)."""
    voice = resolve_voice(voice)
    path = _cache_dir() / f"{cache_key(text, voice)}.mp3"
    if path.exists():
        return path.read_bytes(), True
    audio = _google(text, voice) if provider() == "google" else _azure(text, voice)
    # atomic write so concurrent requests never read a half-written file
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".part")
    with os.fdopen(fd, "wb") as fh:
        fh.write(audio)
    os.replace(tmp, path)
    return audio, False
