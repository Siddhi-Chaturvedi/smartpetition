"""Grievance workflow service: creation (with AI pipeline), transitions, resolution.

Design guarantee: a valid grievance is ALWAYS stored even if AI processing
fails — the AI step is wrapped so failures only mark ai_analysis_status.
"""

from sqlalchemy.orm import Session

from ..models import (
    AIPrediction, AIAnalysisStatus, Category, DuplicateCandidate, Grievance,
    GrievanceStatus, Priority, StatusHistory, User, utcnow,
)
from ..schemas import GrievanceCreate
from .ai_classifier import full_analysis
from .audit import record_audit
from .duplicates import find_duplicates
from .notifications import notify
from .routing import compute_due_date, route_grievance
from .state_machine import validate_transition

OPEN_FOR_DUPES = [GrievanceStatus.submitted, GrievanceStatus.under_review,
                  GrievanceStatus.in_progress, GrievanceStatus.escalated,
                  GrievanceStatus.reopened, GrievanceStatus.resolved]


def preview_duplicates(db: Session, title: str, description: str,
                       category: str | None, location: str) -> list[dict]:
    """Pre-submission duplicate check (no persistence)."""
    existing = (
        db.query(Grievance)
        .filter(Grievance.status.in_(OPEN_FOR_DUPES))
        .order_by(Grievance.submitted_at.desc())
        .limit(500)
        .all()
    )
    cands = find_duplicates(title, description, existing, category=category, location=location)
    out = []
    for c in cands:
        g = c["grievance"]
        out.append({
            "tracking_id": g.tracking_id,
            "title": g.title[:150],
            "status": g.status.value if hasattr(g.status, "value") else str(g.status),
            "location": g.location or "",
            "submitted_at": g.submitted_at,
            "score": c["score"],
            "method": c["method"],
            "matched_terms": c["matched_terms"],
        })
    return out


def create_grievance(db: Session, citizen: User, payload: GrievanceCreate, ip: str = "") -> Grievance:
    # 1) Persist the grievance FIRST (never lose a complaint).
    g = Grievance(
        tracking_id=Grievance.generate_tracking_id(),
        citizen_id=citizen.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        location=payload.location or "",
        jurisdiction=payload.jurisdiction or "",
        address=payload.address or "",
        latitude=payload.latitude,
        longitude=payload.longitude,
        status=GrievanceStatus.submitted,
        priority=Priority.medium,
        ai_analysis_status=AIAnalysisStatus.pending,
    )
    if payload.selected_category:
        cat = db.query(Category).filter(Category.name.ilike(payload.selected_category.strip())).first()
        if cat:
            g.selected_category_id = cat.id
            g.category_id = cat.id
    db.add(g)
    db.add(StatusHistory(grievance=g, from_status="", to_status=GrievanceStatus.submitted.value,
                         actor_id=citizen.id, note="Grievance submitted"))
    db.flush()  # get g.id

    # 2) AI analysis (classification + urgency) — failures must not lose the complaint.
    text = f"{g.title}. {g.description}"
    ai_category = None
    ai_confidence = 0.0
    try:
        analysis = full_analysis(db, text)
        ai_category = analysis["category"]
        ai_confidence = analysis["confidence"]
        db.add(AIPrediction(
            grievance_id=g.id,
            model_version=analysis["model_version"],
            method=analysis["method"],
            predicted_category=ai_category,
            confidence=ai_confidence,
            top_categories_json=analysis["top_categories_json"],
            urgency_score=analysis["urgency_score"],
            urgency_level=analysis["urgency_level"],
            urgency_factors_json=analysis["urgency_factors_json"],
            recommended_department=analysis["recommended_department"],
        ))
        g.priority = Priority(analysis["urgency_level"])
        from ..config import settings
        low_confidence = (not g.selected_category_id) and ai_confidence < settings.ai_confidence_threshold
        fallback_used = analysis["method"] == "fallback_rules"
        g.ai_analysis_status = (
            AIAnalysisStatus.needs_review if (low_confidence or fallback_used)
            else AIAnalysisStatus.completed
        )
    except Exception:  # noqa: BLE001 - AI failure degrades gracefully
        g.ai_analysis_status = AIAnalysisStatus.failed
        g.needs_triage = True

    # 3) Duplicate detection (recorded as candidates; never auto-rejects).
    try:
        existing = (
            db.query(Grievance)
            .filter(Grievance.id != g.id, Grievance.status.in_(OPEN_FOR_DUPES))
            .order_by(Grievance.submitted_at.desc())
            .limit(500)
            .all()
        )
        cat_name = g.category.name if g.category else ai_category
        for c in find_duplicates(g.title, g.description, existing,
                                 category=cat_name, location=g.location):
            db.add(DuplicateCandidate(
                grievance_id=g.id, candidate_grievance_id=c["grievance"].id,
                score=c["score"], method=c["method"],
                matched_terms=", ".join(c["matched_terms"]),
            ))
    except Exception:  # noqa: BLE001
        pass  # duplicates are advisory only

    # 4) Routing (auto-assign or triage queue) + SLA due date.
    route_grievance(db, g, ai_category, ai_confidence, actor=citizen)
    if g.due_at is None:
        g.due_at = compute_due_date(db, g)

    # 5) Notifications: confirm to citizen; alert triage admins if needed.
    notify(db, citizen, "Grievance submitted",
           f"Your grievance {g.tracking_id} '{g.title[:60]}' has been registered. "
           f"Priority: {g.priority.value}. You can track it anytime from your dashboard.",
           "submission", g)
    if g.needs_triage:
        from ..models import Role
        admins = db.query(User).filter(User.role == Role.admin, User.is_active.is_(True)).all()
        for a in admins:
            notify(db, a, "Triage needed",
                   f"Grievance {g.tracking_id} could not be auto-routed "
                   f"(AI confidence {ai_confidence:.2f}). Please review and assign.",
                   "triage", g)

    record_audit(db, citizen, "grievance.created", "grievance", g.id,
                 {"tracking_id": g.tracking_id, "priority": g.priority.value}, ip=ip)
    db.commit()
    db.refresh(g)
    return g


