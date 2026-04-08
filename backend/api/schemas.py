"""
api/schemas.py — Pydantic request/response models.

All data entering or leaving the API passes through these schemas for
strict validation and automatic OpenAPI documentation.

Naming convention:
    *Create   — request body for POST (creation)
    *Update   — request body for PATCH (partial update)
    *Response — serialized response shape
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ===========================================================================
# Task schemas
# ===========================================================================

class TaskCreate(BaseModel):
    """Schema for creating a new task."""

    title: str = Field(..., min_length=1, max_length=255, description="Task title")
    deadline: Optional[datetime] = Field(None, description="Due date/time (ISO 8601)")
    estimated_effort: int = Field(
        2, ge=1, le=4, description="Effort estimate: 1=trivial, 2=moderate, 3=substantial, 4=epic"
    )
    importance: int = Field(
        2, ge=1, le=4, description="Importance: 1=low, 2=medium, 3=high, 4=critical"
    )
    task_type: str = Field(
        "general", max_length=50, description="Category label (e.g., 'work', 'study', 'personal')"
    )
    status: Literal["pending", "in_progress", "done", "cancelled"] = Field(
        "pending", description="Initial task status"
    )
    parent_task_id: Optional[int] = Field(
        None, description="ID of parent task (for subtask hierarchy)"
    )


class TaskUpdate(BaseModel):
    """Schema for partially updating a task. All fields optional."""

    title: Optional[str] = Field(None, min_length=1, max_length=255)
    deadline: Optional[datetime] = None
    estimated_effort: Optional[int] = Field(None, ge=1, le=4)
    importance: Optional[int] = Field(None, ge=1, le=4)
    task_type: Optional[str] = Field(None, max_length=50)
    status: Optional[Literal["pending", "in_progress", "done", "cancelled"]] = None
    parent_task_id: Optional[int] = None


class TaskResponse(BaseModel):
    """Serialized task returned by the API."""

    id: int
    title: str
    deadline: Optional[datetime]
    estimated_effort: int
    importance: int
    task_type: str
    status: str
    fuzzy_priority: Optional[float]
    parent_task_id: Optional[int]
    subtasks: List["TaskResponse"] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ===========================================================================
# Telemetry / Distraction Log schemas
# ===========================================================================

class DistractionLogCreate(BaseModel):
    """Single telemetry record from the Chrome extension."""

    domain_name: str = Field(
        ..., min_length=1, max_length=255, description="Domain that was visited"
    )
    duration_minutes: int = Field(
        ..., ge=0, description="Time spent on this domain (minutes)"
    )
    timestamp: datetime = Field(
        ..., description="When the browsing session occurred (ISO 8601)"
    )


class TelemetrySyncPayload(BaseModel):
    """Batch payload sent by the extension on each sync cycle."""

    entries: List[DistractionLogCreate] = Field(
        ..., min_length=1, description="One or more telemetry records"
    )


class DistractionLogResponse(BaseModel):
    """Serialized distraction log returned by the API."""

    id: int
    timestamp: datetime
    duration_minutes: int
    domain_name: str

    model_config = {"from_attributes": True}


# ===========================================================================
# User Context schemas
# ===========================================================================

class UserContextCreate(BaseModel):
    """Payload for updating the user's current cognitive state."""

    current_energy: int = Field(
        ..., ge=1, le=4, description="Energy level: 1=drained, 2=low, 3=moderate, 4=energized"
    )
    stress_level: int = Field(
        ..., ge=1, le=3, description="Stress level: 1=calm, 2=moderate, 3=overwhelmed"
    )


class UserContextResponse(BaseModel):
    """Serialized user context snapshot."""

    id: int
    current_energy: int
    stress_level: int
    timestamp: datetime

    model_config = {"from_attributes": True}


# ===========================================================================
# Execution Log schemas
# ===========================================================================

class ExecutionLogCreate(BaseModel):
    """Record predicted vs actual effort for a completed task."""

    task_id: int = Field(..., description="ID of the completed task")
    predicted_effort_minutes: int = Field(..., ge=0)
    actual_time_spent_minutes: int = Field(..., ge=0)


class ExecutionLogResponse(BaseModel):
    """Serialized execution log."""

    id: int
    task_id: int
    predicted_effort_minutes: int
    actual_time_spent_minutes: int
    completed_at: datetime

    model_config = {"from_attributes": True}
