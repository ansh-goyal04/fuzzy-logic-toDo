"""
database/session.py — SQLAlchemy engine, session factory, and dependency injection.

This module configures the SQLite connection and provides a reusable
`get_db` dependency for FastAPI route handlers. All database interactions
flow through the session created here.
"""

from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

# ---------------------------------------------------------------------------
# Database file location — stored alongside the backend package
# ---------------------------------------------------------------------------
_DB_DIR = Path(__file__).resolve().parent
_DB_PATH = _DB_DIR / "app.db"
DATABASE_URL = f"sqlite:///{_DB_PATH}"

# ---------------------------------------------------------------------------
# Engine configuration
# ---------------------------------------------------------------------------
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Required for SQLite + FastAPI
    echo=False,  # Set True for SQL debug logging
)


# Enable SQLite foreign key enforcement (off by default in SQLite)
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # noqa: ANN001
    """Ensure every connection to SQLite enforces foreign key constraints."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a SQLAlchemy session.

    Usage in route handlers:
        @router.get("/example")
        def example(db: Session = Depends(get_db)):
            ...

    The session is automatically closed after the request completes,
    even if an exception is raised.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
