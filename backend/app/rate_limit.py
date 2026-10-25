"""Simple in-memory sliding-window rate limiter for sensitive endpoints.

Keyed by (client IP, bucket). Good enough for a single-process local/dev
deployment; documented in docs/security.md (use Redis-backed limiting for
multi-instance production).
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque] = defaultdict(deque)

    def check(self, key: str, max_hits: int, window_seconds: int = 60) -> None:
        now = time.monotonic()
        dq = self._hits[key]
        while dq and now - dq[0] > window_seconds:
            dq.popleft()
        if len(dq) >= max_hits:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many requests. Please wait a minute and try again.",
                headers={"Retry-After": str(window_seconds)},
            )
        dq.append(now)


limiter = RateLimiter()


def rate_limit_middleware_factory(rules: dict[str, tuple[int, int]]):
    """rules: path-prefix -> (max_hits_per_minute, enabled)."""
    async def middleware(request: Request, call_next):
        if request.method == "POST":
            for prefix, (max_hits, _) in rules.items():
                if request.url.path.startswith(prefix):
                    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() \
                        or (request.client.host if request.client else "unknown")
                    try:
                        limiter.check(f"{prefix}:{ip}", max_hits)
                    except HTTPException as exc:
                        from fastapi.responses import JSONResponse
                        return JSONResponse(status_code=exc.status_code,
                                            content={"detail": exc.detail},
                                            headers=exc.headers)
                    break
        return await call_next(request)
    return middleware
