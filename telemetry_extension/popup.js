// ============================================================================
// popup.js — Popup Interface Controller
// Adaptive Neuro-Fuzzy Productivity Suite
// ============================================================================

// ---------------------------------------------------------------------------
// 1. DOMAIN LISTS (mirrored from background for classification display)
// ---------------------------------------------------------------------------

const DEFAULT_DISTRACTION_DOMAINS = [
  "youtube.com", "twitter.com", "reddit.com",
  "instagram.com", "facebook.com", "netflix.com",
];

const DEFAULT_PRODUCTIVE_DOMAINS = [
  "github.com", "stackoverflow.com", "notion.so",
  "leetcode.com", "docs.python.org",
];

let distractionDomains = [...DEFAULT_DISTRACTION_DOMAINS];
let productiveDomains = [...DEFAULT_PRODUCTIVE_DOMAINS];

// ---------------------------------------------------------------------------
// 2. DOM REFERENCES
// ---------------------------------------------------------------------------

const dom = {
  statusDot: document.getElementById("status-dot"),
  statusText: document.getElementById("status-text"),
  trackingDot: document.getElementById("tracking-dot"),
  trackingDomain: document.getElementById("tracking-domain"),
  trackingCategory: document.getElementById("tracking-category"),
  distractionValue: document.getElementById("distraction-value"),
  productiveValue: document.getElementById("productive-value"),
  ratioValue: document.getElementById("ratio-value"),
  ratioFillProductive: document.getElementById("ratio-fill-productive"),
  ratioFillDistraction: document.getElementById("ratio-fill-distraction"),
  syncInfo: document.getElementById("sync-info"),
  btnSync: document.getElementById("btn-sync"),
};

// ---------------------------------------------------------------------------
// 3. HELPERS
// ---------------------------------------------------------------------------

