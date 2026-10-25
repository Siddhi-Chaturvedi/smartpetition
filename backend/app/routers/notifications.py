"""In-app notification endpoints."""
from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUser, DbDep
from ..models import Notification
from ..services.serializers import serialize_notification

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def list_notifications(user: CurrentUser, db: DbDep, limit: int = 50, unread_only: bool = False):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    items = q.order_by(Notification.created_at.desc()).limit(min(limit, 200)).all()
    out = []
    for n in items:
        d = serialize_notification(n).model_dump()
        if n.grievance_id and n.grievance_id:
            from ..models import Grievance
            g = db.get(Grievance, n.grievance_id)
            d["grievance_tracking_id"] = g.tracking_id if g else ""
        out.append(d)
    unread = db.query(Notification).filter(Notification.user_id == user.id,
                                           Notification.is_read.is_(False)).count()
    return {"items": out, "unread_count": unread}


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(user: CurrentUser, db: DbDep, notification_id: int):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.is_read = True
    db.commit()


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DbDep):
    db.query(Notification).filter(Notification.user_id == user.id,
                                  Notification.is_read.is_(False)).update({"is_read": True})
    db.commit()
