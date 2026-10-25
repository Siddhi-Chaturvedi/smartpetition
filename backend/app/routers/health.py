"""Health check endpoints (used by Docker, CI, and the startup script)."""
from datetime import datetime, timezone

from fastapi import APIRouter
from sqlalchemy import text

from ..config import settings
from ..deps import DbDep
from ..schemas import HealthResponse
from ..services.ai_classifier import classifier

router = APIRouter(tags=["health"])

VERSION = "1.0.0"


@router.get("/health", response_model=HealthResponse)
def health(db: DbDep):
    try:
        db.execute(text("SELECT 1"))
        db_status = "ok"
    except Exception:  # noqa: BLE001
        db_status = "error"
    return HealthResponse(
        status="ok" if db_status == "ok" else "degraded",
        version=VERSION,
        database=db_status,
        ai_model=f"{classifier.version} ({'trained' if classifier.available else 'fallback-rules'})",
        time=datetime.now(timezone.utc),
        demo_accounts=settings.seed_demo_data,
    )


@router.get("/health/ready")
def ready(db: DbDep):
    db.execute(text("SELECT 1"))
    return {"ready": True}
