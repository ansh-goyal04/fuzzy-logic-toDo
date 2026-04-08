/**
 * Analytics.jsx — "The Reality Check" Dashboard Component
 *
 * Displays:
 *  - Deep Work vs Distraction Debt donut chart (Recharts)
 *  - Numerical breakdown in minutes
 *  - Energy & stress quick-toggle sliders
 *  - Backend connection indicator
 */

import { useState, useEffect, useCallback } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import {
  fetchTelemetryLogs,
  fetchLatestContext,
  updateUserContext,
  checkHealth,
} from '../services/api';

// ── Constants ───────────────────────────────────────────────────────────

const ENERGY_LABELS = ['', 'Exhausted', 'Low', 'Moderate', 'Focused'];
const ENERGY_EMOJIS = ['', '😩', '😐', '🙂', '⚡'];
const STRESS_LABELS = ['', 'Calm', 'Moderate', 'Overwhelmed'];
const STRESS_EMOJIS = ['', '😌', '😬', '🤯'];

const CHART_COLORS = {
  productive: '#34d399',
  distraction: '#f87171',
  neutral: '#4b5563',
};

// ── Helper: aggregate telemetry into productive / distraction minutes ──

const DISTRACTION_DOMAINS = [
  'youtube.com', 'twitter.com', 'reddit.com',
  'instagram.com', 'facebook.com', 'netflix.com',
  'tiktok.com', 'twitch.tv',
];

function aggregateTelemetry(logs) {
  let deepWork = 0;
  let distractionDebt = 0;

  for (const log of logs) {
    const domain = (log.domain_name || '').toLowerCase();
    const isDistraction = DISTRACTION_DOMAINS.some(
      (d) => domain === d || domain.endsWith('.' + d)
    );
    if (isDistraction) {
      distractionDebt += log.duration_minutes || 0;
    } else {
      deepWork += log.duration_minutes || 0;
    }
  }

  return { deepWork, distractionDebt };
}

// ── Component ───────────────────────────────────────────────────────────

