"""Vercel serverless entrypoint for SmartPetition."""
from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT / "backend"))

from app.config import settings  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402

log = logging.getLogger("smartpetition.vercel")

_booted = False


def _bootstrap() -> None:
    global _booted
    if _booted:
        return
    log.info("Vercel cold start: bootstrapping (env=%s, db=%s)",
             settings.environment, "sqlite" if settings.is_sqlite else "postgresql")
    init_db()
    if settings.seed_demo_data:
        from app.seed import seed
        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()
    from app.services.ai_classifier import classifier
    classifier.load()
    log.info("AI model: %s (%s)", classifier.version,
             "trained model" if classifier.available else "rule-based FALLBACK")
    _booted = True


_bootstrap()

_last_sweep = 0.0


@app.middleware("http")
async def _lazy_sla_sweep(request, call_next):
    global _last_sweep
    now = time.time()
    if now - _last_sweep >= settings.sla_check_interval_seconds:
        _last_sweep = now
        try:
            from app.services.sla import run_sla_sweep
            db = SessionLocal()
            try:
                run_sla_sweep(db)
            finally:
                db.close()
        except Exception:
            log.exception("lazy SLA sweep failed")
    return await call_next(request)
