"""Grievance endpoints: submission, tracking, workflow, attachments, duplicates."""
import csv
import io
import re
import secrets
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..deps import CurrentUser, DbDep, RequireOfficerOrAdmin, get_client_ip
from ..models import (
    AIAnalysisStatus, Category, DuplicateCandidate, DupReviewStatus, Feedback,
    Grievance, GrievanceStatus, Priority, Role, User, utcnow,
)
from ..schemas import (
    AssignRequest, CategoryCorrectionRequest, CommentCreate, DuplicatePreviewItem,
    DuplicatePreviewRequest, FeedbackCreate, GrievanceCreate, GrievanceDetail,
    GrievanceListResponse, PriorityOverrideRequest, StatusTransitionRequest,
)
from ..services.audit import record_audit
from ..services.serializers import serialize_grievance, serialize_grievance_detail
from ..services.workflow import create_grievance, preview_duplicates, transition_grievance

router = APIRouter(prefix="/grievances", tags=["grievances"])

DANGEROUS_EXT = {"exe", "bat", "cmd", "com", "msi", "scr", "ps1", "vbs", "js", "jar",
                 "sh", "dll", "app", "apk", "php", "py", "rb", "pl", "cgi", "wsf", "hta"}


# --------------------------------------------------------------------- permissions
def can_view(user: User, g: Grievance) -> bool:
    if user.role == Role.admin:
        return True
    if user.role == Role.citizen:
        return g.citizen_id == user.id
    # officer: own department, own assignments, or triage items in their dept
    return g.department_id is not None and g.department_id == user.department_id \
        or g.assignee_id == user.id


def can_act(user: User, g: Grievance) -> bool:
    if user.role == Role.admin:
        return True
    if user.role == Role.officer:
        return g.assignee_id == user.id or (
            g.department_id is not None and g.department_id == user.department_id
        )
    return False


def get_grievance_or_404(db: Session, gid: int, user: User) -> Grievance:
    g = db.get(Grievance, gid)
    if g is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
    if not can_view(user, g):
        # do not leak existence of other citizens' grievances
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
    return g


# --------------------------------------------------------------------- creation
@router.post("", response_model=GrievanceDetail, status_code=status.HTTP_201_CREATED)
def submit_grievance(payload: GrievanceCreate, user: CurrentUser, db: DbDep, request: Request):
    if user.role != Role.citizen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only citizens can submit grievances")
    g = create_grievance(db, user, payload, ip=get_client_ip(request))
    return serialize_grievance_detail(db, g, user)


@router.post("/preview-duplicates", response_model=list[DuplicatePreviewItem])
def preview_dups(payload: DuplicatePreviewRequest, user: CurrentUser, db: DbDep):
    """Check for similar grievances BEFORE final submission (citizen/officer/admin)."""
    items = preview_duplicates(db, payload.title, payload.description,
                               payload.category, payload.location)
    return [DuplicatePreviewItem(**i) for i in items]


# --------------------------------------------------------------------- listing
@router.get("", response_model=GrievanceListResponse)
def list_grievances(
    user: CurrentUser, db: DbDep,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = None, category_id: int | None = None,
    department_id: int | None = None, search: str | None = None,
    overdue: bool | None = None, needs_triage: bool | None = None,
    date_from: datetime | None = None, date_to: datetime | None = None,
    sort: str = Query("newest", pattern="^(newest|oldest|due|priority)$"),
):
    q = db.query(Grievance)

    # role scoping (backend enforcement, not just UI)
    if user.role == Role.citizen:
        q = q.filter(Grievance.citizen_id == user.id)
    elif user.role == Role.officer:
        q = q.filter(
            (Grievance.department_id == user.department_id) | (Grievance.assignee_id == user.id)
        )

    if status_filter:
        try:
            q = q.filter(Grievance.status == GrievanceStatus(status_filter))
        except ValueError:
            raise HTTPException(422, f"Invalid status '{status_filter}'")
    if priority:
        try:
            q = q.filter(Grievance.priority == Priority(priority))
        except ValueError:
            raise HTTPException(422, f"Invalid priority '{priority}'")
    if category_id:
        q = q.filter(Grievance.category_id == category_id)
    if department_id and user.role == Role.admin:
        q = q.filter(Grievance.department_id == department_id)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            Grievance.title.ilike(like) | Grievance.description.ilike(like)
            | Grievance.tracking_id.ilike(like) | Grievance.location.ilike(like)
        )
    now = utcnow()
    if overdue is True:
        q = q.filter(Grievance.due_at.isnot(None), Grievance.due_at < now,
                     Grievance.status.in_([s for s in GrievanceStatus
                                           if s.value in ("submitted", "under_review", "in_progress",
                                                          "escalated", "reopened")]))
    elif overdue is False:
        q = q.filter((Grievance.due_at.is_(None)) | (Grievance.due_at >= now))
    if needs_triage is not None:
        q = q.filter(Grievance.needs_triage.is_(needs_triage))
    if date_from:
        q = q.filter(Grievance.submitted_at >= date_from)
    if date_to:
        q = q.filter(Grievance.submitted_at <= date_to)

    total = q.count()
    order = {
        "newest": Grievance.submitted_at.desc(),
        "oldest": Grievance.submitted_at.asc(),
        "due": Grievance.due_at.asc().nullslast(),
        "priority": Grievance.priority.asc(),
    }[sort]
    items = q.order_by(Grievance.id.desc() if sort == "newest" else order)\
             .offset((page - 1) * page_size).limit(page_size).all()
    return GrievanceListResponse(
        items=[serialize_grievance(g) for g in items],
        total=total, page=page, page_size=page_size,
    )


