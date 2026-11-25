"""Natural read-aloud endpoints (Google / Azure), with the provider HTTP calls faked (no network)."""

import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import tts
from app.config import settings
from app.main import app

from .test_api import login

GOOGLE_VOICES = {"voices": [
    {"name": "fr-FR-Standard-A", "languageCodes": ["fr-FR"], "ssmlGender": "FEMALE"},
    {"name": "fr-FR-Neural2-F", "languageCodes": ["fr-FR"], "ssmlGender": "FEMALE"},
    {"name": "fr-FR-Chirp3-HD-Aoede", "languageCodes": ["fr-FR"], "ssmlGender": "FEMALE"},
    {"name": "fr-CA-Wavenet-B", "languageCodes": ["fr-CA"], "ssmlGender": "MALE"},
    {"name": "en-US-Neural2-A", "languageCodes": ["en-US"], "ssmlGender": "MALE"},
]}
AZURE_VOICES = [
    {"ShortName": "fr-FR-DeniseNeural", "LocalName": "Denise", "Gender": "Female", "Locale": "fr-FR", "VoiceType": "Neural"},
    {"ShortName": "fr-FR-VivienneMultilingualNeural", "LocalName": "Vivienne", "Gender": "Female", "Locale": "fr-FR",
     "VoiceType": "Neural"},
    {"ShortName": "en-US-JennyNeural", "LocalName": "Jenny", "Gender": "Female", "Locale": "en-US", "VoiceType": "Neural"},
]


class Resp:
    def __init__(self, status=200, body=None, content=b""):
        self.status_code = status
        self._body = body
        self.content = content or (json.dumps(body).encode() if body is not None else b"")
        self.text = self.content.decode(errors="ignore")

    def json(self):
        return self._body


@pytest.fixture
def fake(monkeypatch, tmp_path):
    """Install a fake provider: fake('google'|'azure', synth=Resp|Exception)."""
    monkeypatch.setattr(settings, "tts_cache_dir", str(tmp_path))
    monkeypatch.setattr(settings, "tts_voice", "")
    tts._voices_cache.clear()
    calls = []

    def install(prov, synth=None):
        monkeypatch.setattr(settings, "google_tts_api_key", "g-key" if prov == "google" else "")
        monkeypatch.setattr(settings, "azure_speech_key", "az-key" if prov == "azure" else "")
        tts._voices_cache.clear()

        def request(method, url, timeout, **kw):
            calls.append({"method": method, "url": url, **kw})
            if "voices" in url:
                return Resp(body=GOOGLE_VOICES if prov == "google" else AZURE_VOICES)
            if isinstance(synth, Exception):
                raise synth
            if synth is not None:
                return synth
            if prov == "google":
                return Resp(body={"audioContent": base64.b64encode(b"ID3google").decode()})
            return Resp(content=b"ID3azure")

        monkeypatch.setattr(tts.httpx, "request", request)
        return calls

    return install


def test_disabled_and_auth(client, monkeypatch):
    monkeypatch.setattr(settings, "google_tts_api_key", "")
    monkeypatch.setattr(settings, "azure_speech_key", "")
    assert client.get("/api/meta/config").json()["tts_enabled"] is False
    c = login("emp7")
    assert c.post("/api/tts", json={"text": "Bonjour"}).status_code == 503
    assert c.get("/api/tts/voices").status_code == 503


def test_requires_login(client, fake):
    fake("google")
    assert TestClient(app).post("/api/tts", json={"text": "Bonjour"}).status_code == 401
    assert TestClient(app).get("/api/tts/voices").status_code == 401


def test_google_voices_ranked_french_only(client, fake):
    calls = fake("google")
    c = login("emp7")
    assert c.get("/api/meta/config").json()["tts_enabled"] is True
    body = c.get("/api/tts/voices").json()
    ids = [v["id"] for v in body["voices"]]
    assert ids == ["fr-FR-Chirp3-HD-Aoede", "fr-FR-Neural2-F", "fr-FR-Standard-A", "fr-CA-Wavenet-B"]
    assert body["provider"] == "google" and body["default"] == "fr-FR-Chirp3-HD-Aoede"
    aoede = body["voices"][0]
    assert aoede["name"] == "Aoede" and aoede["quality"] == "Chirp 3 HD" and aoede["gender"] == "F"
    assert body["voices"][1]["name"] == "Voix F"
    assert calls[0]["headers"]["X-Goog-Api-Key"] == "g-key"
    c.get("/api/tts/voices")
    assert len(calls) == 1  # voice list cached in memory


def test_google_synthesis_voice_choice_and_cache(client, fake):
    calls = fake("google")
    c = login("emp7")
    r = c.post("/api/tts", json={"text": "Que feriez-vous réellement ?"})
    assert r.status_code == 200 and r.content == b"ID3google" and r.headers["x-tts-cache"] == "miss"
    syn = calls[-1]
    assert syn["url"].endswith("/v1/text:synthesize")
    assert syn["json"]["voice"] == {"languageCode": "fr-FR", "name": "fr-FR-Chirp3-HD-Aoede"}
    assert syn["json"]["audioConfig"] == {"audioEncoding": "MP3"}
    # same text → cache hit; another voice → new synthesis
    assert c.post("/api/tts", json={"text": "Que feriez-vous  réellement ?"}).headers["x-tts-cache"] == "hit"
    r2 = c.post("/api/tts", json={"text": "Que feriez-vous réellement ?", "voice": "fr-CA-Wavenet-B"})
    assert r2.headers["x-tts-cache"] == "miss" and calls[-1]["json"]["voice"]["languageCode"] == "fr-CA"
    assert c.post("/api/tts", json={"text": "x", "voice": "en-US-Neural2-A"}).status_code == 422


def test_default_voice_from_settings(client, fake, monkeypatch):
    calls = fake("google")
    monkeypatch.setattr(settings, "tts_voice", "fr-FR-Neural2-F")
    c = login("emp7")
    assert c.get("/api/tts/voices").json()["default"] == "fr-FR-Neural2-F"
    c.post("/api/tts", json={"text": "Bonjour"})
    assert calls[-1]["json"]["voice"]["name"] == "fr-FR-Neural2-F"


def test_azure_provider(client, fake):
    calls = fake("azure")
    c = login("emp7")
    body = c.get("/api/tts/voices").json()
    assert body["provider"] == "azure"
    assert [v["id"] for v in body["voices"]] == ["fr-FR-VivienneMultilingualNeural", "fr-FR-DeniseNeural"]
    r = c.post("/api/tts", json={"text": "Que feriez-vous <vraiment> & pourquoi ?", "voice": "fr-FR-DeniseNeural"})
    assert r.content == b"ID3azure"
    syn = calls[-1]
    assert syn["url"] == "https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1"
    body = syn["content"].decode()
    assert "<voice name='fr-FR-DeniseNeural'>" in body and "&lt;vraiment&gt; &amp; pourquoi" in body


def test_errors_mapped(client, fake):
    c = login("emp7")
    fake("google", synth=Resp(status=403, body={"error": "billing"}))
    assert c.post("/api/tts", json={"text": "a"}).status_code == 503
    fake("google", synth=Resp(status=429, body={}))
    assert c.post("/api/tts", json={"text": "b"}).status_code == 429
    fake("google", synth=httpx.ConnectError("down"))
    assert c.post("/api/tts", json={"text": "c"}).status_code == 503
    assert c.post("/api/tts", json={"text": "x" * 1501}).status_code == 422
    assert c.post("/api/tts", json={"text": "   "}).status_code == 422
