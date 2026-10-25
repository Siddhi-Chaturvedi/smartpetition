"""Analytics service — every number here comes from real database queries."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ..models import (
    Category, Department, Feedback, Grievance, GrievanceStatus,
    Priority, utcnow,
)

OPEN = [GrievanceStatus.submitted, GrievanceStatus.under_review,
        GrievanceStatus.in_progress, GrievanceStatus.escalated, GrievanceStatus.reopened]


def _apply_filters(q, department_id=None, category_id=None, priority=None,
                   status=None, date_from=None, date_to=None):
    if department_id:
        q = q.filter(Grievance.department_id == department_id)
    if category_id:
        q = q.filter(Grievance.category_id == category_id)
    if priority:
        q = q.filter(Grievance.priority == priority)
    if status:
        q = q.filter(Grievance.status == status)
    if date_from:
        q = q.filter(Grievance.submitted_at >= date_from)
    if date_to:
        q = q.filter(Grievance.submitted_at <= date_to)
    return q


def summary(db: Session, **filters) -> dict:
    q = _apply_filters(db.query(Grievance), **filters)
    now = utcnow()
    total = q.count()
    by_status = dict(q.with_entities(Grievance.status, func.count()).group_by(Grievance.status).all())
    by_status = {s.value if hasattr(s, "value") else s: c for s, c in by_status.items()}

    pending = by_status.get("submitted", 0) + by_status.get("under_review", 0) + by_status.get("reopened", 0)
    in_progress = by_status.get("in_progress", 0) + by_status.get("escalated", 0)
    resolved = by_status.get("resolved", 0)
    closed = by_status.get("closed", 0)
    rejected = by_status.get("rejected", 0)
    critical = q.filter(Grievance.priority == Priority.critical, Grievance.status.in_(OPEN)).count()
    overdue = q.filter(Grievance.status.in_(OPEN), Grievance.due_at.isnot(None),
                       Grievance.due_at < now).count()
    reopened_total = q.filter(Grievance.reopen_count > 0).count()
    needs_triage = q.filter(Grievance.needs_triage.is_(True)).count()

    # resolution times (hours) for resolved/closed cases
    res_times = [
        (g.resolved_at - (g.submitted_at or g.created_at)).total_seconds() / 3600.0
        for g in q.filter(Grievance.resolved_at.isnot(None)).all()
        if g.submitted_at or g.created_at
    ]
    avg_res = round(sum(res_times) / len(res_times), 2) if res_times else None
    med_res = None
    if res_times:
        s = sorted(res_times)
        n = len(s)
        med_res = round(s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2, 2)

    # SLA compliance: resolved within due_at (or, if unresolved, still within deadline)
    judged = q.filter(Grievance.due_at.isnot(None)).all()
    compliant = 0
    for g in judged:
        if g.resolved_at:
            ref = g.resolved_at
        elif g.status in OPEN:
            ref = now
        else:
            ref = g.closed_at or now
        if g.due_at.tzinfo is None:
            g.due_at = g.due_at.replace(tzinfo=timezone.utc)
        if ref.tzinfo is None:
            ref = ref.replace(tzinfo=timezone.utc)
        if ref <= g.due_at:
            compliant += 1
    sla_pct = round(100.0 * compliant / len(judged), 1) if judged else None

    fb_count = db.query(func.count(Feedback.id)).scalar() or 0
    fb_avg = db.query(func.avg(Feedback.rating)).scalar()
    if filters.get("department_id"):
        gids = [g.id for g in q.all()]
        fb_q = db.query(Feedback).filter(Feedback.grievance_id.in_(gids or [-1]))
        fb_count = fb_q.count()
        fb_avg = db.query(func.avg(Feedback.rating)).filter(Feedback.grievance_id.in_(gids or [-1])).scalar()

    return {
        "total": total,
        "pending": pending,
        "in_progress": in_progress,
        "resolved": resolved,
        "closed": closed,
        "rejected": rejected,
        "critical_open": critical,
        "overdue": overdue,
        "reopened": reopened_total,
        "needs_triage": needs_triage,
        "avg_resolution_hours": avg_res,
        "median_resolution_hours": med_res,
        "sla_compliance_pct": sla_pct,
        "feedback_count": fb_count,
        "feedback_avg_rating": round(float(fb_avg), 2) if fb_avg else None,
        "by_status": by_status,
    }


def category_distribution(db: Session, **filters) -> list[dict]:
    q = _apply_filters(db.query(Grievance), **filters)
    rows = (
        q.join(Category, Grievance.category_id == Category.id, isouter=True)
        .with_entities(func.coalesce(Category.name, "uncategorized"), func.count())
        .group_by(func.coalesce(Category.name, "uncategorized"))
        .all()
    )
    return [{"name": n, "count": c} for n, c in rows]


def department_workload(db: Session, **filters) -> list[dict]:
    q = _apply_filters(db.query(Grievance), **filters)
    rows = (
        q.join(Department, Grievance.department_id == Department.id, isouter=True)
        .with_entities(
            func.coalesce(Department.name, "Unassigned / Triage"),
            func.count(),
            func.sum(case((Grievance.status.in_(OPEN), 1), else_=0)),
            func.sum(case((Grievance.due_at < utcnow(), 1), else_=0)),
        )
        .group_by(func.coalesce(Department.name, "Unassigned / Triage"))
        .all()
    )
    return [{"name": n, "total": t, "open": o or 0, "overdue": od or 0} for n, t, o, od in rows]


def monthly_trend(db: Session, months: int = 12, **filters) -> list[dict]:
    q = _apply_filters(db.query(Grievance), **filters)
    now = utcnow()
    out = []
    for i in range(months - 1, -1, -1):
        start = (now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                 - timedelta(days=1) * 0)
        # compute month start manually
        y, m = now.year, now.month - i
        while m <= 0:
            m += 12
            y -= 1
        start = datetime(y, m, 1, tzinfo=timezone.utc)
        end_m = m + 1
        end_y = y
        if end_m > 12:
            end_m = 1
            end_y += 1
        end = datetime(end_y, end_m, 1, tzinfo=timezone.utc)
        count = q.filter(Grievance.submitted_at >= start, Grievance.submitted_at < end).count()
        resolved = q.filter(Grievance.resolved_at >= start, Grievance.resolved_at < end).count()
        out.append({"month": f"{y}-{m:02d}", "submitted": count, "resolved": resolved})
    return out


def priority_distribution(db: Session, **filters) -> list[dict]:
    q = _apply_filters(db.query(Grievance), **filters)
    rows = q.with_entities(Grievance.priority, func.count()).group_by(Grievance.priority).all()
    return [{"name": p.value if hasattr(p, "value") else p, "count": c} for p, c in rows]
