"""Natural French read-aloud: list the provider's French voices; POST text (+ voice), get an MP3 (cached)."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app import tts
from app.config import settings
from app.security import CurrentUser

router = APIRouter(tags=["tts"])


class TtsIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)
    voice: str | None = Field(default=None, max_length=100)


def _require() -> None:
    if not settings.tts_enabled:
        raise HTTPException(503, "La voix naturelle n'est pas configurée sur ce serveur.")


@router.get("/tts/voices")
def voices(_: CurrentUser):
    _require()
    try:
        vs = tts.list_voices()
    except tts.TtsError as exc:
        raise HTTPException(exc.status, exc.detail) from exc
    return {"provider": tts.provider(), "default": tts.default_voice(vs), "voices": vs, "sample": tts.SAMPLE_TEXT}


@router.post("/tts", responses={200: {"content": {"audio/mpeg": {}}}})
def speak(body: TtsIn, _: CurrentUser):
    _require()
    if not tts.normalise(body.text):
        raise HTTPException(422, "Texte vide.")
    try:
        audio, cached = tts.synthesize(body.text, body.voice)
    except tts.TtsError as exc:
        raise HTTPException(exc.status, exc.detail) from exc
    return Response(audio, media_type="audio/mpeg",
                    headers={"Cache-Control": "private, max-age=86400", "X-TTS-Cache": "hit" if cached else "miss"})
