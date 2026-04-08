"""
api/routes_context.py — User context endpoints.

Allows the dashboard to update and read the user's current cognitive state
(energy level, stress level). The fuzzy engine reads the latest snapshot
when computing task priorities.
"""

from typing import List

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.api.schemas import UserContextCreate, UserContextResponse
from backend.database.models import UserContext
from backend.database.session import get_db

router = APIRouter(prefix="/context", tags=["User Context"])


# ---------------------------------------------------------------------------
# POST /context/update — Record a new user-context snapshot
# ---------------------------------------------------------------------------
@router.post(
    "/update",
    response_model=UserContextResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Update the user's current energy and stress levels",
)
def update_user_context(
    payload: UserContextCreate, db: Session = Depends(get_db)
) -> UserContext:
    """
    Record a new point-in-time snapshot of the user's cognitive state.

    This does **not** overwrite previous entries — each update appends a new
    row, preserving a time-series history. The fuzzy engine always reads
    the most recent entry.

    - **current_energy**: 1 (drained) → 4 (energized)
    - **stress_level**: 1 (calm) → 3 (overwhelmed)
    """
    ctx = UserContext(
        current_energy=payload.current_energy,
        stress_level=payload.stress_level,
    )
    db.add(ctx)
    db.commit()
    db.refresh(ctx)
    return ctx


# ---------------------------------------------------------------------------
# GET /context/latest — Get the most recent context snapshot
# ---------------------------------------------------------------------------
@router.get(
    "/latest",
    response_model=UserContextResponse | None,
    summary="Get the latest user context snapshot",
)
def get_latest_context(db: Session = Depends(get_db)) -> UserContext | None:
    """
    Return the most recently recorded user context, or null if none exists.

    The fuzzy engine calls this to determine how user state should
    influence task priority scores.
    """
    stmt = select(UserContext).order_by(UserContext.timestamp.desc()).limit(1)
    return db.scalars(stmt).first()


# ---------------------------------------------------------------------------
# GET /context/history — Historical context entries
# ---------------------------------------------------------------------------
@router.get(
    "/history",
    response_model=List[UserContextResponse],
    summary="List user context history",
)
def get_context_history(
    limit: int = Query(50, ge=1, le=500, description="Max records to return"),
    db: Session = Depends(get_db),
) -> List[UserContext]:
    """
    Return a time-descending list of user context snapshots.

    Useful for the dashboard to show energy/stress trends over time.
    """
    stmt = (
        select(UserContext)
        .order_by(UserContext.timestamp.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
