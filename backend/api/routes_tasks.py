"""
api/routes_tasks.py — Task CRUD endpoints.

Provides create, list, read, update, and delete operations on tasks.
Subtask hierarchy is handled via the parent_task_id field and cascade deletes.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.api.schemas import TaskCreate, TaskResponse, TaskUpdate
from backend.database.models import Task, UserContext, DistractionLog
from backend.database.session import get_db
from backend.fuzzy_engine.inference import TaskPrioritizer
from datetime import datetime
from sqlalchemy import func

router = APIRouter(prefix="/tasks", tags=["Tasks"])


# ---------------------------------------------------------------------------
# POST /tasks/ — Create a task
# ---------------------------------------------------------------------------
@router.post(
    "/",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new task",
)
def create_task(payload: TaskCreate, db: Session = Depends(get_db)) -> Task:
    """
    Create a new task (optionally as a subtask of an existing task).

    - **title**: Required. The task's display name.
    - **parent_task_id**: If provided, the new task becomes a subtask.
    """
    # Validate parent exists if specified
    if payload.parent_task_id is not None:
        parent = db.get(Task, payload.parent_task_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent task with id {payload.parent_task_id} not found.",
            )

    task = Task(**payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# GET /tasks/ — List all tasks
# ---------------------------------------------------------------------------
@router.get(
    "/",
    response_model=List[TaskResponse],
    summary="List all tasks",
)
def list_tasks(
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by status: pending, in_progress, done, cancelled",
    ),
    top_level_only: bool = Query(
        False,
        description="If true, return only root tasks (no parent). Subtasks are nested.",
    ),
    db: Session = Depends(get_db),
) -> List[Task]:
    """
    Retrieve tasks with optional filtering.

    When `top_level_only=true`, only root-level tasks are returned and their
    subtask trees are eagerly loaded via the `subtasks` relationship.
    """
    stmt = select(Task).options(selectinload(Task.subtasks))

    if status_filter:
        stmt = stmt.where(Task.status == status_filter)

    if top_level_only:
        stmt = stmt.where(Task.parent_task_id.is_(None))

    stmt = stmt.order_by(Task.created_at.desc())
    tasks = list(db.scalars(stmt).unique().all())

    # --- Run Fuzzy Engine ---
    try:
        prioritizer = TaskPrioritizer()
        
        # 1. Get latest context
        ctx_stmt = select(UserContext).order_by(UserContext.timestamp.desc()).limit(1)
        latest_ctx = db.scalars(ctx_stmt).first()
        energy_val = latest_ctx.current_energy if latest_ctx else 4
        stress_val = latest_ctx.stress_level if latest_ctx else 1
        
        energy_map = {1: 2, 2: 4, 3: 7, 4: 9}
        stress_map = {1: 2, 2: 6, 3: 9}
        inf_energy = energy_map.get(energy_val, 7)
        inf_stress = stress_map.get(stress_val, 2)
        
        # 2. Distraction debt
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        dist_stmt = select(func.sum(DistractionLog.duration_minutes)).where(DistractionLog.timestamp >= today)
        distraction_debt = db.scalar(dist_stmt) or 0
        
        effort_map = {1: 1, 2: 4, 3: 6, 4: 8}
        importance_map = {1: 2, 2: 5, 3: 8, 4: 10}
        
        now = datetime.now()
        for t in tasks:
            if t.status in ("done", "cancelled"):
                continue
                
            inf_effort = effort_map.get(t.estimated_effort, 4)
            inf_importance = importance_map.get(t.importance, 5)
            
            deadline_val = 30
            if t.deadline:
                delta = (t.deadline - now).total_seconds() / 86400
                deadline_val = max(0, min(30, delta))
                
            try:
                t.fuzzy_priority = prioritizer.calculate_priority(
                    deadline_val=deadline_val,
                    effort_val=inf_effort,
                    energy_val=inf_energy,
                    importance_val=inf_importance,
                    stress_val=inf_stress,
                    distraction_val=distraction_debt
                )
            except Exception:
                pass
                
        db.commit()
    except Exception as e:
        print(f"Error computing fuzzy priorities: {e}")

    return tasks


# ---------------------------------------------------------------------------
# GET /tasks/{task_id} — Get a single task
# ---------------------------------------------------------------------------
@router.get(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Get a single task by ID",
)
def get_task(task_id: int, db: Session = Depends(get_db)) -> Task:
    """Retrieve a single task by its ID, including nested subtasks."""
    stmt = (
        select(Task)
        .options(selectinload(Task.subtasks))
        .where(Task.id == task_id)
    )
    task = db.scalars(stmt).unique().one_or_none()
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found.",
        )
    return task


# ---------------------------------------------------------------------------
# PATCH /tasks/{task_id} — Update a task
# ---------------------------------------------------------------------------
@router.patch(
    "/{task_id}",
    response_model=TaskResponse,
    summary="Partially update a task",
)
def update_task(
    task_id: int, payload: TaskUpdate, db: Session = Depends(get_db)
) -> Task:
    """
    Update one or more fields on an existing task.

    Only fields present in the request body are modified; all others
    remain unchanged.
    """
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found.",
        )

    update_data = payload.model_dump(exclude_unset=True)

    # Validate new parent if being re-parented
    if "parent_task_id" in update_data and update_data["parent_task_id"] is not None:
        if update_data["parent_task_id"] == task_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A task cannot be its own parent.",
            )
        parent = db.get(Task, update_data["parent_task_id"])
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent task with id {update_data['parent_task_id']} not found.",
            )

    for field, value in update_data.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)
    return task


# ---------------------------------------------------------------------------
# DELETE /tasks/{task_id} — Delete a task
# ---------------------------------------------------------------------------
@router.delete(
    "/{task_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a task (cascades to subtasks)",
)
def delete_task(task_id: int, db: Session = Depends(get_db)) -> None:
    """
    Delete a task by ID.

    If the task has subtasks, they are also deleted via cascade.
    """
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task with id {task_id} not found.",
        )

    db.delete(task)
    db.commit()
