-- ==========================================================================
-- schema.sql — Adaptive Neuro-Fuzzy Productivity Suite
-- Raw DDL for the SQLite database.
-- Mirrors the SQLAlchemy models in database/models.py.
--
-- Usage:
--   sqlite3 app.db < schema.sql
--
-- Notes:
--   • PRAGMA foreign_keys = ON must be set per-connection (see session.py).
--   • CHECK constraints enforce enum-like values since SQLite lacks ENUM.
--   • CASCADE deletes ensure referential integrity on subtask trees and
--     execution logs tied to deleted tasks.
-- ==========================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------------------------
-- Tasks
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    title               TEXT        NOT NULL,
    deadline            DATETIME,
    estimated_effort    INTEGER     NOT NULL DEFAULT 2
        CHECK (estimated_effort BETWEEN 1 AND 4),
    importance          INTEGER     NOT NULL DEFAULT 2
        CHECK (importance BETWEEN 1 AND 4),
    task_type           TEXT        NOT NULL DEFAULT 'general',
    status              TEXT        NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')),
    fuzzy_priority      REAL,
    parent_task_id      INTEGER
        REFERENCES tasks(id) ON DELETE CASCADE,
    created_at          DATETIME    NOT NULL DEFAULT (datetime('now')),
    updated_at          DATETIME    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline       ON tasks(deadline);

-- Trigger: auto-update updated_at on row modification
CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
    AFTER UPDATE ON tasks
    FOR EACH ROW
BEGIN
    UPDATE tasks SET updated_at = datetime('now') WHERE id = OLD.id;
END;


-- --------------------------------------------------------------------------
-- User Context (point-in-time cognitive state snapshots)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_context (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    current_energy      INTEGER     NOT NULL
        CHECK (current_energy BETWEEN 1 AND 4),
    stress_level        INTEGER     NOT NULL
        CHECK (stress_level BETWEEN 1 AND 3),
    timestamp           DATETIME    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_context_timestamp ON user_context(timestamp);


-- --------------------------------------------------------------------------
-- Distraction Logs (telemetry from Chrome extension)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS distraction_logs (
    id                  INTEGER     PRIMARY KEY AUTOINCREMENT,
    timestamp           DATETIME    NOT NULL DEFAULT (datetime('now')),
    duration_minutes    INTEGER     NOT NULL
        CHECK (duration_minutes >= 0),
    domain_name         TEXT        NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_distraction_logs_timestamp   ON distraction_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_distraction_logs_domain_name ON distraction_logs(domain_name);


-- --------------------------------------------------------------------------
-- Execution Logs (predicted vs actual effort — neuro-fuzzy training data)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS execution_logs (
    id                          INTEGER     PRIMARY KEY AUTOINCREMENT,
    task_id                     INTEGER     NOT NULL
        REFERENCES tasks(id) ON DELETE CASCADE,
    predicted_effort_minutes    INTEGER     NOT NULL
        CHECK (predicted_effort_minutes >= 0),
    actual_time_spent_minutes   INTEGER     NOT NULL
        CHECK (actual_time_spent_minutes >= 0),
    completed_at                DATETIME    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_task_id ON execution_logs(task_id);
