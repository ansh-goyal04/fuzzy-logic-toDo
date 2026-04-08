# ARCHITECTURE.md — Adaptive Neuro-Fuzzy Productivity Suite

> **Version:** 0.1.0 (Scaffold)
> **Last Updated:** 2026-04-08
> **Status:** Initialization — structure and contracts defined, implementation pending.

---

## 1. Project Summary

The **Adaptive Neuro-Fuzzy Productivity Suite** is an intelligent task management system that moves beyond conventional CRUD-based to-do lists by incorporating:

- **Fuzzy Logic Inference** to dynamically calculate and rank task priorities based on multi-dimensional inputs (deadline urgency, estimated effort, user energy, distraction levels).
- **Passive Browser Telemetry** to measure real-world attention patterns — tracking time spent on productive vs. distracting domains — and feeding that signal into the ranking engine.
- **A Neuro-Fuzzy Adaptation Loop** (future phase) that learns from historical user behavior to tune fuzzy membership functions over time, personalizing the system to each user.

The end result is a dashboard where tasks are not statically ordered by the user, but **dynamically re-ranked** by the system in response to changing context: approaching deadlines, accumulated distraction time, and the user's inferred cognitive state.

---

## 2. The Three Pillars

### Pillar 1 — Python/SQL Backend & AI Engine

| Aspect       | Detail                                                       |
| ------------ | ------------------------------------------------------------ |
| **Role**     | Central authority for data persistence, business logic, authentication, and intelligent inference. |
| **Runtime**  | Python 3.11+                                                 |
| **Framework**| FastAPI (async, OpenAPI auto-docs)                           |
| **Database** | SQLite (local dev) via SQLAlchemy ORM + raw SQL for complex analytical queries. |
| **Key Modules** | `backend/api/` — route handlers, middleware, request/response schemas. |
|              | `backend/database/` — SQLAlchemy models, Alembic migrations, session management. |
|              | `backend/fuzzy_engine/` — fuzzy set definitions, inference rules, defuzzification, and (future) neuro-adaptive weight tuning. |

#### Fuzzy Engine Design (High-Level)

The engine operates on a classic Mamdani-type fuzzy inference pipeline:

```
                ┌─────────────┐
  Raw Inputs    │ Fuzzifier   │   Converts crisp inputs to fuzzy membership values
  (deadline,    │             │   e.g., deadline_urgency ∈ {low, medium, high, critical}
   effort,      └──────┬──────┘
   distraction)        │
                       ▼
                ┌─────────────┐
                │ Rule Base   │   IF deadline IS critical AND effort IS high
                │             │   THEN priority IS very_high
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ Inference   │   Aggregates fired rules via min-max composition
                │ Engine      │
                └──────┬──────┘
                       │
                       ▼
                ┌──────────────┐
                │ Defuzzifier  │   Centroid method → crisp priority score [0–100]
                └──────────────┘
```

**Inputs (Fuzzy Variables):**

| Variable              | Universe   | Linguistic Terms                     | Source                    |
| --------------------- | ---------- | ------------------------------------ | ------------------------- |
| `deadline_urgency`    | 0–100      | low, medium, high, critical          | Computed from task due date vs. now |
| `estimated_effort`    | 0–100      | trivial, moderate, substantial, epic | User-provided estimate    |
| `distraction_level`   | 0–100      | focused, mildly_distracted, heavily_distracted | Telemetry extension       |
| `user_energy`         | 0–100      | drained, moderate, energized         | Self-reported or inferred |

**Output:**

| Variable   | Universe | Linguistic Terms                          |
| ---------- | -------- | ----------------------------------------- |
| `priority` | 0–100    | negligible, low, medium, high, very_high  |

---

### Pillar 2 — Telemetry Chrome Extension

| Aspect       | Detail                                                       |
| ------------ | ------------------------------------------------------------ |
| **Role**     | Passive background observer that classifies browsing behavior and reports time-spent metrics. |
| **Manifest** | Manifest V3 (Service Workers, no persistent background pages) |
| **Storage**  | IndexedDB for local buffering; periodic batch sync to backend API. |
| **Privacy**  | Only domain-level data is captured (never full URLs, page content, or form data). All data stays local until explicit sync. User can pause/resume tracking. |

