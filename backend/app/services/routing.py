"""Automatic department routing engine.

Rules (all configurable in DB):
1. Determine the effective category (citizen-selected first, then AI prediction).
2. Look up the category->department mapping (Category.department_id).
3. If the grievance has a jurisdiction, prefer a mapped department whose
   jurisdictions list contains it; otherwise accept the department anyway.
4. Auto-assign ONLY when: mapping exists, department is active, and the AI
   confidence >= threshold (or the citizen explicitly selected the category).
5. Otherwise the grievance goes to the admin triage queue (needs_triage=True).
"""
from datetime import timedelta

from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    Assignment, Category, Department, Grievance, SLARule, utcnow,
)
from .audit import record_audit
from .notifications import notify


def resolve_sla_hours(db: Session, grievance: Grievance) -> tuple[int, int]:
    """Return (resolution_hours, escalation_hours) using the most specific rule."""
    # priority-scoped override
    rule = (
        db.query(SLARule)
        .filter(SLARule.is_active.is_(True), SLARule.scope == "priority",
                SLARule.scope_value == grievance.priority.value)
        .first()
    )
    if rule is None and grievance.category:
        rule = (
            db.query(SLARule)
            .filter(SLARule.is_active.is_(True), SLARule.scope == "category",
                    SLARule.scope_value == grievance.category.name)
            .first()
        )
    if rule is None and grievance.department:
        rule = (
            db.query(SLARule)
            .filter(SLARule.is_active.is_(True), SLARule.scope == "department",
                    SLARule.scope_value == grievance.department.name)
            .first()
        )
    if rule is None:
        rule = (
            db.query(SLARule)
            .filter(SLARule.is_active.is_(True), SLARule.scope == "global")
            .first()
        )
    if rule:
        return rule.resolution_hours, rule.escalation_hours
    # fallback: category default or system default
    hours = grievance.category.sla_resolution_hours if grievance.category else settings.default_resolution_hours
    return hours, hours + 24


def compute_due_date(db: Session, grievance: Grievance):
    resolution_hours, _ = resolve_sla_hours(db, grievance)
    start = grievance.assigned_at or grievance.submitted_at or utcnow()
    return start + timedelta(hours=resolution_hours)


def find_department(db: Session, category_name: str | None, jurisdiction: str) -> Department | None:
    if not category_name:
        return None
    cat = db.query(Category).filter(Category.name.ilike(category_name), Category.is_active.is_(True)).first()
    if cat is None or cat.department_id is None:
        return None
    dept = db.get(Department, cat.department_id)
    if dept is None or not dept.is_active:
        return None
    # jurisdiction refinement: if dept list is non-empty and jurisdiction given,
    # prefer a department that covers it (search all departments with same category)
    if jurisdiction:
        jur = jurisdiction.strip().lower()
        dept_jurs = [j.strip().lower() for j in (dept.jurisdictions or "").split(",") if j.strip()]
        if dept_jurs and jur and jur not in dept_jurs:
            # look for another active department covering this jurisdiction+category
            alt = (
                db.query(Department)
                .filter(Department.is_active.is_(True))
                .all()
            )
            for d in alt:
                d_jurs = [j.strip().lower() for j in (d.jurisdictions or "").split(",") if j.strip()]
                if jur in d_jurs and any(c.department_id == d.id for c in cat.department.categories if c.name == cat.name):
                    return d
    return dept


def route_grievance(db: Session, grievance: Grievance, ai_category: str | None,
                    ai_confidence: float, actor=None) -> bool:
    """Attempt automatic routing. Returns True if auto-assigned, False if triage."""
    # Effective category: citizen selection wins; else AI if confident.
    effective = None
    confident = False
    if grievance.selected_category:
        effective = grievance.selected_category.name
        confident = True  # explicit citizen choice
    elif ai_category and ai_confidence >= settings.ai_confidence_threshold:
        effective = ai_category
        confident = True

    if grievance.category_id is None and effective:
        cat = db.query(Category).filter(Category.name.ilike(effective)).first()
        if cat:
            grievance.category = cat  # set relationship (not raw FK) so it stays in sync

    dept = find_department(db, effective, grievance.jurisdiction) if confident else None

    if dept is not None:
        grievance.department = dept
        grievance.needs_triage = False
        grievance.assigned_at = utcnow()
        db.add(Assignment(grievance_id=grievance.id, department_id=dept.id, officer_id=None,
                          assigned_by=actor.id if actor else None,
                          reason="auto-routing" if confident and not grievance.selected_category else "auto-routing-citizen-category"))
        # pick the least-loaded active officer of the department
        from ..models import Role, User
        officers = db.query(User).filter(User.role == Role.officer, User.department_id == dept.id,
                                         User.is_active.is_(True)).all()
        if officers:
            loads = {
                o.id: db.query(Grievance).filter(
                    Grievance.assignee_id == o.id,
                    Grievance.status.notin_(["resolved", "closed", "rejected"]),
                ).count()
                for o in officers
            }
            chosen = min(officers, key=lambda o: loads[o.id])
            grievance.assignee = chosen
            db.add(Assignment(grievance_id=grievance.id, department_id=dept.id, officer_id=chosen.id,
                              assigned_by=actor.id if actor else None, reason="auto-load-balance"))
            notify(db, chosen, "New grievance assigned",
                   f"Grievance {grievance.tracking_id} ('{grievance.title[:60]}') was routed to {dept.name} "
                   f"and assigned to you with priority '{grievance.priority.value}'.",
                   "assignment", grievance)
        grievance.due_at = compute_due_date(db, grievance)
        record_audit(db, actor, "grievance.auto_routed", "grievance", grievance.id,
                     {"department": dept.name, "category": effective, "confidence": ai_confidence})
        return True

    grievance.needs_triage = True
    grievance.due_at = compute_due_date(db, grievance)
    record_audit(db, actor, "grievance.sent_to_triage", "grievance", grievance.id,
                 {"category": effective, "confidence": ai_confidence})
    return False


def assign_manually(db: Session, grievance: Grievance, actor, department_id: int | None,
                    officer_id: int | None, reason: str) -> None:
    """Manual (re)assignment by officer/admin with full audit history."""
    from ..models import Department, User
    grievance.needs_triage = False
    if department_id is not None:
        dept = db.get(Department, department_id)
        if dept is None or not dept.is_active:
            raise ValueError("Department not found or inactive")
        grievance.department = dept
    if officer_id is not None:
        officer = db.get(User, officer_id)
        if officer is None or officer.role.value != "officer" or not officer.is_active:
            raise ValueError("Officer not found or inactive")
        grievance.assignee = officer
        notify(db, officer, "Grievance assigned to you",
               f"Grievance {grievance.tracking_id} was assigned to you by {actor.full_name}. Reason: {reason}",
               "assignment", grievance)
    grievance.assigned_at = utcnow()
    grievance.due_at = compute_due_date(db, grievance)
    db.add(Assignment(grievance_id=grievance.id, department_id=grievance.department_id,
                      officer_id=officer_id, assigned_by=actor.id, reason=reason[:200]))
    record_audit(db, actor, "grievance.assigned", "grievance", grievance.id,
                 {"department_id": grievance.department_id, "officer_id": officer_id, "reason": reason})
