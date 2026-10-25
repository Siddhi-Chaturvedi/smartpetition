"""SmartPetition SQLAlchemy models (normalized schema)."""
import enum
import secrets
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, UTCDateTime

DateTime = UTCDateTime  # all model timestamps are timezone-safe UTC


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- enums
class Role(str, enum.Enum):
    citizen = "citizen"
    officer = "officer"
    admin = "admin"


class GrievanceStatus(str, enum.Enum):
    submitted = "submitted"
    under_review = "under_review"
    in_progress = "in_progress"
    escalated = "escalated"
    resolved = "resolved"
    closed = "closed"
    reopened = "reopened"
    rejected = "rejected"


class Priority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AIAnalysisStatus(str, enum.Enum):
    pending = "pending"
    completed = "completed"
    failed = "failed"
    needs_review = "needs_review"


class DupReviewStatus(str, enum.Enum):
    pending = "pending"
    confirmed_duplicate = "confirmed_duplicate"
    dismissed = "dismissed"


# --------------------------------------------------------------------------- core
class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    jurisdictions: Mapped[str] = mapped_column(Text, default="")  # comma-separated
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    officers: Mapped[list["User"]] = relationship(back_populates="department")
    categories: Mapped[list["Category"]] = relationship(back_populates="department")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role), default=Role.citizen, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    phone: Mapped[str] = mapped_column(String(32), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)

    department: Mapped[Department | None] = relationship(back_populates="officers")
    grievances: Mapped[list["Grievance"]] = relationship(
        back_populates="citizen", foreign_keys="Grievance.citizen_id"
    )


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    sla_resolution_hours: Mapped[int] = mapped_column(Integer, default=72)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    department: Mapped[Department | None] = relationship(back_populates="categories")


# --------------------------------------------------------------------------- grievances
class Grievance(Base):
    __tablename__ = "grievances"
    __table_args__ = (
        Index("ix_grievance_status_priority", "status", "priority"),
        Index("ix_grievance_dept_status", "department_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    tracking_id: Mapped[str] = mapped_column(String(24), unique=True, index=True, nullable=False)
    citizen_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # citizen-selected vs final (human-confirmed) category kept separate
    selected_category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    category_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)

    location: Mapped[str] = mapped_column(String(200), default="")
    jurisdiction: Mapped[str] = mapped_column(String(120), default="", index=True)
    address: Mapped[str] = mapped_column(Text, default="")
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

    status: Mapped[GrievanceStatus] = mapped_column(
        Enum(GrievanceStatus), default=GrievanceStatus.submitted, index=True
    )
    priority: Mapped[Priority] = mapped_column(Enum(Priority), default=Priority.medium, index=True)
    priority_override_reason: Mapped[str] = mapped_column(Text, default="")

    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True, index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    ai_analysis_status: Mapped[AIAnalysisStatus] = mapped_column(
        Enum(AIAnalysisStatus), default=AIAnalysisStatus.pending
    )
    needs_triage: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_demo_data: Mapped[bool] = mapped_column(Boolean, default=False)

    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_summary: Mapped[str] = mapped_column(Text, default="")
    rejection_reason: Mapped[str] = mapped_column(Text, default="")
    reopen_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)

    citizen: Mapped[User] = relationship(back_populates="grievances", foreign_keys=[citizen_id])
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])
    department: Mapped[Department | None] = relationship()
    category: Mapped[Category | None] = relationship(foreign_keys=[category_id])
    selected_category: Mapped[Category | None] = relationship(foreign_keys=[selected_category_id])

    comments: Mapped[list["Comment"]] = relationship(back_populates="grievance", cascade="all, delete-orphan")
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="grievance", cascade="all, delete-orphan")
    history: Mapped[list["StatusHistory"]] = relationship(back_populates="grievance", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="grievance", cascade="all, delete-orphan")
    ai_predictions: Mapped[list["AIPrediction"]] = relationship(back_populates="grievance", cascade="all, delete-orphan")
    duplicate_candidates: Mapped[list["DuplicateCandidate"]] = relationship(
        back_populates="grievance", cascade="all, delete-orphan", foreign_keys="DuplicateCandidate.grievance_id"
    )
    escalations: Mapped[list["EscalationEvent"]] = relationship(back_populates="grievance", cascade="all, delete-orphan")
    feedback: Mapped["Feedback | None"] = relationship(back_populates="grievance", uselist=False)

    @staticmethod
    def generate_tracking_id() -> str:
        return f"SP-{utcnow():%Y%m%d}-{secrets.token_hex(4).upper()}"


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    officer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assigned_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str] = mapped_column(String(200), default="auto-routing")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="assignments")


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)  # internal officer notes
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="attachments")


# --------------------------------------------------------------------------- AI
class AIPrediction(Base):
    """AI recommendations, kept SEPARATE from final human decisions."""

    __tablename__ = "ai_predictions"

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(40), default="unknown")
    method: Mapped[str] = mapped_column(String(30), default="ml_model")  # ml_model | fallback_rules
    predicted_category: Mapped[str] = mapped_column(String(80), default="")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    top_categories_json: Mapped[str] = mapped_column(Text, default="[]")
    urgency_score: Mapped[float] = mapped_column(Float, default=0.0)
    urgency_level: Mapped[str] = mapped_column(String(20), default="medium")
    urgency_factors_json: Mapped[str] = mapped_column(Text, default="[]")
    recommended_department: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="ai_predictions")


class DuplicateCandidate(Base):
    __tablename__ = "duplicate_candidates"
    __table_args__ = (
        UniqueConstraint("grievance_id", "candidate_grievance_id", name="uq_dup_pair"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    candidate_grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    method: Mapped[str] = mapped_column(String(40), default="tfidf")  # tfidf | keyword | embeddings
    matched_terms: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[DupReviewStatus] = mapped_column(Enum(DupReviewStatus), default=DupReviewStatus.pending)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="duplicate_candidates", foreign_keys=[grievance_id])
    candidate: Mapped[Grievance] = relationship(foreign_keys=[candidate_grievance_id])


# --------------------------------------------------------------------------- workflow
class StatusHistory(Base):
    __tablename__ = "status_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    from_status: Mapped[str] = mapped_column(String(30), default="")
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="history")
    actor: Mapped[User | None] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), default="info")
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    grievance_id: Mapped[int | None] = mapped_column(ForeignKey("grievances.id"), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    email_status: Mapped[str] = mapped_column(String(20), default="not_configured")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(40), default="")
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    detail: Mapped[str] = mapped_column(Text, default="")
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), unique=True, nullable=False)
    citizen_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..5
    comments: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="feedback")


class SLARule(Base):
    __tablename__ = "sla_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    scope: Mapped[str] = mapped_column(String(20), default="global")  # global|category|department|priority
    scope_value: Mapped[str] = mapped_column(String(120), default="")  # category/dept name or priority
    resolution_hours: Mapped[int] = mapped_column(Integer, default=72)
    escalation_hours: Mapped[int] = mapped_column(Integer, default=96)  # escalate this long after due
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class EscalationEvent(Base):
    __tablename__ = "escalation_events"
    __table_args__ = (UniqueConstraint("grievance_id", "level", name="uq_escalation_level"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    grievance_id: Mapped[int] = mapped_column(ForeignKey("grievances.id"), nullable=False, index=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    reason: Mapped[str] = mapped_column(String(200), default="sla_breach")
    notified_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    grievance: Mapped[Grievance] = relationship(back_populates="escalations")


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=utcnow)
