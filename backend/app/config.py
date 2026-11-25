from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ROOT / ".env", ROOT / "backend" / ".env"), extra="ignore")

    # --- database (this app's own DB) ---
    database_url: str = "postgresql+psycopg://tac:tac@localhost:15433/tac"

    referentiel_path: str = str(ROOT / "shared" / "referentiel.json")

    # --- auth ---
    jwt_secret: str = "change-me-in-production-please-32-bytes-min"
    jwt_ttl_hours: int = 8
    cookie_secure: bool = False
    cookie_name: str = "tac_session"

    # bootstrap HR admin (local account, argon2-hashed at startup)
    admin_username: str = "admin.drh"
    admin_password: str = "ChangeMe!2026"
    admin_name: str = "Administrateur DRH"

    # Dev/offline mode: when LDAP is disabled, seeded LDAP users log in with this password.
    # Leave empty to forbid LDAP users from logging in while LDAP is off.
    dev_password: str = "sunu-dev"

    # --- LDAP / Active Directory (mirrors sunu-achats; values from env only) ---
    ldap_enabled: bool = False
    ldap_url: str = "ldap://10.12.12.108:389"
    ldap_use_tls: bool = False  # StartTLS; or use an ldaps:// URL
    ldap_base_dn: str = "OU=SUNU_GROUP,DC=sunu-group,DC=com"
    ldap_bind_dn: str = ""
    ldap_bind_password: str = ""
    ldap_user_filter: str = "(objectClass=user)"
    ldap_sync_cron_hour: int | None = None  # e.g. 2 → nightly sync at 02:00

    @field_validator("ldap_sync_cron_hour", mode="before")
    @classmethod
    def _empty_cron_hour_is_disabled(cls, v):
        # `LDAP_SYNC_CRON_HOUR=` (empty, as in .env.example) means "no nightly sync"
        return None if isinstance(v, str) and not v.strip() else v

    # CORS for the Vite dev servers
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:5174"]

    # Built frontend (vite build output) served by the API itself, with the same routes as deploy/nginx.conf.
    # Used by the native Windows install (no nginx); empty = API only (Docker / dev: nginx or Vite serve the UI).
    web_dir: str = ""

    # minimum group size for collective results
    min_group_size: int = 5

    # --- Claude (Anthropic) AI features: everything AI is off unless a key is set ---
    anthropic_api_key: str = ""
    ai_model: str = "claude-opus-4-8"
    ai_daily_limit: int = 30  # coach + HR assistant messages per user per day

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key.strip())

    # --- natural read-aloud (falls back to the browser voice when no provider key is set) ---
    # Google Cloud Text-to-Speech (preferred when set), else Azure AI Speech.
    google_tts_api_key: str = ""
    azure_speech_key: str = ""
    azure_speech_region: str = "westeurope"
    tts_voice: str = ""  # default voice id; empty = best French voice of the provider
    tts_cache_dir: str = str(ROOT / "backend" / ".tts-cache")

    @property
    def tts_enabled(self) -> bool:
        return bool(self.google_tts_api_key.strip()
                    or (self.azure_speech_key.strip() and self.azure_speech_region.strip()))


settings = Settings()
