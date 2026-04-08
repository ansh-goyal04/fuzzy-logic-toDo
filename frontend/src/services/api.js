/**
 * api.js — Centralized API client for the Neuro-Fuzzy Productivity Suite.
 *
 * All backend communication flows through this module. In development,
 * Vite's proxy forwards `/api` to `http://localhost:8000`. In production,
 * set VITE_API_BASE to the real backend URL.
 */

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});

// ── Tasks ────────────────────────────────────────────────────────────────

/**
 * Fetch all tasks, optionally filtered by status.
 * @param {Object} [params] - Query params: { status, top_level_only }
 * @returns {Promise<Array>} Array of TaskResponse objects
 */
export async function fetchTasks(params = {}) {
  const { data } = await api.get('/tasks/', { params });
  return data;
}

/**
 * Create a new task.
 * @param {Object} task - TaskCreate payload
 * @returns {Promise<Object>} The created TaskResponse
 */
export async function createTask(task) {
  const { data } = await api.post('/tasks/', task);
  return data;
}

/**
 * Update an existing task (partial update).
 * @param {number} taskId
 * @param {Object} updates - TaskUpdate payload (partial)
 * @returns {Promise<Object>} Updated TaskResponse
 */
export async function updateTask(taskId, updates) {
  const { data } = await api.patch(`/tasks/${taskId}`, updates);
  return data;
}

/**
 * Delete a task by ID.
 * @param {number} taskId
 */
export async function deleteTask(taskId) {
  await api.delete(`/tasks/${taskId}`);
}

// ── Telemetry ────────────────────────────────────────────────────────────

/**
 * Fetch distraction log entries for analytics.
 * @param {Object} [params] - { limit, offset }
 * @returns {Promise<Array>} Array of DistractionLogResponse
 */
export async function fetchTelemetryLogs(params = {}) {
  const { data } = await api.get('/telemetry/logs', { params });
  return data;
}

// ── User Context ─────────────────────────────────────────────────────────

/**
 * Get the latest user context snapshot (energy + stress).
 * @returns {Promise<Object|null>} UserContextResponse or null
 */
export async function fetchLatestContext() {
  const { data } = await api.get('/context/latest');
  return data;
}

/**
 * Update the user's current energy and stress levels.
 * @param {Object} context - { current_energy: 1-4, stress_level: 1-3 }
 * @returns {Promise<Object>} Created UserContextResponse
 */
export async function updateUserContext(context) {
  const { data } = await api.post('/context/update', context);
  return data;
}

// ── Health ────────────────────────────────────────────────────────────────

/**
 * Ping the backend health endpoint.
 * @returns {Promise<boolean>} true if backend is healthy
 */
export async function checkHealth() {
  try {
    const { data } = await api.get('/health', {
      timeout: 3000,
    });
    return data?.status === 'healthy';
  } catch {
    return false;
  }
}

export default api;
