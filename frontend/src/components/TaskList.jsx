/**
 * TaskList.jsx — "The Smart Task List" with Intervention UI
 *
 * Features:
 *  - Renders tasks sorted by fuzzy priority (backend pre-sorted)
 *  - INTERVENTION MODE: when distraction debt > 30 min:
 *      → Fades out high-effort tasks (opacity reduction)
 *      → Highlights the lowest-effort task with a glowing border
 *      → Shows motivational prompt
 *  - Status toggle (pending → in_progress → done)
 *  - Delete task
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchTasks, updateTask, deleteTask } from '../services/api';

// ── Constants ───────────────────────────────────────────────────────────

const EFFORT_LABELS = ['', 'Trivial', 'Moderate', 'Substantial', 'Epic'];
const IMPORTANCE_LABELS = ['', 'Low', 'Medium', 'High', 'Critical'];
const STATUS_FLOW = { pending: 'in_progress', in_progress: 'done', done: 'pending' };
const STATUS_ICONS = { pending: '○', in_progress: '◐', done: '●', cancelled: '✕' };
const STATUS_COLORS = {
  pending: 'text-(--color-text-muted)',
  in_progress: 'text-(--color-accent-warning)',
  done: 'text-(--color-accent-productive)',
  cancelled: 'text-(--color-accent-distraction)',
};

const DISTRACTION_THRESHOLD = 30; // minutes

// ── Component ───────────────────────────────────────────────────────────

export default function TaskList({ distractionDebt, onTaskChange }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isIntervention = distractionDebt > DISTRACTION_THRESHOLD;

  // Find the "quick win" — lowest effort among pending/in-progress tasks
  const quickWinId = (() => {
    if (!isIntervention) return null;
    const candidates = tasks.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled'
    );
    if (candidates.length === 0) return null;
    const lowest = candidates.reduce((min, t) =>
      t.estimated_effort < min.estimated_effort ? t : min
    );
    return lowest.id;
  })();

  // ── Fetch tasks ────────────────────────────────────────────────────

  const loadTasks = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchTasks({ top_level_only: true });
      // Sort by fuzzy_priority descending (highest priority first)
      data.sort((a, b) => (b.fuzzy_priority ?? 0) - (a.fuzzy_priority ?? 0));
      setTasks(data);
    } catch (err) {
      console.error('[TaskList] Failed to load tasks:', err);
      setError('Could not load tasks. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ── Handlers ───────────────────────────────────────────────────────

  const handleStatusToggle = async (task) => {
    const nextStatus = STATUS_FLOW[task.status] || 'pending';
    try {
      await updateTask(task.id, { status: nextStatus });
      await loadTasks();
      onTaskChange?.();
    } catch (err) {
      console.error('[TaskList] Status update failed:', err);
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await deleteTask(taskId);
      await loadTasks();
      onTaskChange?.();
    } catch (err) {
      console.error('[TaskList] Delete failed:', err);
    }
  };

  // ── Render helpers ─────────────────────────────────────────────────

  const getPriorityBadge = (score) => {
    if (score == null) return { label: '—', cls: 'bg-(--color-bg-input) text-(--color-text-muted)' };
    if (score >= 75) return { label: 'Critical', cls: 'bg-red-500/15 text-red-400' };
    if (score >= 50) return { label: 'High', cls: 'bg-orange-500/15 text-orange-400' };
    if (score >= 25) return { label: 'Medium', cls: 'bg-yellow-500/15 text-yellow-400' };
    return { label: 'Low', cls: 'bg-green-500/15 text-green-400' };
  };

  const formatDeadline = (deadline) => {
    if (!deadline) return null;
    const d = new Date(deadline);
    const now = new Date();
    const diffH = (d - now) / (1000 * 60 * 60);

    if (diffH < 0) return { text: 'Overdue', cls: 'text-red-400' };
    if (diffH < 24) return { text: `${Math.round(diffH)}h left`, cls: 'text-orange-400' };
    if (diffH < 72) return { text: `${Math.round(diffH / 24)}d left`, cls: 'text-yellow-400' };
    return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), cls: 'text-(--color-text-muted)' };
  };

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="rounded-2xl bg-(--color-bg-card) border border-(--color-border-subtle) p-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-(--color-bg-input) animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="task-list-section"
      className="animate-fade-in rounded-2xl bg-(--color-bg-card) border border-(--color-border-subtle) p-6 shadow-(--shadow-card)"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-(--color-text-primary)">
            Smart Task List
          </h2>
          <p className="text-xs text-(--color-text-muted) mt-0.5">
            Ranked by Fuzzy Inference Engine
          </p>
        </div>
        <span className="text-xs text-(--color-text-muted) bg-(--color-bg-input) px-3 py-1 rounded-full">
          {tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length} active
        </span>
      </div>

      {/* Intervention Banner */}
      {isIntervention && (
        <div
          id="intervention-banner"
          className="mb-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/20 animate-slide-up"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl mt-0.5">⚡</span>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                Distraction detected — {distractionDebt} min of debt today
              </p>
              <p className="text-xs text-amber-200/70 mt-1">
                Let's knock out a quick win to build momentum. The highlighted
                task below is the fastest to complete.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Task list */}
      {tasks.length === 0 ? (
        <div className="text-center py-12 text-(--color-text-muted)">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm">No tasks yet. Create your first task to get started.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task, index) => {
            const isQuickWin = task.id === quickWinId;
            const isHighEffort = task.estimated_effort >= 3;
            const isDone = task.status === 'done' || task.status === 'cancelled';
            const priority = getPriorityBadge(task.fuzzy_priority);
            const deadline = formatDeadline(task.deadline);

            // Intervention CSS logic
            const interventionStyles = isIntervention && !isDone
              ? isQuickWin
                ? 'ring-2 ring-(--color-accent-productive) animate-pulse-glow'
                : isHighEffort
                  ? 'opacity-40'
                  : ''
              : '';

            return (
              <li
                key={task.id}
                id={`task-item-${task.id}`}
                className={`group relative flex items-center gap-3 p-3.5 rounded-xl transition-all duration-300 border ${
                  isDone
                    ? 'bg-(--color-bg-input)/50 border-transparent opacity-50'
                    : 'bg-(--color-bg-input) border-(--color-border-subtle) hover:border-(--color-border-default) hover:bg-(--color-bg-card-hover)'
                } ${interventionStyles}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Status toggle */}
                <button
                  id={`task-status-${task.id}`}
                  onClick={() => handleStatusToggle(task)}
                  className={`flex-shrink-0 text-lg cursor-pointer transition-colors duration-200 ${STATUS_COLORS[task.status]} hover:text-(--color-accent-indigo)`}
                  title={`Status: ${task.status}`}
                >
                  {STATUS_ICONS[task.status]}
                </button>

                {/* Task content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm font-medium truncate ${
                        isDone ? 'line-through text-(--color-text-muted)' : 'text-(--color-text-primary)'
                      }`}
                    >
                      {task.title}
                    </p>
                    {isQuickWin && isIntervention && (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-(--color-accent-productive) bg-(--color-accent-productive)/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                        Quick Win
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-(--color-text-muted)">
                      Effort: {EFFORT_LABELS[task.estimated_effort]}
                    </span>
                    <span className="text-[10px] text-(--color-text-muted)">
                      Imp: {IMPORTANCE_LABELS[task.importance]}
                    </span>
                    {deadline && (
                      <span className={`text-[10px] ${deadline.cls}`}>
                        {deadline.text}
                      </span>
                    )}
                  </div>
                </div>

                {/* Priority badge */}
                <span
                  className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full ${priority.cls}`}
                >
                  {task.fuzzy_priority != null ? Math.round(task.fuzzy_priority) : '—'}
                </span>

                {/* Delete button */}
                <button
                  id={`task-delete-${task.id}`}
                  onClick={() => handleDelete(task.id)}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 text-(--color-text-muted) hover:text-(--color-accent-distraction) transition-all duration-200 cursor-pointer text-sm"
                  title="Delete task"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
