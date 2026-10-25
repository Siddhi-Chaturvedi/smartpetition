"""Background scheduler: SLA sweeps and feedback reminders.

Runs as an asyncio task inside the FastAPI process (started in lifespan) —
escalation therefore works even when nobody has a dashboard open. The interval
is configurable (settings.sla_check_interval_seconds).

Timezone handling: all deadlines are UTC calendar hours (not business hours).
This is documented in docs/architecture.md and surfaced in the admin UI.
"""
import asyncio
import logging

from .config import settings
from .database import SessionLocal
from .services.sla import run_sla_sweep

log = logging.getLogger("smartpetition.background")


async def sla_scheduler(stop_event: asyncio.Event) -> None:
    log.info("SLA scheduler started (interval=%ss, timezone=%s, calendar hours)",
             settings.sla_check_interval_seconds, settings.timezone)
    while not stop_event.is_set():
        try:
            db = SessionLocal()
            try:
                stats = run_sla_sweep(db)
                if stats["escalations_created"]:
                    log.warning("SLA sweep: %s", stats)
                else:
                    log.info("SLA sweep: scanned=%s overdue=%s", stats["scanned"], stats["overdue"])
            finally:
                db.close()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the scheduler alive
            log.exception("SLA sweep failed")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=settings.sla_check_interval_seconds)
        except asyncio.TimeoutError:
            pass


async def feedback_reminder_scheduler(stop_event: asyncio.Event) -> None:
    """Daily-ish job: remind citizens to give feedback on resolved grievances."""
    from datetime import timedelta
    from .models import Grievance, GrievanceStatus, Notification, utcnow
    from .services.notifications import notify

    while not stop_event.is_set():
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=3600)
        except asyncio.TimeoutError:
            pass
        if stop_event.is_set():
            break
        try:
            db = SessionLocal()
            try:
                cutoff = utcnow() - timedelta(days=2)
                resolved = db.query(Grievance).filter(
                    Grievance.status == GrievanceStatus.resolved,
                    Grievance.resolved_at.isnot(None),
                    Grievance.resolved_at < cutoff,
                ).all()
                for g in resolved:
                    if g.feedback:
                        continue
                    # only one reminder per grievance
                    already = db.query(Notification).filter(
                        Notification.grievance_id == g.id,
                        Notification.type == "feedback_reminder",
                    ).first()
                    if already:
                        continue
                    notify(db, g.citizen, "How did we do?",
                           f"Your grievance {g.tracking_id} was resolved. "
                           f"Please rate the resolution so we can improve.",
                           "feedback_reminder", g)
                db.commit()
            finally:
                db.close()
        except Exception:  # noqa: BLE001
            log.exception("Feedback reminder job failed")