#### Extension Architecture

```
telemetry_extension/
├── manifest.json          # MV3 manifest: permissions, service worker registration
├── scripts/
│   ├── service-worker.js  # Background: listens to tab events, classifies domains
│   ├── tracker.js         # Core logic: timing, focus/distraction classification
│   └── sync.js            # Batch uploader: IndexedDB → Backend API
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── popup.html / popup.js  # Minimal UI: status indicator, pause/resume toggle
```

**Domain Classification Strategy:**

| Category       | Examples                        | Signal          |
| -------------- | ------------------------------- | --------------- |
| `productive`   | github.com, docs.google.com     | Positive focus  |
| `neutral`      | google.com (search), weather    | No signal       |
| `distracting`  | reddit.com, youtube.com, twitter.com | Negative focus |

Categories are user-configurable via the popup or dashboard settings. The extension reports aggregated time-per-category (not per-domain) to the backend.

---

### Pillar 3 — Web Dashboard (Frontend)

| Aspect       | Detail                                                       |
| ------------ | ------------------------------------------------------------ |
| **Role**     | Primary user interface for task management, schedule visualization, and distraction analytics. |
| **Framework**| React 18+ (Vite build tooling)                               |
| **Styling**  | TailwindCSS                                                  |
| **State**    | React Context + `useReducer` (local); SWR or React Query for server state. |

#### Key Views

| View                    | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| **Task Board**          | CRUD interface for tasks. Each task card shows its fuzzy priority score and rank. Tasks re-sort in real-time as scores update. |
| **Daily Schedule**      | Timeline view of the current day, with tasks slotted by priority and estimated duration. |
| **Distraction Analytics** | Charts (bar, donut) showing productive vs. distracted time over configurable periods. |
| **Settings**            | Domain classification rules, fuzzy engine parameter tuning (advanced), extension sync interval. |

---

## 3. Tech Stack Summary

| Layer                | Technology                          | Version Target |
| -------------------- | ----------------------------------- | -------------- |
| Backend Runtime      | Python                              | 3.11+          |
| API Framework        | FastAPI                             | 0.110+         |
| ORM                  | SQLAlchemy                          | 2.0+           |
| Database             | SQLite                              | 3.40+          |
| Fuzzy Engine         | Custom Python (NumPy for numerics)  | —              |
| Telemetry Extension  | Chrome Manifest V3                  | MV3            |
| Extension Storage    | IndexedDB                           | —              |
| Frontend Framework   | React                               | 18+            |
| Frontend Build       | Vite                                | 5+             |
| Frontend Styling     | TailwindCSS                         | 3+             |
| Server State (FE)    | React Query / SWR                   | —              |

---

## 4. Data Flow

