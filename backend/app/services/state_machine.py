"""Grievance status state machine: valid transitions + authorized actors.

Enforced on the backend; the frontend only mirrors these rules for UX.
"""
from datetime import timedelta

from ..models import Grievance, GrievanceStatus, Role, utcnow

# (from_status, to_status) -> set of roles allowed to perform the transition
TRANSITIONS: dict[tuple[GrievanceStatus, GrievanceStatus], set[Role]] = {
    (GrievanceStatus.submitted, GrievanceStatus.under_review): {Role.officer, Role.admin},
    (GrievanceStatus.submitted, GrievanceStatus.in_progress): {Role.officer, Role.admin},
    (GrievanceStatus.submitted, GrievanceStatus.rejected): {Role.officer, Role.admin},
    (GrievanceStatus.under_review, GrievanceStatus.in_progress): {Role.officer, Role.admin},
    (GrievanceStatus.under_review, GrievanceStatus.escalated): {Role.officer, Role.admin},
    (GrievanceStatus.under_review, GrievanceStatus.rejected): {Role.officer, Role.admin},
    (GrievanceStatus.in_progress, GrievanceStatus.escalated): {Role.officer, Role.admin},
    (GrievanceStatus.in_progress, GrievanceStatus.resolved): {Role.officer, Role.admin},
    (GrievanceStatus.escalated, GrievanceStatus.in_progress): {Role.officer, Role.admin},
    (GrievanceStatus.escalated, GrievanceStatus.resolved): {Role.officer, Role.admin},
    (GrievanceStatus.resolved, GrievanceStatus.closed): {Role.citizen, Role.admin},
    (GrievanceStatus.resolved, GrievanceStatus.reopened): {Role.citizen, Role.admin},
    (GrievanceStatus.closed, GrievanceStatus.reopened): {Role.citizen, Role.admin},
    (GrievanceStatus.rejected, GrievanceStatus.reopened): {Role.citizen, Role.admin},
    (GrievanceStatus.reopened, GrievanceStatus.under_review): {Role.officer, Role.admin},
    (GrievanceStatus.reopened, GrievanceStatus.in_progress): {Role.officer, Role.admin},
}

# Reopening window: citizens may reopen resolved/closed cases within this period.
REOPEN_WINDOW = timedelta(days=14)


def allowed_transitions(status: GrievanceStatus, role: Role) -> list[GrievanceStatus]:
    return [to for (frm, to), roles in TRANSITIONS.items() if frm == status and role in roles]


def validate_transition(grievance: Grievance, to_status: GrievanceStatus, role: Role) -> str | None:
    """Return an error message if the transition is invalid, else None."""
    frm = grievance.status
    if frm == to_status:
        return f"Grievance is already in status '{to_status.value}'"
    roles = TRANSITIONS.get((frm, to_status))
    if roles is None:
        return f"Transition '{frm.value}' -> '{to_status.value}' is not permitted by the workflow"
    if role not in roles:
        return f"Role '{role.value}' is not authorized for transition '{frm.value}' -> '{to_status.value}'"

    if to_status == GrievanceStatus.reopened and role == Role.citizen:
        reference = grievance.resolved_at or grievance.closed_at
        if reference and utcnow() - reference > REOPEN_WINDOW:
            return f"Reopen window ({REOPEN_WINDOW.days} days) has expired for this grievance"
        if grievance.reopen_count >= 2:
            return "This grievance has already been reopened twice; please contact support"

    if to_status == GrievanceStatus.rejected:
        # rejection requires a documented reason (checked at router level too)
        pass
    return None
