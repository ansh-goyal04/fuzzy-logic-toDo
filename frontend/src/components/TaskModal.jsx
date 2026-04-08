/**
 * TaskModal.jsx — Task Creation Modal
 *
 * Clean modal form to add new tasks with fuzzy variable inputs:
 *  - Title (text)
 *  - Deadline (date picker)
 *  - Estimated Effort (1-4 visual selector)
 *  - Importance (1-4 visual selector)
 */

import { useState } from 'react';
import { createTask } from '../services/api';

// ── Constants ───────────────────────────────────────────────────────────

const EFFORT_OPTIONS = [
  { value: 1, label: 'Trivial', icon: '⚡', desc: '< 15 min' },
  { value: 2, label: 'Moderate', icon: '📝', desc: '15–60 min' },
  { value: 3, label: 'Substantial', icon: '🔨', desc: '1–3 hours' },
  { value: 4, label: 'Epic', icon: '🏔️', desc: '3+ hours' },
];

const IMPORTANCE_OPTIONS = [
  { value: 1, label: 'Low', icon: '🔹', color: 'border-blue-400/30 bg-blue-400/5 text-blue-400' },
  { value: 2, label: 'Medium', icon: '🔸', color: 'border-yellow-400/30 bg-yellow-400/5 text-yellow-400' },
  { value: 3, label: 'High', icon: '🔺', color: 'border-orange-400/30 bg-orange-400/5 text-orange-400' },
  { value: 4, label: 'Critical', icon: '🔴', color: 'border-red-400/30 bg-red-400/5 text-red-400' },
];

// ── Component ───────────────────────────────────────────────────────────

export default function TaskModal({ isOpen, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState('');
  const [effort, setEffort] = useState(2);
  const [importance, setImportance] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        estimated_effort: effort,
        importance,
      };

      if (deadline) {
        // Send as ISO datetime
        payload.deadline = new Date(deadline).toISOString();
      }

      await createTask(payload);
      onCreated?.();
      handleClose();
    } catch (err) {
      console.error('[TaskModal] Create failed:', err);
      setError(err?.response?.data?.detail || 'Failed to create task.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setDeadline('');
    setEffort(2);
    setImportance(2);
    setError(null);
    onClose();
  };

  return (
    <div
      id="task-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg rounded-2xl bg-(--color-bg-modal) border border-(--color-border-default) shadow-(--shadow-lg) animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-(--color-border-subtle)">
          <div>
            <h3 className="text-lg font-bold text-(--color-text-primary)">
              New Task
            </h3>
            <p className="text-xs text-(--color-text-muted) mt-0.5">
              The fuzzy engine will auto-rank this after creation
            </p>
          </div>
          <button
            id="modal-close-btn"
            onClick={handleClose}
            className="text-(--color-text-muted) hover:text-(--color-text-primary) transition-colors cursor-pointer text-lg"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Title */}
          <div>
            <label
              htmlFor="task-title"
              className="block text-xs font-medium text-(--color-text-secondary) mb-1.5 uppercase tracking-wider"
            >
              Title
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-(--color-bg-input) border border-(--color-border-subtle) text-(--color-text-primary) text-sm placeholder:text-(--color-text-muted) focus:outline-none focus:border-(--color-border-focus) focus:ring-1 focus:ring-(--color-border-focus) transition-all"
            />
          </div>

          {/* Deadline */}
          <div>
            <label
              htmlFor="task-deadline"
              className="block text-xs font-medium text-(--color-text-secondary) mb-1.5 uppercase tracking-wider"
            >
              Deadline <span className="text-(--color-text-muted) normal-case">(optional)</span>
            </label>
            <input
              id="task-deadline"
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-(--color-bg-input) border border-(--color-border-subtle) text-(--color-text-primary) text-sm focus:outline-none focus:border-(--color-border-focus) focus:ring-1 focus:ring-(--color-border-focus) transition-all [color-scheme:dark]"
            />
          </div>

          {/* Effort Selector */}
          <div>
            <label className="block text-xs font-medium text-(--color-text-secondary) mb-2 uppercase tracking-wider">
              Estimated Effort
            </label>
            <div className="grid grid-cols-4 gap-2">
              {EFFORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  id={`effort-btn-${opt.value}`}
                  onClick={() => setEffort(opt.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 border ${
                    effort === opt.value
                      ? 'bg-(--color-accent-indigo)/15 border-(--color-accent-indigo)/40 text-(--color-accent-indigo) shadow-(--shadow-glow-indigo)'
                      : 'bg-(--color-bg-input) border-(--color-border-subtle) text-(--color-text-secondary) hover:border-(--color-border-default)'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-[9px] text-(--color-text-muted)">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Importance Selector */}
          <div>
            <label className="block text-xs font-medium text-(--color-text-secondary) mb-2 uppercase tracking-wider">
              Importance
            </label>
            <div className="grid grid-cols-4 gap-2">
              {IMPORTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  id={`importance-btn-${opt.value}`}
                  onClick={() => setImportance(opt.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 border ${
                    importance === opt.value
                      ? opt.color
                      : 'bg-(--color-bg-input) border-(--color-border-subtle) text-(--color-text-secondary) hover:border-(--color-border-default)'
                  }`}
                >
                  <span className="text-lg">{opt.icon}</span>
                  <span className="font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-(--color-text-secondary) bg-(--color-bg-input) border border-(--color-border-subtle) hover:bg-(--color-bg-card-hover) transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="task-submit-btn"
              disabled={submitting || !title.trim()}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-(--color-accent-indigo) to-(--color-accent-violet) text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-lg shadow-(--color-accent-indigo)/25"
            >
              {submitting ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