export default function Analytics({ onDistractionUpdate }) {
  const [deepWork, setDeepWork] = useState(0);
  const [distractionDebt, setDistractionDebt] = useState(0);
  const [energy, setEnergy] = useState(3);
  const [stress, setStress] = useState(1);
  const [backendOnline, setBackendOnline] = useState(null);
  const [saving, setSaving] = useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [logs, ctx, health] = await Promise.all([
        fetchTelemetryLogs({ limit: 500 }),
        fetchLatestContext(),
        checkHealth(),
      ]);

      const { deepWork: dw, distractionDebt: dd } = aggregateTelemetry(logs);
      setDeepWork(dw);
      setDistractionDebt(dd);
      onDistractionUpdate?.(dd);
      setBackendOnline(health);

      if (ctx) {
        setEnergy(ctx.current_energy);
        setStress(ctx.stress_level);
      }
    } catch (err) {
      console.error('[Analytics] Failed to load data:', err);
      setBackendOnline(false);
    }
  }, [onDistractionUpdate]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Context updates ────────────────────────────────────────────────

  const handleContextUpdate = async (newEnergy, newStress) => {
    setSaving(true);
    try {
      await updateUserContext({
        current_energy: newEnergy,
        stress_level: newStress,
      });
      setEnergy(newEnergy);
      setStress(newStress);
    } catch (err) {
      console.error('[Analytics] Context update failed:', err);
    } finally {
      setSaving(false);
    }
  };

  // ── Chart data ─────────────────────────────────────────────────────

  const total = deepWork + distractionDebt;
  const focusPercent = total > 0 ? Math.round((deepWork / total) * 100) : 0;

  const chartData = [
    { name: 'Deep Work', value: deepWork || 0, color: CHART_COLORS.productive },
    { name: 'Distraction', value: distractionDebt || 0, color: CHART_COLORS.distraction },
  ];

  // If there's no data at all, show a placeholder slice
  if (total === 0) {
    chartData[0].value = 1;
    chartData[0].color = CHART_COLORS.neutral;
    chartData[1].value = 0;
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <section
      id="analytics-section"
      className="animate-fade-in rounded-2xl bg-(--color-bg-card) border border-(--color-border-subtle) p-6 shadow-(--shadow-card)"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-(--color-text-primary)">
            The Reality Check
          </h2>
          <p className="text-xs text-(--color-text-muted) mt-0.5">
            Your cognitive state at a glance
          </p>
        </div>

        {/* Backend status dot */}
        <div className="flex items-center gap-2 text-xs text-(--color-text-secondary)">
          <span
            className={`w-2 h-2 rounded-full ${
              backendOnline === null
                ? 'bg-(--color-accent-warning) animate-pulse'
                : backendOnline
                  ? 'bg-(--color-accent-productive)'
                  : 'bg-(--color-accent-distraction)'
            }`}
          />
          {backendOnline === null
            ? 'Checking…'
            : backendOnline
              ? 'Backend Online'
              : 'Backend Offline'}
        </div>
      </div>

      {/* Main grid: Chart + Stats + Context */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Donut Chart */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-40 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#1a1a26',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#e8e8f0',
                  }}
                  formatter={(value) => [`${value} min`, null]}
                />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-(--color-text-primary)">
                {total > 0 ? `${focusPercent}%` : '—'}
              </span>
              <span className="text-[10px] text-(--color-text-muted) uppercase tracking-wider">
                Focused
              </span>
            </div>
          </div>
        </div>

        {/* Numeric Stats */}
        <div className="flex flex-col justify-center gap-4">
          {/* Deep Work */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-(--color-accent-productive)/10 flex items-center justify-center text-lg">
              🧠
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-0.5">
                Deep Work
              </p>
              <p className="text-xl font-bold text-(--color-accent-productive)">
                {deepWork} <span className="text-xs font-normal text-(--color-text-muted)">min</span>
              </p>
            </div>
          </div>

          {/* Distraction Debt */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-(--color-accent-distraction)/10 flex items-center justify-center text-lg">
              📱
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-0.5">
                Distraction Debt
              </p>
              <p className="text-xl font-bold text-(--color-accent-distraction)">
                {distractionDebt} <span className="text-xs font-normal text-(--color-text-muted)">min</span>
              </p>
            </div>
          </div>
        </div>

        {/* Energy & Stress Toggles */}
        <div className="flex flex-col justify-center gap-5 md:border-l md:border-t-0 border-t border-(--color-border-subtle) md:pl-6 pt-6 md:pt-0">
          {/* Energy */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-2">
              Energy Level
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((level) => (
                <button
                  key={level}
                  id={`energy-btn-${level}`}
                  disabled={saving}
                  onClick={() => handleContextUpdate(level, stress)}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer border ${
                    energy === level
                      ? 'bg-(--color-accent-indigo)/20 border-(--color-accent-indigo)/40 text-(--color-accent-indigo) shadow-(--shadow-glow-indigo)'
                      : 'bg-(--color-bg-input) border-(--color-border-subtle) text-(--color-text-secondary) hover:border-(--color-border-default)'
                  }`}
                  title={ENERGY_LABELS[level]}
                >
                  <span className="block text-base mb-0.5">{ENERGY_EMOJIS[level]}</span>
                  <span className="block text-[9px] leading-tight">{ENERGY_LABELS[level]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Stress */}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-(--color-text-muted) mb-2">
              Stress Level
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((level) => (
                <button
                  key={level}
                  id={`stress-btn-${level}`}
                  disabled={saving}
                  onClick={() => handleContextUpdate(energy, level)}
                  className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer border ${
                    stress === level
                      ? 'bg-(--color-accent-violet)/20 border-(--color-accent-violet)/40 text-(--color-accent-violet)'
                      : 'bg-(--color-bg-input) border-(--color-border-subtle) text-(--color-text-secondary) hover:border-(--color-border-default)'
                  }`}
                  title={STRESS_LABELS[level]}
                >
                  <span className="block text-base mb-0.5">{STRESS_EMOJIS[level]}</span>
                  <span className="block text-[9px] leading-tight">{STRESS_LABELS[level]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