def transition_grievance(db: Session, g: Grievance, actor: User, to_status: GrievanceStatus,
                         note: str = "", resolution_summary: str = "",
                         rejection_reason: str = "", ip: str = "") -> str | None:
    """Apply a validated status transition. Returns error string or None on success."""
    err = validate_transition(g, to_status, actor.role)
    if err:
        return err
    if to_status == GrievanceStatus.rejected and not rejection_reason.strip():
        return "A documented rejection reason is required"
    if to_status == GrievanceStatus.resolved and not resolution_summary.strip():
        return "A resolution summary is required to mark a grievance resolved"

    frm = g.status
    g.status = to_status
    db.add(StatusHistory(grievance_id=g.id, from_status=frm.value, to_status=to_status.value,
                         actor_id=actor.id, note=note[:2000]))

    now = utcnow()
    if to_status == GrievanceStatus.resolved:
        g.resolved_at = now
        g.resolution_summary = resolution_summary.strip()[:4000]
        notify(db, g.citizen, f"Grievance resolved: {g.tracking_id}",
               f"Your grievance '{g.title[:60]}' has been resolved. Summary: "
               f"{resolution_summary[:200]}. You can close it, give feedback, or reopen "
               f"within 14 days if unresolved in practice.", "resolution", g)
    elif to_status == GrievanceStatus.rejected:
        g.rejection_reason = rejection_reason.strip()[:2000]
        notify(db, g.citizen, f"Grievance rejected: {g.tracking_id}",
               f"Your grievance '{g.title[:60]}' was rejected. Reason: {g.rejection_reason[:300]}. "
               f"You may reopen it if you believe this is incorrect.", "rejection", g)
    elif to_status == GrievanceStatus.closed:
        g.closed_at = now
        record_audit(db, actor, "grievance.closed", "grievance", g.id, {"note": note}, ip=ip)
    elif to_status == GrievanceStatus.reopened:
        g.reopen_count = (g.reopen_count or 0) + 1
        g.resolved_at = None
        g.closed_at = None
        g.resolution_summary = ""
        g.due_at = compute_due_date(db, g)
        notify(db, g.citizen, f"Grievance reopened: {g.tracking_id}",
               f"Your grievance '{g.title[:60]}' has been reopened and sent back for action.",
               "status", g)
        if g.department_id:
            from ..models import Role
            officers = db.query(User).filter(User.role == Role.officer,
                                             User.department_id == g.department_id,
                                             User.is_active.is_(True)).all()
            for o in officers:
                notify(db, o, f"Reopened case: {g.tracking_id}",
                       f"'{g.title[:60]}' was reopened by the citizen (reopen #{g.reopen_count}).",
                       "status", g)
    elif to_status == GrievanceStatus.in_progress and frm != GrievanceStatus.in_progress:
        if actor.role.value in ("officer", "admin") and note:
            notify(db, g.citizen, f"Progress update: {g.tracking_id}",
                   note[:400], "status", g)

    if to_status in (GrievanceStatus.under_review, GrievanceStatus.in_progress):
        g.needs_triage = False

    record_audit(db, actor, "grievance.status_changed", "grievance", g.id,
                 {"from": frm.value, "to": to_status.value, "note": note[:200]}, ip=ip)
    db.commit()
    return None
