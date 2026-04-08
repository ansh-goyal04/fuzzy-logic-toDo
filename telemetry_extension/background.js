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
];

const SYNC_ENDPOINT = "http://localhost:8000/telemetry/sync";
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
    return hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Classify a domain into productive / distracting / neutral.
 */
function classifyDomain(domain) {
  if (!domain) return "neutral";

  // Check if the domain matches or is a subdomain of any listed domain
  const isDistraction = distractionDomains.some(
    (d) => domain === d || domain.endsWith("." + d)
  );
  if (isDistraction) return "distracting";

  const isProductive = productiveDomains.some(
    (d) => domain === d || domain.endsWith("." + d)
  );
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
 * Attempt to sync aggregated telemetry data with the FastAPI backend.
 * On success, records sync timestamp. On failure, data is preserved locally.
 */
async function syncWithBackend() {
  const todayKey = getTodayKey();
  const distractionKey = `${todayKey}_distraction_time`;
  const productiveKey = `${todayKey}_productive_time`;
  const lastSyncKey = `${todayKey}_last_sync`;

  try {
    // Flush any in-progress tracking before syncing
    await flushElapsedTime();

    const data = await chrome.storage.local.get([
      distractionKey,
      productiveKey,
      lastSyncKey,
    ]);

    const payload = {
      date: todayKey,
      distraction_time_seconds: data[distractionKey] || 0,
      productive_time_seconds: data[productiveKey] || 0,
      synced_at: new Date().toISOString(),
    };

    const response = await fetch(SYNC_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    // Record successful sync
    await chrome.storage.local.set({
      [lastSyncKey]: Date.now(),
      backend_status: "connected",
      backend_last_success: Date.now(),
    });

    console.log("[Telemetry] Sync successful:", payload);
  } catch (err) {
    // Backend is unreachable — keep data locally, mark status
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

  // Seed default domain lists into storage if not already present
  const stored = await chrome.storage.local.get([
    "distraction_domains",
    "productive_domains",
  ]);

  if (!stored.distraction_domains) {
    await chrome.storage.local.set({
      distraction_domains: DEFAULT_DISTRACTION_DOMAINS,
    });
  }
  if (!stored.productive_domains) {
    await chrome.storage.local.set({
      productive_domains: DEFAULT_PRODUCTIVE_DOMAINS,
    });
  }

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
    if (stored.distraction_domains) {
      distractionDomains = stored.distraction_domains;
    }
    if (stored.productive_domains) {
      productiveDomains = stored.productive_domains;
    }

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
    // Popup updated domain lists
    if (message.distraction_domains) {
      distractionDomains = message.distraction_domains;
    }
    if (message.productive_domains) {
      productiveDomains = message.productive_domains;
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "FORCE_SYNC") {
    syncWithBackend().then(() => sendResponse({ ok: true }));
    return true;
  }
});
