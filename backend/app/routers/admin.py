"""Administrator endpoints: users, SLA rules, audit logs, settings, manual SLA sweep."""
import re

from fastapi import APIRouter, HTTPException, Query, Request, status

from ..deps import DbDep, RequireAdmin, get_client_ip
from ..models import (
    AppSetting, AuditLog, Department, EscalationEvent, Grievance, Role, SLARule, User,
)
from ..schemas import (
    EscalationOut, SLARuleOut, SLARuleUpsert, UserAdminCreate,
    UserAdminUpdate, UserOut,
)
from ..security import hash_password
from ..services.audit import record_audit
from ..services.serializers import _tz

router = APIRouter(prefix="/admin", tags=["admin"])


# --------------------------------------------------------------------- users
@router.get("/users", response_model=list[UserOut])
def list_users(user: RequireAdmin, db: DbDep, role: str | None = None,
               search: str | None = None, limit: int = Query(100, le=500)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(User.email.ilike(like) | User.full_name.ilike(like))
    return q.order_by(User.id).limit(limit).all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserAdminCreate, admin: RequireAdmin, db: DbDep, request: Request):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(409, "Email already registered")
    if payload.role == "officer":
        if payload.department_id is None:
            raise HTTPException(422, "Officers must belong to a department")
        if db.get(Department, payload.department_id) is None:
            raise HTTPException(422, "Department not found")
    u = User(email=payload.email.lower(), full_name=payload.full_name.strip(),
             hashed_password=hash_password(payload.password), role=Role(payload.role),
             department_id=payload.department_id, email_verified=True)
    db.add(u)
    db.flush()
    record_audit(db, admin, "user.created", "user", u.id,
                 {"email": u.email, "role": u.role.value}, ip=get_client_ip(request))
    db.commit()
    db.refresh(u)
    return u


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserAdminUpdate, admin: RequireAdmin,
                db: DbDep, request: Request):
    u = db.get(User, user_id)
    if u is None:
        raise HTTPException(404, "User not found")
    if u.id == admin.id and payload.is_active is False:
        raise HTTPException(409, "You cannot deactivate your own account")
    changes = {}
    if payload.role is not None:
        if u.id == admin.id and payload.role != "admin":
            raise HTTPException(409, "You cannot demote your own admin account")
        changes["role"] = payload.role
        u.role = Role(payload.role)
    if payload.department_id is not None:
        if db.get(Department, payload.department_id) is None:
            raise HTTPException(422, "Department not found")
        changes["department_id"] = payload.department_id
        u.department_id = payload.department_id
    if payload.is_active is not None:
        changes["is_active"] = payload.is_active
        u.is_active = payload.is_active
    record_audit(db, admin, "user.updated", "user", u.id, changes, ip=get_client_ip(request))
    db.commit()
    db.refresh(u)
    return u


# --------------------------------------------------------------------- SLA rules
@router.get("/sla-rules", response_model=list[SLARuleOut])
def list_sla(user: RequireAdmin, db: DbDep):
    return db.query(SLARule).order_by(SLARule.id).all()


@router.post("/sla-rules", response_model=SLARuleOut, status_code=status.HTTP_201_CREATED)
def upsert_sla(payload: SLARuleUpsert, admin: RequireAdmin, db: DbDep):
    existing = db.query(SLARule).filter(SLARule.scope == payload.scope,
                                        SLARule.scope_value == payload.scope_value).first()
    if existing:
        existing.resolution_hours = payload.resolution_hours
        existing.escalation_hours = payload.escalation_hours
        rule = existing
    else:
        rule = SLARule(scope=payload.scope, scope_value=payload.scope_value,
                       resolution_hours=payload.resolution_hours,
                       escalation_hours=payload.escalation_hours)
        db.add(rule)
    record_audit(db, admin, "sla_rule.upserted", "sla_rule", None, payload.model_dump())
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/sla-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sla(rule_id: int, admin: RequireAdmin, db: DbDep):
    rule = db.get(SLARule, rule_id)
    if rule is None:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    record_audit(db, admin, "sla_rule.deleted", "sla_rule", rule_id, {})
    db.commit()


@router.post("/sla/run-sweep")
def run_sweep(admin: RequireAdmin, db: DbDep):
    """Manual SLA/escalation trigger — lets admins (and tests) verify escalation
    without waiting for a real deadline."""
    from ..services.sla import run_sla_sweep
    stats = run_sla_sweep(db)
    record_audit(db, admin, "sla.manual_sweep", "system", None, stats)
    db.commit()
    return stats


@router.get("/escalations", response_model=list[EscalationOut])
def escalations(admin: RequireAdmin, db: DbDep, limit: int = Query(100, le=500)):
    return db.query(EscalationEvent).order_by(EscalationEvent.created_at.desc()).limit(limit).all()


# --------------------------------------------------------------------- audit
@router.get("/audit-logs")
def audit_logs(admin: RequireAdmin, db: DbDep, action: str | None = None,
               entity_type: str | None = None, actor_id: int | None = None,
               page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if actor_id:
        q = q.filter(AuditLog.actor_id == actor_id)
    total = q.count()
    logs = q.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size).all()
    items = []
    for a in logs:
        actor = db.get(User, a.actor_id) if a.actor_id else None
        items.append({
            "id": a.id, "actor_id": a.actor_id,
            "actor_name": actor.full_name if actor else "system",
            "action": a.action, "entity_type": a.entity_type, "entity_id": a.entity_id,
            "detail": a.detail, "ip_address": a.ip_address,
            "created_at": _tz(a.created_at),
        })
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# --------------------------------------------------------------------- settings
@router.get("/settings")
def get_settings(admin: RequireAdmin, db: DbDep):
    rows = db.query(AppSetting).all()
    return {r.key: r.value for r in rows}


@router.put("/settings/{key}")
def put_setting(key: str, admin: RequireAdmin, db: DbDep, value: str = ""):
    if not re.match(r"^[a-z0-9_.\-]{1,80}$", key := key.strip().lower()):
        raise HTTPException(422, "Invalid setting key")
    row = db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value[:4000])
        db.add(row)
    else:
        row.value = value[:4000]
    record_audit(db, admin, "setting.updated", "setting", None, {"key": key})
    db.commit()
    return {"key": row.key, "value": row.value}



# --------------------------------------------------------------------- triage queue
@router.get("/triage-queue")
def triage_queue(admin: RequireAdmin, db: DbDep):
    gs = db.query(Grievance).filter(Grievance.needs_triage.is_(True)).order_by(
        Grievance.submitted_at.asc()).limit(200).all()
    from ..services.serializers import serialize_grievance
    return [serialize_grievance(g).model_dump() for g in gs]
