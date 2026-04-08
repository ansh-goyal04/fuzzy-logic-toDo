"""
database — SQLAlchemy models, session management, and schema definitions.

Re-exports the key symbols so consumers can do:
    from backend.database import Base, engine, get_db, SessionLocal
"""

from backend.database.models import (  # noqa: F401
    Base,
    DistractionLog,
    ExecutionLog,
    Task,
    UserContext,
)
from backend.database.session import SessionLocal, engine, get_db  # noqa: F401
