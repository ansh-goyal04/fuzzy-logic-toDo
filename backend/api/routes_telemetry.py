"""
api/routes_telemetry.py — Telemetry ingestion endpoints.

Accepts batch payloads of browsing-session data from the Chrome extension
and stores them as DistractionLog rows for the fuzzy engine to consume.
"""

from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.schemas import (
    DistractionLogResponse,
    TelemetrySyncPayload,
)
from backend.database.models import DistractionLog
from backend.database.session import get_db

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


# ---------------------------------------------------------------------------
# POST /telemetry/sync — Batch ingest telemetry from the extension
# ---------------------------------------------------------------------------
@router.post(
    "/sync",
    response_model=List[DistractionLogResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Batch-sync telemetry data from the Chrome extension",
)
def sync_telemetry(
    payload: TelemetrySyncPayload, db: Session = Depends(get_db)
) -> List[DistractionLog]:
    """
    Receive a batch of browsing telemetry entries and persist them.

    The Chrome extension buffers records in IndexedDB and periodically
    sends them here. Each entry contains:
    - **domain_name**: The domain visited (e.g., `reddit.com`).
    - **duration_minutes**: Time spent on that domain.
    - **timestamp**: When the session occurred.

    Returns the created records with their server-assigned IDs.
    """
    logs: List[DistractionLog] = []
    for entry in payload.entries:
        log = DistractionLog(
            domain_name=entry.domain_name,
            duration_minutes=entry.duration_minutes,
            timestamp=entry.timestamp,
        )
        db.add(log)
        logs.append(log)

    db.commit()

    # Refresh all to pick up server-generated IDs
    for log in logs:
        db.refresh(log)

    return logs


# ---------------------------------------------------------------------------
# GET /telemetry/logs — Retrieve distraction logs (for analytics)
# ---------------------------------------------------------------------------
@router.get(
    "/logs",
    response_model=List[DistractionLogResponse],
    summary="List distraction log entries",
)
def list_distraction_logs(
    limit: int = Query(100, ge=1, le=1000, description="Max records to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    db: Session = Depends(get_db),
) -> List[DistractionLog]:
    """
    Retrieve distraction log entries, ordered by most recent first.
    Supports simple limit/offset pagination.
    """
    stmt = (
        select(DistractionLog)
        .order_by(DistractionLog.timestamp.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(db.scalars(stmt).all())
