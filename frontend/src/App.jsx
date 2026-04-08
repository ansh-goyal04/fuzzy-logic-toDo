/**
 * App.jsx — Root Dashboard Component
 * Adaptive Neuro-Fuzzy Productivity Suite
 *
 * Layout:
 *  - Top nav with branding + "New Task" button
 *  - Analytics ("The Reality Check") panel
 *  - Smart Task List with intervention UI
 *  - Task Creation Modal
 */

import { useState, useCallback, useRef } from 'react';
import Analytics from './components/Analytics';
import TaskList from './components/TaskList';
import TaskModal from './components/TaskModal';

export default function App() {
  const [modalOpen, setModalOpen] = useState(false);
  const [distractionDebt, setDistractionDebt] = useState(0);
  const taskListRef = useRef(null);

  // Force task list to refresh
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="min-h-screen bg-(--color-bg-primary)">
      {/* ─── Top Navigation ────────────────────────────────────────── */}
      <nav className="sticky top-0 z-40 bg-(--color-bg-primary)/80 backdrop-blur-xl border-b border-(--color-border-subtle)">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-(--color-accent-indigo) to-(--color-accent-productive) flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-(--color-accent-indigo)/25">
              NF
            </div>
            <div>
              <h1 className="text-base font-bold text-(--color-text-primary) tracking-tight">
                Neuro-Fuzzy Suite
              </h1>
              <p className="text-[10px] text-(--color-text-muted) uppercase tracking-widest">
                Adaptive Productivity Dashboard
              </p>
            </div>
          </div>

          {/* Actions */}
          <button
            id="new-task-btn"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-(--color-accent-indigo) to-(--color-accent-violet) text-white hover:opacity-90 active:scale-[0.97] transition-all cursor-pointer shadow-lg shadow-(--color-accent-indigo)/25"
          >
            <span className="text-base">+</span>
            New Task
          </button>
        </div>
      </nav>

      {/* ─── Main Content ──────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Analytics — "The Reality Check" */}
        <Analytics onDistractionUpdate={setDistractionDebt} />

        {/* Smart Task List */}
        <TaskList
          key={refreshKey}
          ref={taskListRef}
          distractionDebt={distractionDebt}
          onTaskChange={triggerRefresh}
        />
      </main>

      {/* ─── Task Creation Modal ───────────────────────────────────── */}
      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={triggerRefresh}
      />

      {/* ─── Footer ────────────────────────────────────────────────── */}
      <footer className="max-w-5xl mx-auto px-6 py-6 text-center">
        <p className="text-[10px] text-(--color-text-muted) uppercase tracking-widest">
          Adaptive Neuro-Fuzzy Productivity Suite · v0.1.0
        </p>
      </footer>
    </div>
  );
}
