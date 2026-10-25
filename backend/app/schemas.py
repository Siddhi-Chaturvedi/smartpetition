"""Pydantic request/response schemas. Password hashes and internal fields never leave the API."""
from datetime import datetime

import re as _re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --------------------------------------------------------------------- auth / users
class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    phone: str = Field(default="", max_length=32)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v) or not any(c.isalpha() for c in v):
            raise ValueError("Password must contain both letters and numbers")
        return v


def _lenient_email_shape(v: str) -> str:
    v = v.strip().lower()
    if not _re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v):
        raise ValueError("Enter a valid email address")
    return v


LenientEmail = Annotated[str, AfterValidator(_lenient_email_shape)]


class LoginRequest(BaseModel):
    # Login uses a shape-checked plain email (not EmailStr) on purpose:
    # EmailStr rejects special-use domains such as *.local, which are exactly
    # what the documented local-development demo accounts use. Registration
    # keeps strict EmailStr validation; login only needs a sane shape and
    # must never leak which emails exist (401 either way).
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: str) -> str:
        return _lenient_email_shape(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(ORMModel):
    id: int
    email: LenientEmail  # output must serialise dev demo accounts (*.local) too
    full_name: str
    role: str
    department_id: int | None = None
    phone: str = ""
    is_active: bool = True
    email_verified: bool = False
    created_at: datetime | None = None


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, max_length=32)


class UserAdminCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(citizen|officer|admin)$")
    department_id: int | None = None


class UserAdminUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(citizen|officer|admin)$")
    department_id: int | None = None
    is_active: bool | None = None


# --------------------------------------------------------------------- departments
class DepartmentOut(ORMModel):
    id: int
    name: str
    description: str = ""
    jurisdictions: str = ""
    is_active: bool = True


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    jurisdictions: str = ""


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    jurisdictions: str | None = None
    is_active: bool | None = None


class CategoryOut(ORMModel):
    id: int
    name: str
    department_id: int | None = None
    sla_resolution_hours: int = 72
    is_active: bool = True