@router.get("/export/csv")
def export_csv(user: RequireOfficerOrAdmin, db: DbDep,
               department_id: int | None = None, status_filter: str | None = Query(None, alias="status"),
               date_from: datetime | None = None, date_to: datetime | None = None):
    q = db.query(Grievance)
    if user.role == Role.officer:
        q = q.filter(Grievance.department_id == user.department_id)
    elif department_id:
        q = q.filter(Grievance.department_id == department_id)
    if status_filter:
        q = q.filter(Grievance.status == status_filter)
    if date_from:
        q = q.filter(Grievance.submitted_at >= date_from)
    if date_to:
        q = q.filter(Grievance.submitted_at <= date_to)
    rows = q.order_by(Grievance.submitted_at.desc()).limit(10000).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["tracking_id", "title", "status", "priority", "category", "department",
                "location", "jurisdiction", "submitted_at", "due_at", "resolved_at",
                "is_overdue", "citizen_email"])
    now = utcnow()
    for g in rows:
        overdue = bool(g.due_at and g.status.value in
                       ("submitted", "under_review", "in_progress", "escalated", "reopened")
                       and g.due_at < now)
        w.writerow([g.tracking_id, g.title, g.status.value, g.priority.value,
                    g.category.name if g.category else "", g.department.name if g.department else "",
                    g.location, g.jurisdiction, g.submitted_at.isoformat() if g.submitted_at else "",
                    g.due_at.isoformat() if g.due_at else "",
                    g.resolved_at.isoformat() if g.resolved_at else "", overdue,
                    g.citizen.email if g.citizen else ""])
    record_audit(db, user, "grievance.export_csv", "grievance", None, {"rows": len(rows)})
    db.commit()
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=grievances-{utcnow():%Y%m%d}.csv"},
    )


# --------------------------------------------------------------------- detail
@router.get("/{grievance_id}", response_model=GrievanceDetail)
def get_grievance(grievance_id: int, user: CurrentUser, db: DbDep):
    g = get_grievance_or_404(db, grievance_id, user)
    return serialize_grievance_detail(db, g, user)


@router.get("/by-tracking/{tracking_id}", response_model=GrievanceDetail)
def get_by_tracking(tracking_id: str, user: CurrentUser, db: DbDep):
    g = db.query(Grievance).filter(Grievance.tracking_id == tracking_id.strip().upper()).first()
    if g is None or not can_view(user, g):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
    return serialize_grievance_detail(db, g, user)


# --------------------------------------------------------------------- workflow
@router.post("/{grievance_id}/transition", response_model=GrievanceDetail)
def transition(grievance_id: int, payload: StatusTransitionRequest,
               user: CurrentUser, db: DbDep, request: Request):
    g = get_grievance_or_404(db, grievance_id, user)
    try:
        to_status = GrievanceStatus(payload.to_status)
    except ValueError:
        raise HTTPException(422, "Invalid target status")
    err = transition_grievance(db, g, user, to_status, note=payload.note,
                               resolution_summary=payload.resolution_summary,
                               rejection_reason=payload.rejection_reason,
                               ip=get_client_ip(request))
    if err:
        raise HTTPException(status.HTTP_409_CONFLICT, err)
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)


@router.get("/{grievance_id}/allowed-transitions")
def allowed(grievance_id: int, user: CurrentUser, db: DbDep):
    from ..services.state_machine import allowed_transitions
    g = get_grievance_or_404(db, grievance_id, user)
    return {"current": g.status.value,
            "allowed": [s.value for s in allowed_transitions(g.status, user.role)]}