The following diagram shows the primary data flow through all three pillars:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER                                   │
│                                                                          │
│  ┌─────────────────────┐         ┌─────────────────────────────────┐     │
│  │  Telemetry Extension │         │  Web Dashboard (React/Vite)     │     │
│  │                     │         │                                 │     │
│  │  • Track tab focus  │         │  • Task CRUD                   │     │
│  │  • Classify domains │         │  • View fuzzy-ranked schedule  │     │
│  │  • Buffer to IDB    │         │  • Distraction analytics       │     │
│  │                     │         │  • Settings & configuration    │     │
│  └────────┬────────────┘         └──────────┬──────────────────────┘     │
│           │                                 │                            │
│           │  POST /api/telemetry/sync       │  GET/POST /api/tasks/*     │
│           │  (batch, periodic)              │  GET /api/schedule         │
│           │                                 │  GET /api/analytics        │
└───────────┼─────────────────────────────────┼────────────────────────────┘
            │                                 │
            ▼                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (FastAPI)                                  │
│                                                                          │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────────────────┐  │
│  │  API Layer   │───▶│  Database Layer   │───▶│  Fuzzy Engine          │  │
│  │              │    │                  │    │                        │  │
│  │  • Routes    │    │  • SQLAlchemy    │    │  • Fuzzification       │  │
│  │  • Schemas   │    │  • Models        │    │  • Rule evaluation     │  │
│  │  • Auth      │    │  • Migrations    │    │  • Defuzzification     │  │
│  │  • Middleware│    │  • SQLite DB     │    │  • Neuro-adaptation    │  │
│  └──────────────┘    └──────────────────┘    └────────────────────────┘  │
│                                                                          │
│  Data Flow:                                                              │
│  1. Telemetry data arrives → stored in `telemetry_sessions` table        │
│  2. Task CRUD requests → stored in `tasks` table                         │
│  3. Schedule request triggers fuzzy engine:                              │
│     a. Load tasks + telemetry aggregates from DB                         │
│     b. Compute fuzzy priority for each task                              │
│     c. Rank and return sorted schedule                                   │
│  4. Analytics request → aggregate telemetry data → return charts payload │
└──────────────────────────────────────────────────────────────────────────┘
```

### Request Lifecycle: "Get My Schedule"

```
1. Dashboard sends:         GET /api/schedule?date=2026-04-08
2. API handler:             Fetches all incomplete tasks for the user
3. API handler:             Fetches today's telemetry summary (focus vs distraction %)
4. Fuzzy Engine called:     For each task, compute priority score:
                              inputs = {
                                deadline_urgency: f(task.due_date, now),
                                estimated_effort: task.effort_estimate,
                                distraction_level: telemetry.distraction_pct,
                                user_energy: user.self_reported_energy
                              }
                              output = fuzzy_infer(inputs) → priority ∈ [0, 100]
5. API handler:             Sort tasks by priority (descending)
6. API handler:             Return ranked task list with scores to dashboard
7. Dashboard:               Renders the sorted schedule with priority badges
```

---

## 5. Directory Structure

```
fuzzy-logic-toDo/
│
├── ARCHITECTURE.md              ← This file (system reference document)
├── .gitignore                   ← Python + Node.js ignore rules
│
├── backend/                     ← Python/FastAPI application
│   ├── __init__.py
│   ├── main.py                  ← FastAPI app entrypoint (to be created)
│   ├── requirements.txt         ← Python dependencies (to be created)
│   ├── api/
│   │   ├── __init__.py
│   │   ├── routes_tasks.py      ← Task CRUD endpoints
│   │   ├── routes_telemetry.py  ← Telemetry ingestion endpoints
│   │   ├── routes_schedule.py   ← Schedule & ranking endpoints
│   │   └── schemas.py           ← Pydantic request/response models
│   ├── database/
│   │   ├── __init__.py
│   │   ├── models.py            ← SQLAlchemy ORM models
│   │   ├── session.py           ← DB engine & session factory
│   │   └── seed.sql             ← Optional seed data
│   └── fuzzy_engine/
│       ├── __init__.py
│       ├── variables.py         ← Fuzzy variable & membership function definitions
│       ├── rules.py             ← Fuzzy rule base
│       └── engine.py            ← Inference + defuzzification pipeline
│
├── frontend/                    ← React/Vite dashboard
│   ├── src/
│   │   ├── App.jsx              ← Root component
│   │   ├── main.jsx             ← Vite entry point
│   │   └── ...
│   ├── components/
│   │   ├── TaskBoard.jsx
│   │   ├── ScheduleView.jsx
│   │   ├── AnalyticsChart.jsx
│   │   └── ...
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
│
├── telemetry_extension/         ← Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html
│   ├── popup.js
│   ├── scripts/
│   │   ├── service-worker.js
│   │   ├── tracker.js
│   │   └── sync.js
│   └── icons/
│       ├── icon-16.png
│       ├── icon-48.png
│       └── icon-128.png
│
└── docs/                        ← Additional documentation
    ├── api-spec.md              ← Detailed API contract (to be created)
    ├── fuzzy-rules.md           ← Human-readable rule documentation
    └── telemetry-protocol.md    ← Extension ↔ Backend sync protocol
```

---

## 6. API Contract (Preview)

> Full specification will live in `docs/api-spec.md`.

| Method | Endpoint                    | Description                              | Auth |
| ------ | --------------------------- | ---------------------------------------- | ---- |
| POST   | `/api/tasks`                | Create a new task                        | Yes  |
| GET    | `/api/tasks`                | List all tasks (filterable)              | Yes  |
| PATCH  | `/api/tasks/{id}`           | Update task fields                       | Yes  |
| DELETE | `/api/tasks/{id}`           | Soft-delete a task                       | Yes  |
| POST   | `/api/telemetry/sync`       | Batch upload telemetry sessions          | Yes  |
| GET    | `/api/telemetry/summary`    | Aggregated focus/distraction stats       | Yes  |
| GET    | `/api/schedule`             | Get fuzzy-ranked task schedule for a day | Yes  |
| GET    | `/api/analytics/distraction`| Distraction trend data for charts        | Yes  |
| PATCH  | `/api/settings/domains`     | Update domain classification rules       | Yes  |

---

## 7. Database Schema (Preview)

> Detailed schema with indexes and constraints will be generated during implementation.

### `tasks`
| Column            | Type      | Notes                                   |
| ----------------- | --------- | --------------------------------------- |
| id                | INTEGER   | PK, autoincrement                       |
| title             | TEXT      | Required                                |
| description       | TEXT      | Optional                                |
| due_date          | DATETIME  | Nullable                                |
| effort_estimate   | INTEGER   | 0–100 scale                             |
| status            | TEXT      | `pending`, `in_progress`, `done`        |
| fuzzy_priority    | REAL      | Last computed score (cached)            |
| created_at        | DATETIME  | Default: now                            |
| updated_at        | DATETIME  | Auto-updated                            |

### `telemetry_sessions`
| Column            | Type      | Notes                                   |
| ----------------- | --------- | --------------------------------------- |
| id                | INTEGER   | PK, autoincrement                       |
| domain_category   | TEXT      | `productive`, `neutral`, `distracting`  |
| duration_seconds  | INTEGER   | Time spent in this session              |
| recorded_at       | DATETIME  | When the session occurred               |
| synced_at         | DATETIME  | When it was uploaded to backend         |

### `domain_rules`
| Column   | Type | Notes                                      |
| -------- | ---- | ------------------------------------------ |
| id       | INTEGER | PK                                       |
| domain   | TEXT    | e.g., `github.com`                       |
| category | TEXT    | `productive`, `neutral`, `distracting`   |

---

## 8. Security & Privacy Considerations

- **Telemetry data is domain-level only.** No URLs, page titles, or page content is ever captured.
- **Local-first storage.** The extension buffers all data in IndexedDB; nothing leaves the browser until an explicit sync cycle.
- **User control.** Pause/resume telemetry at any time. Clear all local data from the extension popup.
- **Authentication.** All API endpoints require authentication (implementation TBD — JWT or session-based).
- **SQLite is single-user.** This architecture targets local/single-user deployment. Multi-user would require migrating to PostgreSQL and adding proper user isolation.

---

## 9. Future Roadmap

| Phase | Feature                                  | Notes                                     |
| ----- | ---------------------------------------- | ----------------------------------------- |
| 1     | Core CRUD + Static Fuzzy Engine          | Hardcoded membership functions and rules  |
| 2     | Telemetry Extension + Integration        | Live distraction signal feeding engine    |
| 3     | Neuro-Fuzzy Adaptation                   | ANFIS-style learning to tune memberships  |
| 4     | Multi-user + Cloud Deployment            | PostgreSQL, auth, Docker compose          |
| 5     | Mobile Companion                         | React Native or PWA for on-the-go access  |

---

*This document is the canonical architecture reference for the Adaptive Neuro-Fuzzy Productivity Suite. All agents, contributors, and future development phases should consult this file as the system prompt for understanding project scope, structure, and contracts.*
