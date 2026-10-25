"""Analytics endpoints — role-scoped (admin: system-wide, officer: department)."""
from datetime import datetime

from fastapi import APIRouter, Query

from ..deps import CurrentUser, DbDep, RequireOfficerOrAdmin
from ..models import Role
from ..services import analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _scope(user, department_id: int | None) -> dict:
    """Officers are always constrained to their own department (backend-enforced)."""
    filters: dict = {}
    if department_id:
        filters["department_id"] = department_id
    if user.role == Role.officer:
        filters["department_id"] = user.department_id
    return filters


@router.get("/summary")
def summary(user: RequireOfficerOrAdmin, db: DbDep,
            department_id: int | None = None, category_id: int | None = None,
            priority: str | None = None, status: str | None = None,
            date_from: datetime | None = None, date_to: datetime | None = None):
    filters = _scope(user, department_id)
    filters.update({k: v for k, v in {"category_id": category_id, "priority": priority,
                                      "status": status, "date_from": date_from,
                                      "date_to": date_to}.items() if v is not None})
    return analytics.summary(db, **filters)


@router.get("/categories")
def categories(user: RequireOfficerOrAdmin, db: DbDep, department_id: int | None = None,
               date_from: datetime | None = None, date_to: datetime | None = None):
    filters = _scope(user, department_id)
    filters.update({k: v for k, v in {"date_from": date_from, "date_to": date_to}.items() if v})
    return analytics.category_distribution(db, **filters)


@router.get("/departments")
def departments(user: RequireOfficerOrAdmin, db: DbDep,
                date_from: datetime | None = None, date_to: datetime | None = None):
    filters = _scope(user, None)
    filters.update({k: v for k, v in {"date_from": date_from, "date_to": date_to}.items() if v})
    return analytics.department_workload(db, **filters)


@router.get("/trends")
def trends(user: RequireOfficerOrAdmin, db: DbDep, months: int = Query(12, ge=1, le=36),
           department_id: int | None = None):
    filters = _scope(user, department_id)
    return analytics.monthly_trend(db, months=months, **filters)


@router.get("/priorities")
def priorities(user: RequireOfficerOrAdmin, db: DbDep, department_id: int | None = None):
    filters = _scope(user, department_id)
    return analytics.priority_distribution(db, **filters)


@router.get("/my-stats")
def my_stats(user: CurrentUser, db: DbDep):
    """Citizen dashboard stats (own data only)."""
    from ..models import Grievance
    q = db.query(Grievance).filter(Grievance.citizen_id == user.id)
    by_status = {}
    for g in q.all():
        by_status[g.status.value] = by_status.get(g.status.value, 0) + 1
    total = q.count()
    return {
        "total": total,
        "pending": by_status.get("submitted", 0) + by_status.get("under_review", 0) + by_status.get("reopened", 0),
        "in_progress": by_status.get("in_progress", 0) + by_status.get("escalated", 0),
        "resolved": by_status.get("resolved", 0),
        "closed": by_status.get("closed", 0),
        "rejected": by_status.get("rejected", 0),
        "by_status": by_status,
    }
