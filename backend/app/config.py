"""Application configuration loaded from environment / .env file."""
from functools import lru_cache
import os
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
PROJECT_ROOT = BASE_DIR.parent                     # smartpetition/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SmartPetition"
    environment: str = "development"  # development | staging | production
    debug: bool = True

    # --- Database ---------------------------------------------------------
    # Defaults to a local SQLite file so the app runs with zero setup.
    # Set DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/smartpetition
    # for the production-ready PostgreSQL configuration.
    database_url: str = f"sqlite:///{BASE_DIR / 'smartpetition.db'}"

    # --- Auth ---------------------------------------------------------------
    jwt_secret: str = "change-me-in-production-use-a-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 12

    # --- CORS ----------------------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Files ----------------------------------------------------------------
    upload_dir: Path = BASE_DIR / "storage" / "uploads"
    max_upload_bytes: int = 5 * 1024 * 1024  # 5 MB
    allowed_upload_extensions: str = "jpg,jpeg,png,gif,webp,pdf,doc,docx,txt"

    # --- AI --------------------------------------------------------------------
    ai_model_dir: Path = BASE_DIR / "app" / "ai" / "model"
    ai_confidence_threshold: float = 0.55  # below this -> human triage review
    use_sentence_transformers: bool = False  # optional heavy dependency

    # --- SLA / scheduler -----------------------------------------------------------
    sla_check_interval_seconds: int = 60
    default_resolution_hours: int = 72
    timezone: str = "UTC"  # deadlines are computed in UTC calendar hours

    # --- Email (optional; in-app notifications always work) ---------------------------
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "no-reply@smartpetition.local"
    email_enabled: bool = False

    # --- Optional LLM (graceful no-op when key absent) ----------------------------------
    llm_api_key: str = ""
    llm_api_url: str = ""
    llm_model: str = ""

    # --- Rate limiting ----------------------------------------------------------------------
    rate_limit_auth_per_minute: int = 10
    rate_limit_submit_per_minute: int = 20

    # --- Demo seed (never a public default admin password) ----------------------------------
    seed_demo_data: bool = True

    @model_validator(mode="after")
    def _safe_demo_default(self) -> "Settings":
        # Production never seeds demo accounts/grievances unless the operator
        # explicitly opts in via SEED_DEMO_DATA (documented demo deployments).
        if self.environment == "production" and "SEED_DEMO_DATA" not in os.environ:
            self.seed_demo_data = False
        return self

    # When set to a directory containing a built frontend (index.html),
    # the API service also serves the SPA (single-service deployments such
    # as Render/Docker without a separate web server).
    frontend_dist: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_extensions(self) -> set[str]:
        return {e.strip().lower().lstrip(".") for e in self.allowed_upload_extensions.split(",")}

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
os.environ.setdefault("TZ", settings.timezone)
