"""Authentication & profile endpoints."""
from fastapi import APIRouter, HTTPException, Request, status

from ..deps import CurrentUser, DbDep
from ..models import Role, User
from ..schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut, UserUpdate
from ..security import create_access_token, hash_password, verify_password
from ..services.audit import record_audit
from ..deps import get_client_ip

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbDep, request: Request):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name.strip(),
        hashed_password=hash_password(payload.password),
        role=Role.citizen,
        phone=payload.phone or "",
        # When SMTP is configured we would require verification; locally mark verified
        # so the dev experience works. See docs/security.md for the production flow.
        email_verified=not _email_verification_required(),
    )
    db.add(user)
    db.flush()
    record_audit(db, user, "auth.register", "user", user.id, {"email": user.email},
                 ip=get_client_ip(request))
    db.commit()
    db.refresh(user)
    token = create_access_token(str(user.id), user.role.value)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


def _email_verification_required() -> bool:
    from ..config import settings
    return settings.email_enabled


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbDep, request: Request):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    # constant-ish behavior: same error whether user or password is wrong
    if user is None or not verify_password(payload.password, user.hashed_password):
        record_audit(db, None, "auth.login_failed", "user", None,
                     {"email": payload.email.lower()}, ip=get_client_ip(request))
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been deactivated")
    record_audit(db, user, "auth.login", "user", user.id, {}, ip=get_client_ip(request))
    db.commit()
    token = create_access_token(str(user.id), user.role.value)
    return TokenResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
def update_me(user: CurrentUser, payload: UserUpdate, db: DbDep):
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip()
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


from pydantic import BaseModel, Field


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(user: CurrentUser, payload: PasswordChangeRequest, db: DbDep, request: Request):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if len(payload.new_password) < 8 or not (
        any(c.isdigit() for c in payload.new_password) and any(c.isalpha() for c in payload.new_password)
    ):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "New password must be >=8 chars with letters and numbers")
    user.hashed_password = hash_password(payload.new_password)
    record_audit(db, user, "auth.password_changed", "user", user.id, {}, ip=get_client_ip(request))
    db.commit()
