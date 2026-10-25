"""SmartPetition FastAPI application entrypoint."""
import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .background import feedback_reminder_scheduler, sla_scheduler
from .config import settings
from .database import init_db
from .rate_limit import rate_limit_middleware_factory
from .routers import admin, ai, analytics, auth, departments, grievances, health, notifications
from .services.ai_classifier import classifier

# --- structured logging -----------------------------------------------------
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("smartpetition")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting SmartPetition backend (env=%s, db=%s)",
             settings.environment, "sqlite" if settings.is_sqlite else "postgresql")
    init_db()

    # First-run seeding for local development (idempotent).
    if settings.environment == "development":
        from .database import SessionLocal
        from .seed import seed
        db = SessionLocal()
        try:
            seed(db)
        finally:
            db.close()

    classifier.load()
    log.info("AI model: %s (%s)", classifier.version,
             "trained model" if classifier.available else "rule-based FALLBACK")

    stop_event = asyncio.Event()
    tasks = [
        asyncio.create_task(sla_scheduler(stop_event), name="sla-scheduler"),
        asyncio.create_task(feedback_reminder_scheduler(stop_event), name="feedback-reminders"),
    ]
    try:
        yield
    finally:
        stop_event.set()
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        log.info("SmartPetition backend stopped")


app = FastAPI(
    title="SmartPetition API",
    version="1.0.0",
    description="Automated Grievance Management System using AI and DevOps. "
                "Interactive docs: /docs. All endpoints are versioned under /api/v1.",
    lifespan=lifespan,
)


# TEMPORARY DIAGNOSTIC (dev only): shows whether browser requests actually
# carry the Authorization header, to trace the preview-proxy auth issue.
@app.middleware("http")
async def _debug_auth_headers(request: Request, call_next):
    if request.url.path.startswith("/api/v1/") and request.method == "GET":
        auth = request.headers.get("authorization", "")
        carriers = []
        if auth.startswith("Bearer "):
            carriers.append(f"auth:{auth[7:19]}…")
        if request.headers.get("x-auth-token"):
            carriers.append(f"xat:{request.headers.get('x-auth-token')[:12]}…")
        if request.query_params.get("access_token"):
            carriers.append(f"q:{request.query_params.get('access_token')[:12]}…")
        dbg = logging.getLogger("smartpetition.debug")
        dbg.info(
            "AUTHDEBUG %s %s carriers=%s ua=%s",
            request.method, request.url.path,
            carriers or "NONE",
            request.headers.get("user-agent", "")[:60],
        )
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # bearer tokens in Authorization header, not cookies -> no CSRF surface
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# rate limiting on sensitive endpoints
app.middleware("http")(rate_limit_middleware_factory({
    "/api/v1/auth/login": (settings.rate_limit_auth_per_minute, 1),
    "/api/v1/auth/register": (settings.rate_limit_auth_per_minute, 1),
    "/api/v1/grievances": (settings.rate_limit_submit_per_minute, 1),
}))


# --- consistent error envelope ------------------------------------------------
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    errors = []
    for e in exc.errors():
        loc = ".".join(str(x) for x in e["loc"] if x not in ("body", "query"))
        errors.append({"field": loc or "request", "message": e["msg"]})
    return JSONResponse(status_code=422, content={"detail": "Validation failed", "errors": errors})


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    if settings.environment == "production":
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
    return JSONResponse(status_code=500,
                        content={"detail": f"Internal server error: {type(exc).__name__}: {exc}"})


# --- routes --------------------------------------------------------------------
API = "/api/v1"
app.include_router(health.router, prefix=API)
app.include_router(auth.router, prefix=API)
app.include_router(grievances.router, prefix=API)
app.include_router(ai.router, prefix=API)
app.include_router(departments.router, prefix=API)
app.include_router(analytics.router, prefix=API)
app.include_router(admin.router, prefix=API)
app.include_router(notifications.router, prefix=API)


@app.get("/")
def root():
    return {"app": "SmartPetition", "docs": "/docs", "api": API, "health": f"{API}/health"}
