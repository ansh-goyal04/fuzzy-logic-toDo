// ============================================================================
// background.js — Telemetry Engine (Service Worker)
// Adaptive Neuro-Fuzzy Productivity Suite
// ============================================================================
// Tracks active tab domain, classifies it as productive/distracting/neutral,
// accumulates time locally, and syncs to the FastAPI backend every 5 minutes.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. DEFAULT DOMAIN LISTS (user-configurable via storage)
// ---------------------------------------------------------------------------

const DEFAULT_DISTRACTION_DOMAINS = [
  "youtube.com",
  "twitter.com",
  "reddit.com",
  "instagram.com",
  "facebook.com",
  "netflix.com",
];

const DEFAULT_PRODUCTIVE_DOMAINS = [
  "github.com",
  "stackoverflow.com",
  "notion.so",
  "leetcode.com",
  "docs.python.org",
  "chatgpt.com",
  "openai.com",
  "gemini.google.com",
  "geeksforgeeks.org",
  "tutorialspoint.com",
  "w3schools.com",
];

/** Bare labels users sometimes enter instead of full hostnames */
const HOST_SHORTCUTS = {
  chatgpt: "chatgpt.com",
  openai: "openai.com",
};

/**
 * Chrome storage must hold arrays; if a string or corrupted value was stored,
 * coercion avoids iterating string characters (which would yield an empty list
 * and classify everything as neutral).
 */
function coerceDomainArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch {
      /* not JSON */
    }
    if (s.includes(",")) {
      return s.split(",").map((x) => x.trim()).filter(Boolean);
    }
    return [s];
  }
  return [];
}

/**
 * Code defaults + whatever the user stored (extension first-install snapshots
 * otherwise ignore edits to DEFAULT_* in source unless we merge).
 */
function rebuildDomainLists(stored) {
  distractionDomains = normalizeDomainList([
    ...DEFAULT_DISTRACTION_DOMAINS,
    ...coerceDomainArray(stored?.distraction_domains),
  ]);
  productiveDomains = normalizeDomainList([
    ...DEFAULT_PRODUCTIVE_DOMAINS,
    ...coerceDomainArray(stored?.productive_domains),
  ]);
}

const DEFAULT_API_BASE = "http://127.0.0.1:8000/api";
const API_PORTS_TO_PROBE = [8000, 8001];
const ALARM_NAME = "telemetry-sync-alarm";
const ALARM_PERIOD_MINUTES = 5;

// ---------------------------------------------------------------------------
// 2. IN-MEMORY STATE
// ---------------------------------------------------------------------------

let activeDomain = null;
let activeTabId = null;
let trackingStartTime = null; // timestamp (ms) when we started tracking current domain

// Cached domain lists (loaded from storage on startup)
let distractionDomains = [...DEFAULT_DISTRACTION_DOMAINS];
let productiveDomains = [...DEFAULT_PRODUCTIVE_DOMAINS];

// ---------------------------------------------------------------------------
// 3. HELPERS
// ---------------------------------------------------------------------------

/**
 * Extract the root domain from a URL string.
 * e.g. "https://www.github.com/user/repo" → "github.com"
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    // Strip leading "www."
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalize a user-provided domain rule (may be URL, "chatgpt", www., etc.).
 */
