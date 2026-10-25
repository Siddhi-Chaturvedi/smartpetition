"""FastAPI dependencies: DB session, current user, role guards."""
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import Role, User
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)
DbDep = Annotated[Session, Depends(get_db)]


def _extract_token(request: Request, credentials: HTTPAuthorizationCredentials | None) -> str | None:
    """Accept the session token via (in order): Authorization: Bearer,
    X-Auth-Token header, or ?access_token= query param.

    The extra carriers exist because some hosting/proxy layers in front of
    dev previews strip or rewrite the Authorization header; the query-param
    form is only ever used by the frontend as a last-resort retry.
    """
    if credentials is not None:
        return credentials.credentials
    header_token = request.headers.get("x-auth-token")
    if header_token:
        return header_token
    query_token = request.query_params.get("access_token")
    if query_token:
        return query_token
    return None


def get_current_user(
    request: Request,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    token = _extract_token(request, credentials)
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated",
                            headers={"WWW-Authenticate": "Bearer"})
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token",
                            headers={"WWW-Authenticate": "Bearer"})
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or deactivated")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient permissions")
        return user
    return checker


RequireAdmin = Annotated[User, Depends(require_roles(Role.admin))]
RequireOfficerOrAdmin = Annotated[User, Depends(require_roles(Role.officer, Role.admin))]
RequireCitizen = Annotated[User, Depends(require_roles(Role.citizen))]


def get_client_ip(request) -> str:  # noqa: ANN001
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""
