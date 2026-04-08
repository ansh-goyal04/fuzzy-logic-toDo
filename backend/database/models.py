"""
database/models.py — SQLAlchemy ORM models for the Neuro-Fuzzy Productivity Suite.

Tables
------
- Task              Core task entity with self-referential subtask hierarchy.
- UserContext        Point-in-time snapshot of user's cognitive/energy state.
- DistractionLog    Telemetry records ingested from the Chrome extension.
- ExecutionLog      Actual vs. predicted effort — training data for the
                    neuro-fuzzy adaptation loop.

Design notes
------------
- All models inherit from a shared `Base` declarative class.
- Timestamps use `func.now()` server defaults so the DB clock is authoritative.
- Self-referential FK on Task uses `ON DELETE CASCADE` so deleting a parent
  removes the entire subtask tree.
- Enums are stored as CHECK-constrained strings for SQLite compatibility
  (SQLite has no native ENUM type).
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


# ---------------------------------------------------------------------------
# Declarative base
# ---------------------------------------------------------------------------
class Base(DeclarativeBase):
    """Shared base class for all ORM models."""

    pass


# ---------------------------------------------------------------------------
# Task
# ---------------------------------------------------------------------------
class Task(Base):
    """
    Core task entity.

    Supports a self-referential parent → children hierarchy for subtasks.
    Deleting a parent cascades to all descendants.
    """

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    deadline: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    estimated_effort: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    importance: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False, default="general")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    fuzzy_priority: Mapped[Optional[float]] = mapped_column(default=None)

    # --- Self-referential subtask hierarchy ---
    parent_task_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    parent: Mapped[Optional["Task"]] = relationship(
        "Task",
        back_populates="subtasks",
        remote_side=[id],
    )
    subtasks: Mapped[List["Task"]] = relationship(
        "Task",
        back_populates="parent",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # --- Reverse relation to execution logs ---
    execution_logs: Mapped[List["ExecutionLog"]] = relationship(
        "ExecutionLog",
        back_populates="task",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # --- Timestamps ---
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "estimated_effort BETWEEN 1 AND 4",
            name="ck_tasks_estimated_effort_range",
        ),
        CheckConstraint(
            "importance BETWEEN 1 AND 4",
            name="ck_tasks_importance_range",
        ),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'done', 'cancelled')",
            name="ck_tasks_status_values",
        ),
    )

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status}')>"


# ---------------------------------------------------------------------------
# User Context
# ---------------------------------------------------------------------------
class UserContext(Base):
    """
    Point-in-time snapshot of the user's self-reported cognitive state.

    Recorded when the user explicitly updates their energy/stress via the
    dashboard. The fuzzy engine reads the *latest* record to factor user
    state into priority calculations.
    """

    __tablename__ = "user_context"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    current_energy: Mapped[int] = mapped_column(Integer, nullable=False)
    stress_level: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "current_energy BETWEEN 1 AND 4",
            name="ck_user_context_energy_range",
        ),
        CheckConstraint(
            "stress_level BETWEEN 1 AND 3",
            name="ck_user_context_stress_range",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<UserContext(id={self.id}, energy={self.current_energy}, "
            f"stress={self.stress_level})>"
        )


# ---------------------------------------------------------------------------
# Distraction Log
# ---------------------------------------------------------------------------
class DistractionLog(Base):
    """
    Telemetry record synced from the Chrome extension.

    Each row represents a single browsing session on a particular domain,
    with the duration recorded in minutes. The extension batches these and
    sends them via POST /telemetry/sync.
    """

    __tablename__ = "distraction_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    domain_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    __table_args__ = (
        CheckConstraint(
            "duration_minutes >= 0",
            name="ck_distraction_logs_duration_positive",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<DistractionLog(id={self.id}, domain='{self.domain_name}', "
            f"duration={self.duration_minutes}m)>"
        )


# ---------------------------------------------------------------------------
# Execution Log
# ---------------------------------------------------------------------------
class ExecutionLog(Base):
    """
    Tracks predicted vs. actual effort for completed tasks.

    This is the critical training data for the future neuro-fuzzy adaptation
    loop. By comparing predicted_effort_minutes to actual_time_spent_minutes,
    the system can learn to adjust its fuzzy membership functions over time.
    """

    __tablename__ = "execution_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    predicted_effort_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    actual_time_spent_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # --- Relationship back to task ---
    task: Mapped["Task"] = relationship("Task", back_populates="execution_logs")

    __table_args__ = (
        CheckConstraint(
            "predicted_effort_minutes >= 0",
            name="ck_execution_logs_predicted_positive",
        ),
        CheckConstraint(
            "actual_time_spent_minutes >= 0",
            name="ck_execution_logs_actual_positive",
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<ExecutionLog(id={self.id}, task_id={self.task_id}, "
            f"predicted={self.predicted_effort_minutes}m, "
            f"actual={self.actual_time_spent_minutes}m)>"
        )
