"""
main.py — FastAPI application entrypoint for the Neuro-Fuzzy Productivity Suite.

Responsibilities:
    1. Create the FastAPI app instance with metadata for OpenAPI docs.
    2. Register all API routers under the /api prefix.
    3. Configure CORS middleware for frontend development.
    4. Initialize the SQLite database (create tables) on startup.

Run with:
    uvicorn backend.main:app --reload --port 8000
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import context_router, tasks_router, telemetry_router
from backend.database.models import Base
from backend.database.session import engine


# ---------------------------------------------------------------------------
# Lifespan: startup / shutdown events
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan handler.

    On startup:  Create all database tables if they don't exist.
    On shutdown: Dispose of the engine connection pool.
    """
    # --- Startup ---
    Base.metadata.create_all(bind=engine)
    print("✔  Database tables created / verified.")
    yield
    # --- Shutdown ---
    engine.dispose()
    print("✔  Database engine disposed.")


# ---------------------------------------------------------------------------
# App instance
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Adaptive Neuro-Fuzzy Productivity Suite",
    description=(
        "Intelligent task prioritizer powered by fuzzy logic inference and "
        "passive browser telemetry. This API serves the web dashboard and "
        "ingests data from the Chrome telemetry extension."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


# ---------------------------------------------------------------------------
# CORS — allow the Vite dev server during local development
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",   # Vite default
        "http://localhost:3000",   # Common alternative
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------
API_PREFIX = "/api"

app.include_router(tasks_router, prefix=API_PREFIX)
app.include_router(telemetry_router, prefix=API_PREFIX)
app.include_router(context_router, prefix=API_PREFIX)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["System"], summary="Health check")
def health_check() -> dict[str, str]:
    """Returns 200 if the backend is running."""
    return {"status": "healthy", "service": "neuro-fuzzy-productivity-suite"}
