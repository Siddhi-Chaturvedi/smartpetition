"""Audit logging service — permanent record of significant actions."""
import json

from sqlalchemy.orm import Session

from ..models import AuditLog, User


def record_audit(
    db: Session,
    actor: User | None,
    action: str,
    entity_type: str = "",
    entity_id: int | None = None,
    detail: dict | str = "",
    ip: str = "",
) -> AuditLog:
    if isinstance(detail, dict):
        detail = json.dumps(detail, default=str)
    log = AuditLog(
        actor_id=actor.id if actor else None,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        detail=str(detail)[:4000],
        ip_address=ip[:64],
    )
    db.add(log)
    return log
