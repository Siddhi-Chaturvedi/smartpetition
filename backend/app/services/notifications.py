"""Notification service: in-app notifications always work; email is optional.

Email is only reported as delivered when the configured SMTP provider accepts
it. If SMTP is not configured, email_status='not_configured' (honest reporting).
"""
import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Grievance, Notification, Role, User


def notify(
    db: Session,
    user: User,
    title: str,
    body: str,
    type_: str = "info",
    grievance: Grievance | None = None,
    send_email: bool = True,
) -> Notification:
    n = Notification(user_id=user.id, title=title[:200], body=body[:2000], type=type_,
                     grievance_id=grievance.id if grievance else None)
    n.email_status = "not_configured"
    if send_email and settings.email_enabled and user.email:
        n.email_status = _send_email(user.email, title, body)
    db.add(n)
    return n


def notify_role(db: Session, role: Role, title: str, body: str, type_: str = "info",
                grievance: Grievance | None = None, department_id: int | None = None) -> int:
    """Notify all active users of a role (optionally restricted to a department)."""
    q = db.query(User).filter(User.role == role, User.is_active.is_(True))
    if department_id is not None:
        q = q.filter(User.department_id == department_id)
    count = 0
    for user in q.all():
        notify(db, user, title, body, type_, grievance)
        count += 1
    return count


def _send_email(to_addr: str, subject: str, body: str) -> str:
    """Return one of: delivered | failed:<reason>. Never claims success falsely."""
    try:
        msg = EmailMessage()
        msg["From"] = settings.smtp_from
        msg["To"] = to_addr
        msg["Subject"] = f"[SmartPetition] {subject}"
        msg.set_content(body)
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return "delivered"
    except Exception as exc:  # noqa: BLE001 - report honestly, keep app working
        return f"failed:{type(exc).__name__}"