function normalizeDomainRule(rule) {
  let r = String(rule || "").trim().toLowerCase();
  if (!r) return "";
  if (!r.includes(".") && HOST_SHORTCUTS[r]) {
    return HOST_SHORTCUTS[r];
  }
  if (r.includes("://")) {
    try {
      r = new URL(r).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  } else {
    r = r.replace(/^www\./, "");
    if (r.includes("/")) r = r.split("/")[0];
    // host:port without scheme (e.g. example.com:443)
    if (r.includes(":") && !r.includes("::")) {
      const hostOnly = r.split(":")[0];
      if (hostOnly.includes(".")) r = hostOnly;
    }
  }
  if (!r.includes(".") && HOST_SHORTCUTS[r]) {
    return HOST_SHORTCUTS[r];
  }
  return r;
}

function normalizeDomainList(list) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const n = normalizeDomainRule(item);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/**
 * Classify a domain into productive / distracting / neutral.
 */
function classifyDomain(domain) {
  if (!domain) return "neutral";
  const host = domain.toLowerCase();

  // Check if the domain matches or is a subdomain of any listed domain
  const isDistraction = distractionDomains.some((d) => {
    const base = normalizeDomainRule(d);
    return base && (host === base || host.endsWith("." + base));
  });
  if (isDistraction) return "distracting";

  const isProductive = productiveDomains.some((d) => {
    const base = normalizeDomainRule(d);
    return base && (host === base || host.endsWith("." + base));
  });
  if (isProductive) return "productive";

  return "neutral";
}

/**
 * Get the storage key prefix for today's date (YYYY-MM-DD).
 */
function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// 4. TIME ACCUMULATION
// ---------------------------------------------------------------------------

/**
 * Flush elapsed time for the currently tracked domain into chrome.storage.local.
 * Called whenever the active domain changes or on periodic save.
 */
async function flushElapsedTime() {
  if (!activeDomain || !trackingStartTime) return;

  const now = Date.now();
  const elapsedSeconds = Math.round((now - trackingStartTime) / 1000);
  if (elapsedSeconds <= 0) return;

  const category = classifyDomain(activeDomain);
  const todayKey = getTodayKey();

  // Keys for aggregate counters
  const distractionKey = `${todayKey}_distraction_time`;
  const productiveKey = `${todayKey}_productive_time`;
  // Per-domain breakdown (for detailed analytics)
  const domainKey = `${todayKey}_domain_${activeDomain}`;

  try {
    const data = await chrome.storage.local.get([
      distractionKey,
      productiveKey,
      domainKey,
    ]);

    const updates = {};

    if (category === "distracting") {
      updates[distractionKey] = (data[distractionKey] || 0) + elapsedSeconds;
    } else if (category === "productive") {
      updates[productiveKey] = (data[productiveKey] || 0) + elapsedSeconds;
    }

    // Always track per-domain time
    updates[domainKey] = (data[domainKey] || 0) + elapsedSeconds;

    await chrome.storage.local.set(updates);
  } catch (err) {
    console.error("[Telemetry] Failed to flush elapsed time:", err);
  }

  // Reset the timer to now (not null — we're still on the same domain)
  trackingStartTime = now;
}

// ---------------------------------------------------------------------------
// 5. TAB EVENT HANDLERS
// ---------------------------------------------------------------------------

/**
 * Begin tracking a new domain. Flushes time from the previous domain first.
 */
async function startTrackingDomain(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;

    const domain = extractDomain(tab.url);

    // Flush any existing tracked time before switching
    await flushElapsedTime();

    activeDomain = domain;
    activeTabId = tabId;
    trackingStartTime = Date.now();
  } catch (err) {
    // Tab may have been closed or is a chrome:// page
    console.warn("[Telemetry] Could not get tab info:", err.message);
    activeDomain = null;
    activeTabId = null;
    trackingStartTime = null;
  }
}

// When the user switches to a different tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await startTrackingDomain(activeInfo.tabId);
});

// When the current tab navigates to a new URL
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only react when the URL actually changes on the active tab
  if (changeInfo.url && tabId === activeTabId) {
    await startTrackingDomain(tabId);
  }
});

// When a tab is closed, stop tracking if it was the active one
chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabId === activeTabId) {
    await flushElapsedTime();
    activeDomain = null;
    activeTabId = null;
    trackingStartTime = null;
  }
});

// When the browser window loses focus, stop tracking
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus entirely
    await flushElapsedTime();
    activeDomain = null;
    activeTabId = null;
    trackingStartTime = null;
  } else {
    // Browser regained focus — find the active tab in this window
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        windowId: windowId,
      });
      if (tab) {
        await startTrackingDomain(tab.id);
      }
    } catch (err) {
      console.warn("[Telemetry] Error on focus change:", err.message);
    }
  }
});

// ---------------------------------------------------------------------------
// 6. BACKEND SYNC
// ---------------------------------------------------------------------------

/**
 * Resolve API base URL (stored preference or first healthy local port).
 */
async function probeApiBase() {
  for (const port of API_PORTS_TO_PROBE) {
    const candidate = `http://127.0.0.1:${port}/api`;
    try {
      const response = await fetch(`${candidate}/health`, { method: "GET" });
      if (response.ok) {
        await chrome.storage.local.set({ api_base_url: candidate });
        return candidate;
      }
    } catch {
      // try next port
    }
  }
  return null;
}

async function resolveApiBase() {
  const stored = await chrome.storage.local.get("api_base_url");
  if (stored.api_base_url) {
    const base = stored.api_base_url.replace(/\/$/, "");
    try {
      const response = await fetch(`${base}/health`, { method: "GET" });
      if (response.ok) return base;
    } catch {
      // stored URL stale — fall through to probe
    }
  }

  const discovered = await probeApiBase();
  return discovered || DEFAULT_API_BASE;
}

/**
 * Ping /api/health so the popup can show Connected even when there is nothing to sync.
 */