@router.post("/{grievance_id}/priority-override", response_model=GrievanceDetail)
def override_priority(grievance_id: int, payload: PriorityOverrideRequest,
                      user: RequireOfficerOrAdmin, db: DbDep, request: Request):
    g = get_grievance_or_404(db, grievance_id, user)
    if not can_act(user, g):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not authorized on this grievance")
    old = g.priority.value
    g.priority = Priority(payload.priority)
    g.priority_override_reason = payload.reason.strip()
    record_audit(db, user, "grievance.priority_override", "grievance", g.id,
                 {"from": old, "to": payload.priority, "reason": payload.reason},
                 ip=get_client_ip(request))
    db.commit()
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)


@router.post("/{grievance_id}/assign", response_model=GrievanceDetail)
def assign(grievance_id: int, payload: AssignRequest,
           user: RequireOfficerOrAdmin, db: DbDep, request: Request):
    g = get_grievance_or_404(db, grievance_id, user)
    if user.role == Role.officer and g.department_id != user.department_id and not g.needs_triage:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Officers can only assign within their department")
    from ..services.routing import assign_manually
    try:
        assign_manually(db, g, user, payload.department_id, payload.officer_id, payload.reason)
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)


@router.post("/{grievance_id}/category-correction", response_model=GrievanceDetail)
def correct_category(grievance_id: int, payload: CategoryCorrectionRequest,
                     user: RequireOfficerOrAdmin, db: DbDep, request: Request):
    """Human correction of the AI-predicted category (AI record stays intact)."""
    g = get_grievance_or_404(db, grievance_id, user)
    cat = db.get(Category, payload.category_id)
    if cat is None:
        raise HTTPException(404, "Category not found")
    old = g.category.name if g.category else None
    g.category_id = cat.id
    g.needs_triage = False
    if g.ai_analysis_status == AIAnalysisStatus.needs_review:
        g.ai_analysis_status = AIAnalysisStatus.completed
    record_audit(db, user, "ai.category_override", "grievance", g.id,
                 {"from": old, "to": cat.name, "reason": payload.reason}, ip=get_client_ip(request))
    db.commit()
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)


# --------------------------------------------------------------------- comments
@router.post("/{grievance_id}/comments", response_model=GrievanceDetail,
             status_code=status.HTTP_201_CREATED)
def add_comment(grievance_id: int, payload: CommentCreate,
                user: CurrentUser, db: DbDep, request: Request):
    from ..models import Comment
    g = get_grievance_or_404(db, grievance_id, user)

    if user.role == Role.citizen:
        if g.citizen_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Grievance not found")
        if g.status in (GrievanceStatus.closed, GrievanceStatus.rejected):
            raise HTTPException(409, "Cannot add information to a closed/rejected grievance; reopen it first")
        payload.is_internal = False  # citizens can never post internal notes
    else:
        if not can_act(user, g):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not authorized on this grievance")

    c = Comment(grievance_id=g.id, author_id=user.id, body=payload.body.strip(),
                is_internal=payload.is_internal)
    db.add(c)

    if payload.is_internal:
        record_audit(db, user, "comment.internal_added", "grievance", g.id, {}, ip=get_client_ip(request))
    else:
        # citizen-visible update -> notify the other party
        from ..services.notifications import notify
        if user.role == Role.citizen:
            title = f"Citizen update on {g.tracking_id}"
            if g.department_id:
                from ..models import Role as R
                for o in db.query(User).filter(User.role == R.officer,
                                               User.department_id == g.department_id,
                                               User.is_active.is_(True)).all():
                    notify(db, o, title, f"{user.full_name}: {payload.body[:200]}", "comment", g)
        else:
            notify(db, g.citizen, f"Update on your grievance {g.tracking_id}",
                   payload.body[:400], "comment", g)
        record_audit(db, user, "comment.added", "grievance", g.id, {}, ip=get_client_ip(request))
    db.commit()
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)


# --------------------------------------------------------------------- attachments
def _validate_upload(filename: str, size: int, content: bytes) -> str | None:
    name = (filename or "").lower()
    if not name or ".." in name or "/" in name or "\\" in name:
        return "Invalid filename"
    parts = [p for p in re.split(r"[.]", name) if p]
    if len(parts) < 2:
        return "File must have an extension"
    for part in parts[1:]:
        if part in DANGEROUS_EXT:
            return f"Executable/script files (.{part}) are not allowed"
    ext = parts[-1]
    if ext not in settings.allowed_extensions:
        return f"File type '.{ext}' is not allowed (permitted: {', '.join(sorted(settings.allowed_extensions))})"
    if size > settings.max_upload_bytes:
        return f"File too large (max {settings.max_upload_bytes // (1024*1024)} MB)"
    # magic-byte sniffing for common types
    if ext in ("jpg", "jpeg") and not content.startswith(b"\xff\xd8\xff"):
        return "File content does not match a JPEG image"
    if ext == "png" and not content.startswith(b"\x89PNG"):
        return "File content does not match a PNG image"
    if ext == "gif" and not content.startswith((b"GIF87a", b"GIF89a")):
        return "File content does not match a GIF image"
    if ext == "pdf" and not content.startswith(b"%PDF"):
        return "File content does not match a PDF document"
    return None


