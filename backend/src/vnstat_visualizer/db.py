from typing import Any

from sqlalchemy import Engine, MetaData, create_engine, event, text
from sqlalchemy.orm import DeclarativeBase

from vnstat_visualizer.config import settings


class Base(DeclarativeBase):
    # SQLite has no schemas, so every table is namespaced with the "vnstat_" prefix instead.
    metadata = MetaData()

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        if settings.database_url.startswith("sqlite"):
            engine = create_engine(
                settings.database_url,
                pool_pre_ping=True,
                connect_args={"check_same_thread": False, "timeout": 30},
            )

            # The API and the UDP worker are separate processes sharing one file.
            @event.listens_for(engine, "connect")
            def set_pragmas(dbapi_conn: Any, _record: Any) -> None:
                cur = dbapi_conn.cursor()
                cur.execute("PRAGMA journal_mode=WAL")
                cur.execute("PRAGMA busy_timeout=30000")
                cur.close()

        else:
            engine = create_engine(
                settings.database_url,
                pool_pre_ping=True,
                pool_size=settings.db_pool_size,
                max_overflow=settings.db_max_overflow,
            )
        _engine = engine
    return _engine


def check_database() -> tuple[bool, str]:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "ok"
    except Exception as exc:  # noqa: BLE001
        return False, f"database check failed: {type(exc).__name__}"
