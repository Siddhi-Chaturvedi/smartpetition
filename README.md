# SmartPetition

**An Automated Grievance Management System Using AI and DevOps**

Citizens submit complaints → AI classifies category & urgency → duplicates are detected →
cases are auto-routed to departments → SLA deadlines are enforced with automatic escalation →
officers resolve → citizens verify, rate and close. Every step is tracked, explained and audited.

![Stack](https://img.shields.io/badge/FastAPI-Python_3.11+-0066F5) ![React](https://img.shields.io/badge/React_18-TypeScript_Vite-0066F5) ![DB](https://img.shields.io/badge/SQLite_/_PostgreSQL-SQLAlchemy_Alembic-059669) ![AI](https://img.shields.io/badge/AI-scikit--learn_TF--IDF_LogReg-D97706)

---

## 1. Quick start on Windows 10/11 (the documented procedure)

**Prerequisites**

| Tool | Version | Check with | Install if missing |
|---|---|---|---|
| Python | 3.11 – 3.13 | `python --version` | `winget install Python.Python.3.12` (tick *Add to PATH*) |
| Node.js | 18+ (LTS) | `node --version` | `winget install OpenJS.NodeJS.LTS` |
| Git | any | `git --version` | `winget install Git.Git` |

Docker is **optional** (only needed for the PostgreSQL/compose mode in §5).

**Run it**

```bat
:: from the project root, double-click OR in a terminal:
start_smartpetition.bat
```

The script (all steps visible in its window, errors never close silently):

1. Locates its own project directory.
2. Verifies Python ≥ 3.11 (clear install instructions otherwise).
3. Creates `.venv` if missing and installs `backend/requirements.txt`.
4. Trains the AI model on first run (synthetic demo dataset, ~5 s).
5. Checks for port conflicts on 8000 (actionable message + fix).
6. Installs frontend dependencies if `node_modules` is missing.
7. Starts the **backend** (FastAPI/uvicorn, window `SmartPetitionBackend`).
8. Waits for the real health endpoint (`/api/v1/health`) — up to ~80 s.
9. Starts the **frontend** (Vite dev server, window `SmartPetitionFrontend`).
10. Waits for the frontend, then **opens http://localhost:5173 only when ready**.
11. If Node.js is missing it says so explicitly and starts only the backend —
    it never pretends the frontend is running.

**Stop it:** `stop_smartpetition.bat` — kills both server windows and anything still on
ports 8000/5173. Database and uploads are preserved.

**Run all tests:** `run_tests.bat` (backend pytest + frontend vitest).

### First administrator

On first start the seeder creates the admin account:

* If `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` are set in `.env`, those are used.
* Otherwise a **random strong password** is printed once in the backend window and written
  to `backend/FIRST_ADMIN.txt` (gitignored). There is **no shipped default admin password**.

### Development demo accounts (created only when `ENVIRONMENT=development`)

| Role | Email | Password |
|---|---|---|
| Citizen | `citizen@demo.smartpetition.dev` | `Citizen#123` |
| Officer (Roads) | `officer@demo.smartpetition.dev` | `Officer#123` |
| Officer (Water) | `water.officer@demo.smartpetition.dev` | `Officer#123` |

These are for local demonstration only and are never created in staging/production.
Demo grievances are flagged `is_demo_data=true` and show a **Demo data** badge in the UI.

### Manual startup via VS Code terminal (alternative to the .bat)

```bat
:: terminal 1 — backend
cd backend
python -m venv ..\\.venv                      (first time only)
..\\.venv\\Scripts\\python -m pip install -r requirements.txt
..\\.venv\\Scripts\\python -m app.ai.train_model   (first time only)
..\\.venv\\Scripts\\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

:: terminal 2 — frontend
cd frontend
npm install                                   (first time only)
npm run dev
```

Open http://localhost:5173. API docs: http://localhost:8000/docs.
**Do not** open the `.bat`/`.ps1` files in Notepad as a way to "run" them — double-click
them or invoke them from a terminal.

---

## 2. What is implemented (all wired to the real database)

### Citizen
Register/login, profile & password management, validated grievance submission with
**live AI category/priority suggestions and pre-submission duplicate check**, file
attachments (type/size validated, executables blocked, private authenticated downloads),
unique tracking ID, personal dashboard with real counts, search & filters, full
citizen-visible timeline, add information to open cases, feedback after resolution,
reopen within 14 days (max twice), in-app notifications.

### Department Officer
Department-scoped queue (backend-enforced), filters by status/priority/deadline,
critical & overdue queues, upcoming deadlines, AI predictions **with explanations**,
duplicate candidates review (confirm/dismiss), accept & reassign (load-balanced),
internal notes (never visible to citizens), citizen-visible updates, validated status
transitions, resolution with mandatory summary, priority override with mandatory reason,
assignment history, department workload & SLA stats, CSV export.

### Administrator
System-wide analytics (totals, pending/in-progress/resolved, overdue, critical, avg &
median resolution time, SLA compliance %, feedback averages), category distribution,
department workload, 12-month trends, filters by date/department/category/priority,
user & role management, department CRUD, category→department routing map, SLA rule
configuration (global/priority/category/department scopes), manual SLA sweep trigger,
escalation history, AI model performance report (accuracy, macro-F1, per-class P/R,
confusion matrix, duplicate-detection P/R), AI re-analysis, category corrections
(audited, AI record preserved), triage queue, audit logs with filters, app settings,
CSV exports, health monitoring.

### AI / automation (no paid API required)
* **Classification** — TF-IDF (word+char n-grams) + Logistic Regression, trained on the
  bundled synthetic dataset; model + version persisted with joblib; reproducible
  `train_model.py` / `evaluate_model.py`. If no model file exists, an **explicitly
  labeled** `fallback_rules` classifier is used and the UI shows a "Rule Fallback" badge —
  it never masquerades as an ML prediction.
* **Urgency** — transparent configurable rule engine (safety hazards, impact scale,
  vulnerable populations, time sensitivity, chronic-issue adjustment, category policy);
  every fired factor is stored and displayed. Officers can override with a reason.
* **Duplicate detection** — keyword/Jaccard baseline + TF-IDF cosine similarity
  (optional `sentence-transformers` upgrade path), blended with category/location/
  recency/open-status boosts; explainable matched terms; evaluated on a labeled pair set
  (precision/recall/F1); **never auto-rejects or deletes anything**.
* **Routing** — category→department mapping + jurisdiction matching + confidence
  threshold; auto-assigns with load balancing, otherwise sends to the admin triage queue.
* **SLA & escalation** — due dates from the most specific SLA rule; background asyncio
  scheduler sweeps every 60 s (configurable) **without any dashboard being open**;
  3 escalation levels, idempotent per level; notifications to assignee + admins;
  deadlines are **UTC calendar hours** (documented, not business hours).
* **Optional LLM** — env-configured; gracefully absent by default. Core AI never
  requires a paid key.

### Security highlights
PBKDF2-HMAC-SHA256 password hashing (240k iterations), JWT bearer auth, role-based
access **enforced on the backend**, server-side ownership checks (404 for other
citizens' cases), parameterized ORM queries, validated uploads with magic-byte sniffing
and double-extension blocking, private attachment downloads, in-memory rate limiting on
auth/submission endpoints, restricted CORS, consistent error envelope that hides
internals in production, full audit logging. Details: [`docs/SECURITY.md`](docs/SECURITY.md).

---

## 3. Project structure

```
smartpetition/
├── start_smartpetition.bat        # Windows one-click startup (health-checked)
├── stop_smartpetition.bat         # clean shutdown
├── run_tests.bat                  # backend + frontend test suites
├── .env.example                   # every setting documented
├── docker-compose.yml             # PostgreSQL + backend + frontend(nginx)
├── .github/workflows/ci.yml       # lint, train, test, build, compose smoke test
├── backend/
│   ├── requirements.txt           # pinned dependencies
│   ├── Dockerfile                 # trains model at build, healthcheck, non-root
│   ├── alembic.ini + alembic/     # migrations (initial schema generated)
│   ├── app/
│   │   ├── main.py                # FastAPI app, lifespan, middleware, errors
│   │   ├── config.py              # pydantic-settings, env-driven
│   │   ├── database.py            # engine/session, UTC-safe DateTime type
│   │   ├── security.py            # PBKDF2 hashing + JWT
│   │   ├── models.py              # 17 tables (normalized, indexed, FK'd)
│   │   ├── schemas.py             # Pydantic contracts
│   │   ├── deps.py                # auth + RBAC dependencies
│   │   ├── seed.py                # first-admin + safe dev demo data
│   │   ├── background.py          # SLA scheduler + feedback reminders
│   │   ├── rate_limit.py          # sliding-window limiter
│   │   ├── routers/               # auth, grievances, ai, departments,
│   │   │                          # analytics, admin, notifications, health
│   │   ├── services/              # workflow, state_machine, routing, sla,
│   │   │                          # urgency, duplicates, ai_classifier,
│   │   │                          # notifications, analytics, audit, serializers
│   │   └── ai/                    # train_model.py, evaluate_model.py,
│   │       └── data/              # synthetic dataset + generator (provenance noted)
│   ├── tests/                     # 84 pytest tests (isolated SQLite DB)
│   └── storage/uploads/           # attachment storage (gitignored contents)
├── frontend/
│   ├── package.json               # React 18, TS, Vite 6, Tailwind, Recharts,
│   │                              # lucide, react-hook-form + zod
│   ├── Dockerfile + nginx.conf    # production container (SPA fallback + proxy)
│   └── src/
│       ├── pages/                 # Landing, Login, Register, Profile,
│       │   ├── citizen/           # Dashboard, SubmitGrievance
│       │   ├── officer/           # Dashboard (queues, SLA indicators)
│       │   └── admin/             # Dashboard(charts), Users, Departments,
│       │                          # AIPerformance, AuditLogs, SLARules, Triage
│       ├── components/            # layout, badges, states, timeline, pagination
│       ├── context/AuthContext.tsx
│       ├── lib/                   # api client (relative URLs), types, formatters
│       └── test/                  # 29 vitest + React Testing Library tests
└── docs/                          # architecture, ER, workflows, security,
                                   # API, deployment, troubleshooting, demo,
                                   # report outline, limitations
```

---

## 4. Database modes

| Mode | When | How |
|---|---|---|
| **SQLite** (default) | Local Windows dev, zero setup | Nothing to do — `backend/smartpetition.db` is created & seeded automatically; tables created via SQLAlchemy; WAL mode + FK enforcement on |
| **PostgreSQL** | Production / Docker | Set `DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/db`, then `python -m alembic upgrade head` |

Data persists across restarts in both modes (verify: restart backend, records remain).

---

## 5. Docker (optional path)

```bash
docker compose up --build
# frontend: http://localhost:8080   backend: http://localhost:8000/docs
```

Compose brings up PostgreSQL 16 (healthchecked), runs Alembic migrations before the API
starts, trains the model inside the backend image, and serves the built SPA through nginx
with `/api` reverse-proxied (browser talks to one origin). Backups: see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 6. Testing

```bat
run_tests.bat          :: everything
```

* **Backend (84 tests, pytest + httpx/TestClient, isolated temp SQLite DB):**
  registration/login/auth failures/rate limiting, RBAC (citizen↔officer↔admin,
  cross-department isolation, internal-note confidentiality), submission & persistence,
  AI classification (all 8 categories, fallback labeling, low-confidence triage flag),
  urgency scoring, duplicate preview/recording/review + P/R evaluation, state machine
  (happy path, invalid edges, rejection reason, resolution summary, reopen window/limit),
  assignment & reassignment history, SLA deadlines (rule precedence), escalation sweep
  (idempotence, notifications, manual trigger), analytics (cross-checked against DB),
  file validation (executables, double extensions, magic bytes, size, traversal,
  private downloads), notifications (honest email status), audit trail, health, and a
  full citizen→officer→admin E2E lifecycle test.
* **Frontend (29 tests, Vitest + React Testing Library + jsdom):**
  landing content & FAQ accordion, registration/login client validation & server-error
  display, submission-form validation (asserts the API is *not* called when invalid),
  dashboard loading/error/empty states, badge honesty (ML vs fallback), formatters.
* **CI (GitHub Actions):** backend lint + dataset generation + training + evaluation +
  pytest; frontend typecheck + build + vitest; Docker image builds; full compose smoke
  test hitting health through the nginx proxy.

---

## 7. Honest limitations (read this)

* The bundled training dataset is **synthetic** (template-generated, ~1,000 rows,
  provenance documented in `backend/app/ai/data/generate_dataset.py`). Near-perfect test
  metrics on it are **not** evidence of real-world accuracy. Train on real labeled
  grievances (with consent/anonymization) before any production claim.
* Novel phrasings can fall below the confidence threshold — by design they go to human
  triage rather than being misrouted.
* Semantic dedup defaults to TF-IDF cosine (lightweight); real sentence embeddings
  require installing the optional `sentence-transformers` (pulls in PyTorch).
* Deadlines are UTC **calendar** hours; business-hours SLAs are a documented extension.
* Rate limiting is single-process in-memory (documented Redis path for multi-instance).

Full list: [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md).

---

## 8. Documentation index

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture diagram, component responsibilities, request lifecycle, timezone policy |
| [docs/ER_DIAGRAM.md](docs/ER_DIAGRAM.md) | Full database ER diagram (17 tables) |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | Citizen/officer/admin workflow diagrams + status state machine |
| [docs/API.md](docs/API.md) | Complete REST API reference (`/api/v1`) |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model & implemented controls |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Cloud deployment, staging/production config, backups, rollback |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Windows-specific fixes for every startup failure mode |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | 10-minute reviewer demo script |
| [docs/PROJECT_REPORT_OUTLINE.md](docs/PROJECT_REPORT_OUTLINE.md) | Final report outline for academic review |
| [docs/LIMITATIONS.md](docs/LIMITATIONS.md) | Known limitations & future enhancements |

---

## 9. Design system

BrowserStack-inspired palette, applied consistently (Tailwind theme in
`frontend/tailwind.config.js`): obsidian header `#141923`, primary royal blue `#0066F5`
(hover `#0055D4`), page `#F8FAFC`, ice-blue sections `#F4F8FE`, white cards, borders
`#E2E8F0`, ink `#111827`, muted `#64748B`, success `#059669`, warning `#D97706`,
error `#DC2626`. Responsive desktop/tablet/mobile, keyboard-navigable, accessible
labels/roles/contrast, skeletons + empty + error states everywhere.
