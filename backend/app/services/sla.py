"""SLA monitoring & escalation engine.

Runs as a background asyncio task (see app/background.py) — it does NOT depend
on any dashboard being open. A manual trigger endpoint exists for tests/admins.

Deadlines use UTC calendar hours (documented in docs/architecture.md).
"""
from datetime import timedelta

from sqlalchemy.orm import Session

from ..models import (
    EscalationEvent, Grievance, GrievanceStatus, Role, User, utcnow,
)
from .audit import record_audit
from .notifications import notify
from .routing import resolve_sla_hours

OPEN_STATUSES = [
    GrievanceStatus.submitted, GrievanceStatus.under_review,
    GrievanceStatus.in_progress, GrievanceStatus.escalated, GrievanceStatus.reopened,
]


def is_overdue(g: Grievance) -> bool:
    return bool(g.due_at and g.status in OPEN_STATUSES and utcnow() > g.due_at)


def run_sla_sweep(db: Session) -> dict:
    """Scan open grievances; escalate overdue ones. Idempotent per (grievance, level)."""
    now = utcnow()
    stats = {"scanned": 0, "overdue": 0, "escalations_created": 0, "notifications": 0}
    open_g = db.query(Grievance).filter(Grievance.status.in_(OPEN_STATUSES)).all()
    stats["scanned"] = len(open_g)

    for g in open_g:
        if not g.due_at:
            # ensure a due date exists (e.g. created before routing)
            hours, esc = resolve_sla_hours(db, g)
            g.due_at = (g.assigned_at or g.submitted_at or now) + timedelta(hours=hours)
        if now <= g.due_at:
            continue
        stats["overdue"] += 1

        _, escalation_hours = resolve_sla_hours(db, g)
        hours_overdue = (now - g.due_at).total_seconds() / 3600.0

        # Level 1: overdue. Level 2: overdue by escalation_hours/2 more. Level 3: severe.
        level = 1
        if hours_overdue >= escalation_hours:
            level = 3
        elif hours_overdue >= escalation_hours / 2:
            level = 2

        existing = (
            db.query(EscalationEvent)
            .filter(EscalationEvent.grievance_id == g.id, EscalationEvent.level >= level)
            .first()
        )
        if existing:
            continue  # avoid duplicate notifications for the same level

        # escalate status if not already escalated (and currently open & assigned)
        if g.status not in (GrievanceStatus.escalated,):
            g.status = GrievanceStatus.escalated
            from ..models import StatusHistory
            db.add(StatusHistory(grievance_id=g.id, from_status=GrievanceStatus.in_progress.value,
                                 to_status=GrievanceStatus.escalated.value, actor_id=None,
                                 note=f"Automatic SLA escalation (level {level}, {hours_overdue:.1f}h overdue)"))

        event = EscalationEvent(grievance_id=g.id, level=level,
                                reason=f"sla_breach_level_{level}", notified_count=0)
        db.add(event)
        stats["escalations_created"] += 1

        # notify assignee, department officers, and admins (level >= 2)
        notified = 0
        if g.assignee_id:
            assignee = db.get(User, g.assignee_id)
            if assignee:
                notify(db, assignee, f"OVERDUE (level {level}): {g.tracking_id}",
                       f"'{g.title[:80]}' is {hours_overdue:.0f}h past its SLA deadline. "
                       f"Please update or resolve it immediately.", "escalation", g)
                notified += 1
        if level >= 2:
            notified += _notify_admins(db, g, hours_overdue, level)
        event.notified_count = notified
        stats["notifications"] += notified
        record_audit(db, None, "sla.escalation", "grievance", g.id,
                     {"level": level, "hours_overdue": round(hours_overdue, 2)})

    db.commit()
    return stats


def _notify_admins(db: Session, g: Grievance, hours_overdue: float, level: int) -> int:
    admins = db.query(User).filter(User.role == Role.admin, User.is_active.is_(True)).all()
    for a in admins:
        notify(db, a, f"Escalation level {level}: {g.tracking_id}",
               f"'{g.title[:80]}' ({g.department.name if g.department else 'unassigned'}) is "
               f"{hours_overdue:.0f}h overdue. Review the case.", "escalation", g)
    return len(admins)


def upcoming_deadlines(db: Session, hours: int = 48, department_id: int | None = None) -> list[Grievance]:
    q = db.query(Grievance).filter(
        Grievance.status.in_(OPEN_STATUSES),
        Grievance.due_at.isnot(None),
        Grievance.due_at <= utcnow() + timedelta(hours=hours),
        Grievance.due_at > utcnow(),
    )
    if department_id:
        q = q.filter(Grievance.department_id == department_id)
    return q.order_by(Grievance.due_at).all()
