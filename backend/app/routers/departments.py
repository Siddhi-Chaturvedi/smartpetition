"""Department & category administration (admin-only writes; reads for staff)."""
from fastapi import APIRouter, HTTPException, status

from ..deps import CurrentUser, DbDep, RequireAdmin, RequireOfficerOrAdmin
from ..models import Category, Department, Grievance, Role, User
from ..schemas import (
    CategoryOut, CategoryUpsert, DepartmentCreate, DepartmentOut, DepartmentUpdate,
)
from ..services.audit import record_audit

router = APIRouter(tags=["departments"])


@router.get("/departments", response_model=list[DepartmentOut])
def list_departments(user: CurrentUser, db: DbDep):
    return db.query(Department).order_by(Department.name).all()


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
def create_department(payload: DepartmentCreate, user: RequireAdmin, db: DbDep):
    if db.query(Department).filter(Department.name.ilike(payload.name.strip())).first():
        raise HTTPException(409, "Department name already exists")
    d = Department(name=payload.name.strip(), description=payload.description,
                   jurisdictions=payload.jurisdictions)
    db.add(d)
    record_audit(db, user, "department.created", "department", None, {"name": d.name})
    db.commit()
    db.refresh(d)
    return d


@router.patch("/departments/{department_id}", response_model=DepartmentOut)
def update_department(department_id: int, payload: DepartmentUpdate, user: RequireAdmin, db: DbDep):
    d = db.get(Department, department_id)
    if d is None:
        raise HTTPException(404, "Department not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(d, field, value)
    record_audit(db, user, "department.updated", "department", d.id,
                 payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(d)
    return d


@router.get("/departments/{department_id}/officers")
def department_officers(department_id: int, user: RequireOfficerOrAdmin, db: DbDep):
    if user.role == Role.officer and user.department_id != department_id:
        raise HTTPException(403, "Not your department")
    officers = db.query(User).filter(User.department_id == department_id,
                                     User.role == Role.officer).all()
    return [{"id": o.id, "full_name": o.full_name, "email": o.email, "is_active": o.is_active,
             "open_cases": db.query(Grievance).filter(
                 Grievance.assignee_id == o.id,
                 Grievance.status.in_(["submitted", "under_review", "in_progress",
                                       "escalated", "reopened"])).count()}
            for o in officers]


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(user: CurrentUser, db: DbDep):
    return db.query(Category).order_by(Category.name).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(payload: CategoryUpsert, user: RequireAdmin, db: DbDep):
    if db.query(Category).filter(Category.name.ilike(payload.name.strip())).first():
        raise HTTPException(409, "Category already exists")
    if payload.department_id and db.get(Department, payload.department_id) is None:
        raise HTTPException(422, "Department not found")
    c = Category(name=payload.name.strip(), department_id=payload.department_id,
                 sla_resolution_hours=payload.sla_resolution_hours)
    db.add(c)
    record_audit(db, user, "category.created", "category", None, {"name": c.name})
    db.commit()
    db.refresh(c)
    return c


@router.patch("/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, payload: CategoryUpsert, user: RequireAdmin, db: DbDep):
    c = db.get(Category, category_id)
    if c is None:
        raise HTTPException(404, "Category not found")
    if payload.department_id and db.get(Department, payload.department_id) is None:
        raise HTTPException(422, "Department not found")
    c.name = payload.name.strip()
    c.department_id = payload.department_id
    c.sla_resolution_hours = payload.sla_resolution_hours
    record_audit(db, user, "category.updated", "category", c.id, {"name": c.name,
                 "department_id": c.department_id, "sla_hours": c.sla_resolution_hours})
    db.commit()
    db.refresh(c)
    return c