class CategoryUpsert(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    department_id: int | None = None
    sla_resolution_hours: int = Field(default=72, ge=1, le=24 * 365)


# --------------------------------------------------------------------- grievances
class GrievanceCreate(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: str = Field(min_length=20, max_length=8000)
    selected_category: str | None = None
    location: str = Field(default="", max_length=200)
    jurisdiction: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=1000)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class AttachmentOut(ORMModel):
    id: int
    original_filename: str
    content_type: str
    size_bytes: int
    created_at: datetime | None = None


class CommentOut(ORMModel):
    id: int
    author_id: int
    author_name: str = ""
    author_role: str = ""
    body: str
    is_internal: bool = False
    created_at: datetime | None = None


class StatusHistoryOut(ORMModel):
    id: int
    from_status: str
    to_status: str
    actor_id: int | None = None
    actor_name: str = ""
    note: str = ""
    created_at: datetime | None = None


class AssignmentOut(ORMModel):
    id: int
    department_id: int | None = None
    department_name: str = ""
    officer_id: int | None = None
    officer_name: str = ""
    reason: str = ""
    is_active: bool = True
    created_at: datetime | None = None


class AIPredictionOut(ORMModel):
    id: int
    model_version: str
    method: str
    predicted_category: str
    confidence: float
    top_categories_json: str = "[]"
    urgency_score: float
    urgency_level: str
    urgency_factors_json: str = "[]"
    recommended_department: str = ""
    created_at: datetime | None = None


class DuplicateCandidateOut(ORMModel):
    id: int
    candidate_grievance_id: int
    candidate_tracking_id: str = ""
    candidate_title: str = ""
    candidate_status: str = ""
    candidate_location: str = ""
    candidate_submitted_at: datetime | None = None
    score: float
    method: str
    matched_terms: str = ""
    review_status: str = "pending"


class GrievanceOut(ORMModel):
    id: int
    tracking_id: str
    title: str
    description: str
    status: str
    priority: str
    priority_override_reason: str = ""
    location: str = ""
    jurisdiction: str = ""
    address: str = ""
    latitude: float | None = None
    longitude: float | None = None
    category_id: int | None = None
    category_name: str = ""
    selected_category_id: int | None = None
    department_id: int | None = None
    department_name: str = ""
    assignee_id: int | None = None
    assignee_name: str = ""
    citizen_id: int
    citizen_name: str = ""
    ai_analysis_status: str = "pending"
    needs_triage: bool = False
    is_demo_data: bool = False
    submitted_at: datetime | None = None
    assigned_at: datetime | None = None
    due_at: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    resolution_summary: str = ""
    rejection_reason: str = ""
    reopen_count: int = 0
    attachments: list[AttachmentOut] = []
    is_overdue: bool = False


class GrievanceDetail(GrievanceOut):
    comments: list[CommentOut] = []
    history: list[StatusHistoryOut] = []
    assignments: list[AssignmentOut] = []
    ai_predictions: list[AIPredictionOut] = []
    duplicate_candidates: list[DuplicateCandidateOut] = []
    feedback: "FeedbackOut | None" = None


class GrievanceListResponse(BaseModel):
    items: list[GrievanceOut]
    total: int
    page: int
    page_size: int


class StatusTransitionRequest(BaseModel):
    to_status: str = Field(pattern="^(under_review|in_progress|escalated|resolved|closed|reopened|rejected)$")
    note: str = Field(default="", max_length=2000)
    resolution_summary: str = Field(default="", max_length=4000)
    rejection_reason: str = Field(default="", max_length=2000)


class PriorityOverrideRequest(BaseModel):
    priority: str = Field(pattern="^(low|medium|high|critical)$")
    reason: str = Field(min_length=5, max_length=1000)


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    is_internal: bool = False


class AssignRequest(BaseModel):
    department_id: int | None = None
    officer_id: int | None = None
    reason: str = Field(default="manual-assignment", max_length=200)


class CategoryCorrectionRequest(BaseModel):
    category_id: int
    reason: str = Field(default="", max_length=500)


class DuplicatePreviewRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=8000)
    category: str | None = None
    location: str = ""


class DuplicatePreviewItem(BaseModel):
    tracking_id: str
    title: str
    status: str
    location: str
    submitted_at: datetime | None
    score: float
    method: str
    matched_terms: list[str] = []


class ClassifyRequest(BaseModel):
    text: str = Field(min_length=3, max_length=8000)


class ClassifyResponse(BaseModel):
    category: str
    confidence: float
    top_categories: list[dict]
    method: str  # ml_model | fallback_rules
    model_version: str
    priority: str
    urgency_score: float
    urgency_factors: list[str]
    recommended_department: str = ""


class FeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comments: str = Field(default="", max_length=2000)


class FeedbackOut(ORMModel):
    id: int
    rating: int
    comments: str = ""
    created_at: datetime | None = None


# --------------------------------------------------------------------- misc
class NotificationOut(ORMModel):
    id: int
    type: str
    title: str
    body: str
    grievance_id: int | None = None
    grievance_tracking_id: str = ""
    is_read: bool
    created_at: datetime | None = None


class SLARuleOut(ORMModel):
    id: int
    scope: str
    scope_value: str
    resolution_hours: int
    escalation_hours: int
    is_active: bool


class SLARuleUpsert(BaseModel):
    scope: str = Field(pattern="^(global|category|department|priority)$")
    scope_value: str = ""
    resolution_hours: int = Field(ge=1, le=24 * 365)
    escalation_hours: int = Field(ge=1, le=24 * 365)


class EscalationOut(ORMModel):
    id: int
    grievance_id: int
    level: int
    reason: str
    notified_count: int
    created_at: datetime | None = None


class AuditLogOut(ORMModel):
    id: int
    actor_id: int | None = None
    actor_name: str = ""
    action: str
    entity_type: str
    entity_id: int | None = None
    detail: str
    ip_address: str
    created_at: datetime | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    database: str
    ai_model: str
    time: datetime
    demo_accounts: bool = False


TokenResponse.model_rebuild()
GrievanceDetail.model_rebuild()