function getTodayKey() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function secondsToMinutes(seconds) {
  return Math.round((seconds || 0) / 60);
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function classifyDomain(domain) {
  if (!domain) return "neutral";
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

function formatTimestamp(ts) {
  if (!ts) return "never";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// 4. UI UPDATE FUNCTIONS
// ---------------------------------------------------------------------------

function updateStatusIndicator(status) {
  // Remove all state classes
  dom.statusDot.classList.remove(
    "status-dot--connected",
    "status-dot--disconnected",
    "status-dot--unknown"
  );

  switch (status) {
    case "connected":
      dom.statusDot.classList.add("status-dot--connected");
      dom.statusText.textContent = "Connected";
      break;
    case "disconnected":
      dom.statusDot.classList.add("status-dot--disconnected");
      dom.statusText.textContent = "Offline";
      break;
    default:
      dom.statusDot.classList.add("status-dot--unknown");
      dom.statusText.textContent = "Checking…";
  }
}

function updateMetricCards(distractionSeconds, productiveSeconds) {
  const distrMin = secondsToMinutes(distractionSeconds);
  const prodMin = secondsToMinutes(productiveSeconds);

  // Animate number change
  animateCounter(dom.distractionValue, distrMin);
  animateCounter(dom.productiveValue, prodMin);

  // Update ratio bar
  const total = distractionSeconds + productiveSeconds;
  if (total > 0) {
    const prodPct = ((productiveSeconds / total) * 100).toFixed(0);
    const distrPct = ((distractionSeconds / total) * 100).toFixed(0);

    dom.ratioFillProductive.style.width = `${prodPct}%`;
    dom.ratioFillDistraction.style.width = `${distrPct}%`;
    dom.ratioValue.textContent = `${prodPct}% focused`;
  } else {
    dom.ratioFillProductive.style.width = "50%";
    dom.ratioFillDistraction.style.width = "50%";
    dom.ratioValue.textContent = "—";
  }
}

function animateCounter(element, target) {
  const current = parseInt(element.textContent, 10) || 0;
  if (current === target) return;

  const diff = target - current;
  const steps = Math.min(Math.abs(diff), 20);
  const stepValue = diff / steps;
  let step = 0;

  const interval = setInterval(() => {
    step++;
    if (step >= steps) {
      element.textContent = target;
      clearInterval(interval);
    } else {
      element.textContent = Math.round(current + stepValue * step);
    }
  }, 30);
}

function updateTrackingDisplay(domain, category) {
  // Update domain text
  dom.trackingDomain.textContent = domain || "—";

  // Update tracking dot
  dom.trackingDot.classList.remove(
    "tracking-card__dot--productive",
    "tracking-card__dot--distracting",
    "tracking-card__dot--neutral",
    "tracking-card__dot--idle"
  );

  // Update category badge
  dom.trackingCategory.classList.remove(
    "tracking-card__category--productive",
    "tracking-card__category--distracting",
    "tracking-card__category--neutral"
  );

  if (!domain) {
    dom.trackingDot.classList.add("tracking-card__dot--idle");
    dom.trackingCategory.classList.add("tracking-card__category--neutral");
    dom.trackingCategory.textContent = "idle";
    return;
  }

  switch (category) {
    case "productive":
      dom.trackingDot.classList.add("tracking-card__dot--productive");
      dom.trackingCategory.classList.add("tracking-card__category--productive");
      dom.trackingCategory.textContent = "productive";
      break;
    case "distracting":
      dom.trackingDot.classList.add("tracking-card__dot--distracting");
      dom.trackingCategory.classList.add("tracking-card__category--distracting");
      dom.trackingCategory.textContent = "distracting";
      break;
    default:
      dom.trackingDot.classList.add("tracking-card__dot--neutral");
      dom.trackingCategory.classList.add("tracking-card__category--neutral");
      dom.trackingCategory.textContent = "neutral";
  }
}

// ---------------------------------------------------------------------------
// 5. DATA FETCHING
// ---------------------------------------------------------------------------

async function loadDomainLists() {
  try {
    const data = await chrome.storage.local.get([
      "distraction_domains",
      "productive_domains",
    ]);
    if (data.distraction_domains) distractionDomains = data.distraction_domains;
    if (data.productive_domains) productiveDomains = data.productive_domains;
  } catch (err) {
    console.warn("[Popup] Could not load domain lists:", err);
  }
}

async function refreshData() {
  const todayKey = getTodayKey();
  const distractionKey = `${todayKey}_distraction_time`;
  const productiveKey = `${todayKey}_productive_time`;
  const lastSyncKey = `${todayKey}_last_sync`;

  try {
    // Ask background to flush current tracking time first
    await chrome.runtime.sendMessage({ type: "FLUSH_TIME" });
  } catch (err) {
    // Background may not be active
    console.warn("[Popup] Could not flush background time:", err);
  }

  try {
    const data = await chrome.storage.local.get([
      distractionKey,
      productiveKey,
      lastSyncKey,
      "backend_status",
      "backend_last_success",
    ]);

    // Update metric cards
    updateMetricCards(data[distractionKey] || 0, data[productiveKey] || 0);

    // Update status indicator
    updateStatusIndicator(data.backend_status || "unknown");

    // Update sync info
    dom.syncInfo.textContent = `Last sync: ${formatTimestamp(
      data.backend_last_success
    )}`;
  } catch (err) {
    console.error("[Popup] Failed to read storage:", err);
  }
}

async function loadCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      const domain = extractDomain(tab.url);
      const category = classifyDomain(domain);
      updateTrackingDisplay(domain, category);
    } else {
      updateTrackingDisplay(null, null);
    }
  } catch (err) {
    console.warn("[Popup] Could not get current tab:", err);
    updateTrackingDisplay(null, null);
  }
}

// ---------------------------------------------------------------------------
// 6. EVENT HANDLERS
// ---------------------------------------------------------------------------

dom.btnSync.addEventListener("click", async () => {
  dom.btnSync.disabled = true;
  dom.btnSync.textContent = "⏳ Syncing…";

  try {
    await chrome.runtime.sendMessage({ type: "FORCE_SYNC" });
    // Brief delay to let storage update propagate
    await new Promise((r) => setTimeout(r, 500));
    await refreshData();
  } catch (err) {
    console.error("[Popup] Force sync error:", err);
  } finally {
    dom.btnSync.disabled = false;
    dom.btnSync.textContent = "↻ Sync";
  }
});

// ---------------------------------------------------------------------------
// 7. INITIALIZATION
// ---------------------------------------------------------------------------

async function init() {
  await loadDomainLists();
  await loadCurrentTab();
  await refreshData();

  // Auto-refresh every 5 seconds while popup is open
  setInterval(async () => {
    await refreshData();
    await loadCurrentTab();
  }, 5000);
}

document.addEventListener("DOMContentLoaded", init);
