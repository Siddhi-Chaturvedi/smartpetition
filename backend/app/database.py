"""SQLAlchemy engine / session management. Works with SQLite and PostgreSQL."""
from collections.abc import Generator
from datetime import datetime, timezone

from sqlalchemy import create_engine, event, types
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class UTCDateTime(types.TypeDecorator):
    """Timezone-aware DateTime that works identically on SQLite and PostgreSQL.

    SQLite stores naive datetimes; this decorator always returns UTC-aware
    values so comparisons never raise 'naive vs aware' errors.
    """

    impl = types.DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):  # noqa: ANN001, ANN201
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    def process_result_value(self, value, dialect):  # noqa: ANN001, ANN201
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
_db_url = settings.database_url
if not settings.is_sqlite and "sslmode" not in _db_url:
    _db_url += ("&" if "?" in _db_url else "?") + "sslmode=require"
engine = create_engine(_db_url, connect_args=connect_args, future=True)

if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):  # noqa: ANN001
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables (used for SQLite local mode; Alembic for PostgreSQL)."""
    from . import models  # noqa: F401  (register mappers)

    Base.metadata.create_all(bind=engine)
