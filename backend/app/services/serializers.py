"""Serialize ORM objects to API schemas (joins names, computes derived fields)."""
from datetime import timezone

from sqlalchemy.orm import Session

from ..models import (
    Department, Grievance, User, utcnow,
)
from ..schemas import (
    AssignmentOut, AIPredictionOut, AuditLogOut, CommentOut, DuplicateCandidateOut,
    GrievanceDetail, GrievanceOut, NotificationOut, StatusHistoryOut,
)
from .sla import OPEN_STATUSES


def _tz(dt):
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def user_name(u: User | None) -> str:
    return u.full_name if u else ""


def serialize_grievance(g: Grievance) -> GrievanceOut:
    now = utcnow()
    due = _tz(g.due_at)
    overdue = bool(due and g.status in OPEN_STATUSES and now > due)
    return GrievanceOut(
        id=g.id, tracking_id=g.tracking_id, title=g.title, description=g.description,
        status=g.status.value if hasattr(g.status, "value") else g.status,
        priority=g.priority.value if hasattr(g.priority, "value") else g.priority,
        priority_override_reason=g.priority_override_reason or "",
        location=g.location or "", jurisdiction=g.jurisdiction or "", address=g.address or "",
        latitude=g.latitude, longitude=g.longitude,
        category_id=g.category_id, category_name=g.category.name if g.category else "",
        selected_category_id=g.selected_category_id,
        department_id=g.department_id, department_name=g.department.name if g.department else "",
        assignee_id=g.assignee_id, assignee_name=user_name(g.assignee),
        citizen_id=g.citizen_id, citizen_name=user_name(g.citizen),
        ai_analysis_status=g.ai_analysis_status.value if hasattr(g.ai_analysis_status, "value") else str(g.ai_analysis_status),
        needs_triage=g.needs_triage, is_demo_data=g.is_demo_data,
        submitted_at=_tz(g.submitted_at), assigned_at=_tz(g.assigned_at), due_at=due,
        resolved_at=_tz(g.resolved_at), closed_at=_tz(g.closed_at),
        resolution_summary=g.resolution_summary or "", rejection_reason=g.rejection_reason or "",
        reopen_count=g.reopen_count or 0,
        attachments=[{"id": a.id, "original_filename": a.original_filename,
                      "content_type": a.content_type, "size_bytes": a.size_bytes,
                      "created_at": _tz(a.created_at)} for a in g.attachments],
        is_overdue=overdue,
    )


def serialize_grievance_detail(db: Session, g: Grievance, viewer: User) -> GrievanceDetail:
    base = serialize_grievance(g)
    data = base.model_dump()

    staff = viewer.role.value in ("officer", "admin")
    data["comments"] = [
        CommentOut(id=c.id, author_id=c.author_id, author_name=user_name(c.author),
                   author_role=c.author.role.value if c.author else "", body=c.body,
                   is_internal=c.is_internal, created_at=_tz(c.created_at)).model_dump()
        for c in sorted(g.comments, key=lambda c: c.created_at or utcnow())
        if staff or not c.is_internal
    ]
    data["history"] = [
        StatusHistoryOut(id=h.id, from_status=h.from_status, to_status=h.to_status,
                         actor_id=h.actor_id, actor_name=user_name(h.actor), note=h.note or "",
                         created_at=_tz(h.created_at)).model_dump()
        for h in sorted(g.history, key=lambda h: h.created_at or utcnow())
    ]
    data["assignments"] = [
        AssignmentOut(id=a.id, department_id=a.department_id,
                      department_name=(db.get(Department, a.department_id).name if a.department_id else ""),
                      officer_id=a.officer_id,
                      officer_name=user_name(db.get(User, a.officer_id) if a.officer_id else None),
                      reason=a.reason or "", is_active=a.is_active,
                      created_at=_tz(a.created_at)).model_dump()
        for a in sorted(g.assignments, key=lambda a: a.created_at or utcnow())
    ]
    # AI predictions visible to staff and to the owner (transparency), never raw internals
    if staff or viewer.id == g.citizen_id:
        data["ai_predictions"] = [
            AIPredictionOut(id=p.id, model_version=p.model_version, method=p.method,
                            predicted_category=p.predicted_category, confidence=p.confidence,
                            top_categories_json=p.top_categories_json, urgency_score=p.urgency_score,
                            urgency_level=p.urgency_level, urgency_factors_json=p.urgency_factors_json,
                            recommended_department=p.recommended_department,
                            created_at=_tz(p.created_at)).model_dump()
            for p in sorted(g.ai_predictions, key=lambda p: p.created_at or utcnow())
        ]
    else:
        data["ai_predictions"] = []
    data["duplicate_candidates"] = [
        DuplicateCandidateOut(
            id=d.id, candidate_grievance_id=d.candidate_grievance_id,
            candidate_tracking_id=d.candidate.tracking_id if d.candidate else "",
            candidate_title=d.candidate.title[:120] if d.candidate else "",
            candidate_status=d.candidate.status.value if d.candidate and hasattr(d.candidate.status, "value") else "",
            candidate_location=(d.candidate.location if d.candidate else "") or "",
            candidate_submitted_at=_tz(d.candidate.submitted_at) if d.candidate else None,
            score=d.score, method=d.method, matched_terms=d.matched_terms or "",
            review_status=d.review_status.value if hasattr(d.review_status, "value") else str(d.review_status),
        ).model_dump()
        for d in g.duplicate_candidates
    ]
    if g.feedback:
        data["feedback"] = {"id": g.feedback.id, "rating": g.feedback.rating,
                            "comments": g.feedback.comments, "created_at": _tz(g.feedback.created_at)}
    else:
        data["feedback"] = None
    return GrievanceDetail(**data)


def serialize_notification(n) -> NotificationOut:  # noqa: ANN001
    gid = None
    if n.grievance_id:
        gid = n.grievance_id
    return NotificationOut(
        id=n.id, type=n.type, title=n.title, body=n.body, grievance_id=gid,
        grievance_tracking_id="", is_read=n.is_read, created_at=_tz(n.created_at),
    )


def serialize_audit(a) -> AuditLogOut:  # noqa: ANN001
    return AuditLogOut(
        id=a.id, actor_id=a.actor_id, actor_name=a.actor_name if hasattr(a, "actor_name") else "",
        action=a.action, entity_type=a.entity_type, entity_id=a.entity_id,
        detail=a.detail or "", ip_address=a.ip_address or "", created_at=_tz(a.created_at),
    )