async function checkBackendHealth(apiBase) {
  const response = await fetch(`${apiBase}/health`, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status})`);
  }
  await chrome.storage.local.set({
    backend_status: "connected",
    backend_last_success: Date.now(),
  });
  return true;
}

/**
 * Build POST /api/telemetry/sync payload from per-domain counters in storage.
 */
function buildTelemetryEntries(allData, todayKey) {
  const prefix = `${todayKey}_domain_`;
  const timestamp = new Date().toISOString();
  const entries = [];

  for (const [key, seconds] of Object.entries(allData)) {
    if (!key.startsWith(prefix) || !seconds) continue;

    const domain = key.slice(prefix.length);
    const durationMinutes = Math.max(1, Math.round(seconds / 60));
    entries.push({
      domain_name: domain,
      duration_minutes: durationMinutes,
      timestamp,
    });
  }

  return entries;
}

/**
 * Attempt to sync per-domain telemetry with the FastAPI backend.
 * On success, records sync timestamp. On failure, data is preserved locally.
 */
async function syncWithBackend() {
  const todayKey = getTodayKey();
  const lastSyncKey = `${todayKey}_last_sync`;
  const domainPrefix = `${todayKey}_domain_`;

  try {
    const apiBase = await resolveApiBase();
    await checkBackendHealth(apiBase);

    // Flush any in-progress tracking before syncing
    await flushElapsedTime();

    const data = await chrome.storage.local.get(null);
    const entries = buildTelemetryEntries(data, todayKey);

    if (entries.length === 0) {
      console.log("[Telemetry] Backend reachable; no domain data to sync yet.");
      await chrome.storage.local.set({ [lastSyncKey]: Date.now() });
      return;
    }

    const response = await fetch(`${apiBase}/telemetry/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Backend returned ${response.status}: ${detail}`);
    }

    // Clear synced per-domain counters (aggregates stay for popup display)
    const cleared = {};
    for (const key of Object.keys(data)) {
      if (key.startsWith(domainPrefix)) {
        cleared[key] = 0;
      }
    }
    cleared[lastSyncKey] = Date.now();
    cleared.backend_status = "connected";
    cleared.backend_last_success = Date.now();

    await chrome.storage.local.set(cleared);

    console.log("[Telemetry] Sync successful:", entries.length, "entries");
  } catch (err) {
    console.warn("[Telemetry] Sync failed (data preserved locally):", err.message);
    await chrome.storage.local.set({
      backend_status: "disconnected",
      backend_last_error: err.message,
      backend_last_attempt: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// 7. ALARM SETUP
// ---------------------------------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    // Periodically flush time so storage stays current even without tab changes
    await flushElapsedTime();
    // Attempt backend sync
    await syncWithBackend();
  }
});

// ---------------------------------------------------------------------------
// 8. SERVICE WORKER INITIALIZATION
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Telemetry] Extension installed / updated.");

  const stored = await chrome.storage.local.get([
    "distraction_domains",
    "productive_domains",
  ]);
  rebuildDomainLists(stored);
  await chrome.storage.local.set({
    distraction_domains: distractionDomains,
    productive_domains: productiveDomains,
  });

  // Initialize backend status
  await chrome.storage.local.set({ backend_status: "unknown" });

  // Create the periodic sync alarm
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  console.log(`[Telemetry] Sync alarm set: every ${ALARM_PERIOD_MINUTES} min.`);
});

// On service worker startup (not just install), reload domain lists and re-create alarm
(async () => {
  try {
    const stored = await chrome.storage.local.get([
      "distraction_domains",
      "productive_domains",
    ]);
    rebuildDomainLists(stored);
    await chrome.storage.local.set({
      distraction_domains: distractionDomains,
      productive_domains: productiveDomains,
    });

    // Ensure alarm exists (service workers can restart)
    const existing = await chrome.alarms.get(ALARM_NAME);
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }

    // Determine initial active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab) {
      await startTrackingDomain(tab.id);
    }

    // Probe backend so popup does not stay Offline until first alarm
    try {
      const apiBase = await resolveApiBase();
      await checkBackendHealth(apiBase);
    } catch {
      // sync alarm will retry
    }
  } catch (err) {
    console.warn("[Telemetry] Startup initialization error:", err.message);
  }
})();

// ---------------------------------------------------------------------------
// 9. MESSAGE HANDLER (for popup communication)
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FLUSH_TIME") {
    // Popup requests a flush so displayed data is up-to-date
    flushElapsedTime().then(() => sendResponse({ ok: true }));
    return true; // keep channel open for async response
  }

  if (message.type === "UPDATE_DOMAINS") {
    const patch = {};
    if (message.distraction_domains) {
      patch.distraction_domains = message.distraction_domains;
    }
    if (message.productive_domains) {
      patch.productive_domains = message.productive_domains;
    }
    if (Object.keys(patch).length === 0) {
      sendResponse({ ok: true });
      return true;
    }
    chrome.storage.local
      .get(["distraction_domains", "productive_domains"])
      .then((merged) => {
        rebuildDomainLists({ ...merged, ...patch });
        return chrome.storage.local.set({
          distraction_domains: distractionDomains,
          productive_domains: productiveDomains,
        });
      })
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === "FORCE_SYNC") {
    syncWithBackend().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "HEALTH_CHECK") {
    resolveApiBase()
      .then((apiBase) => checkBackendHealth(apiBase))
      .then(() => sendResponse({ ok: true, status: "connected" }))
      .catch((err) => {
        chrome.storage.local.set({
          backend_status: "disconnected",
          backend_last_error: err.message,
          backend_last_attempt: Date.now(),
        });
        sendResponse({ ok: false, status: "disconnected", error: err.message });
      });
    return true;
  }
});
