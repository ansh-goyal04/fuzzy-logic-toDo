"""
api — FastAPI route handlers and Pydantic schemas.

Re-exports all routers for convenient registration in main.py.
"""

from backend.api.routes_context import router as context_router  # noqa: F401
from backend.api.routes_tasks import router as tasks_router  # noqa: F401
from backend.api.routes_telemetry import router as telemetry_router  # noqa: F401