@router.post("/{grievance_id}/attachments", status_code=status.HTTP_201_CREATED)
async def upload_attachment(grievance_id: int, file: UploadFile,
                            user: CurrentUser, db: DbDep, request: Request):
    from ..models import Attachment
    g = get_grievance_or_404(db, grievance_id, user)
    if user.role == Role.citizen and g.citizen_id != user.id:
        raise HTTPException(404, "Grievance not found")
    if user.role != Role.citizen and not can_act(user, g):
        raise HTTPException(403, "Not authorized on this grievance")

    content = await file.read()
    err = _validate_upload(file.filename or "", len(content), content)
    if err:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, err)

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix.lower()
    stored = f"{secrets.token_hex(16)}{ext}"
    (settings.upload_dir / stored).write_bytes(content)

    att = Attachment(grievance_id=g.id, uploader_id=user.id,
                     original_filename=Path(file.filename).name[:255],
                     stored_name=stored, content_type=(file.content_type or "application/octet-stream")[:120],
                     size_bytes=len(content))
    db.add(att)
    record_audit(db, user, "attachment.uploaded", "grievance", g.id,
                 {"filename": att.original_filename, "size": len(content)}, ip=get_client_ip(request))
    db.commit()
    db.refresh(att)
    return {"id": att.id, "original_filename": att.original_filename,
            "content_type": att.content_type, "size_bytes": att.size_bytes}


@router.get("/{grievance_id}/attachments/{attachment_id}")
def download_attachment(grievance_id: int, attachment_id: int, user: CurrentUser, db: DbDep):
    """Private, authenticated download — attachment URLs are never public."""
    from ..models import Attachment
    g = get_grievance_or_404(db, grievance_id, user)
    att = db.get(Attachment, attachment_id)
    if att is None or att.grievance_id != g.id:
        raise HTTPException(404, "Attachment not found")
    path = settings.upload_dir / att.stored_name
    if not path.exists():
        raise HTTPException(404, "Attachment file is missing from storage")
    return StreamingResponse(
        iter([path.read_bytes()]), media_type=att.content_type,
        headers={"Content-Disposition": f'attachment; filename="{att.original_filename}"',
                 "X-Content-Type-Options": "nosniff",
                 "Content-Security-Policy": "default-src 'none'"},
    )


# --------------------------------------------------------------------- duplicates review
@router.post("/duplicates/{candidate_id}/review", response_model=GrievanceDetail)
def review_duplicate(candidate_id: int, user: RequireOfficerOrAdmin, db: DbDep,
                     request: Request, decision: str = Query(pattern="^(confirmed_duplicate|dismissed)$")):
    dup = db.get(DuplicateCandidate, candidate_id)
    if dup is None:
        raise HTTPException(404, "Duplicate candidate not found")
    g = get_grievance_or_404(db, dup.grievance_id, user)
    if not can_act(user, g):
        raise HTTPException(403, "Not authorized on this grievance")
    dup.review_status = DupReviewStatus(decision)
    dup.reviewed_by = user.id
    dup.reviewed_at = utcnow()
    record_audit(db, user, f"duplicate.{decision}", "grievance", g.id,
                 {"candidate_id": dup.candidate_grievance_id, "score": dup.score},
                 ip=get_client_ip(request))
    db.commit()
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)


# --------------------------------------------------------------------- feedback
@router.post("/{grievance_id}/feedback", response_model=GrievanceDetail,
             status_code=status.HTTP_201_CREATED)
def give_feedback(grievance_id: int, payload: FeedbackCreate,
                  user: CurrentUser, db: DbDep, request: Request):
    g = get_grievance_or_404(db, grievance_id, user)
    if user.role != Role.citizen or g.citizen_id != user.id:
        raise HTTPException(403, "Only the submitting citizen can give feedback")
    if g.status not in (GrievanceStatus.resolved, GrievanceStatus.closed):
        raise HTTPException(409, "Feedback can be given only after resolution")
    if g.feedback:
        raise HTTPException(409, "Feedback already submitted for this grievance")
    fb = Feedback(grievance_id=g.id, citizen_id=user.id, rating=payload.rating,
                  comments=payload.comments.strip())
    db.add(fb)
    record_audit(db, user, "feedback.submitted", "grievance", g.id,
                 {"rating": payload.rating}, ip=get_client_ip(request))
    db.commit()
    db.refresh(g)
    return serialize_grievance_detail(db, g, user)
