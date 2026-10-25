# SmartPetition — Architecture

## 1. System overview

```
                        ┌───────────────────────────────────────────────┐
                        │                 Browser (SPA)                 │
                        │  React 18 + TypeScript + Vite + Tailwind      │
                        │  Recharts · lucide · react-hook-form + zod    │
                        └───────────────┬───────────────────────────────┘
                                        │ relative /api/v1/* only
                        dev: Vite proxy │ prod: nginx reverse proxy
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI backend (Python 3.11+)                        │
│                                                                               │
│  Middleware: CORS allowlist · rate limiting (auth/submit) · structured logs   │
│                                                                               │
│  Routers (/api/v1): auth · grievances · ai · departments · analytics ·        │
│                     admin · notifications · health                            │
│        │                                                                      │
│        ▼                                                                      │
│  Services layer                                                               │
│  ├─ workflow        create grievance → AI → duplicates → routing → notify     │
│  ├─ ai_classifier   TF-IDF+LogReg inference (joblib) | labeled rules fallback │
│  ├─ urgency         transparent rule engine (safety/impact/time/policy)       │
│  ├─ duplicates      keyword Jaccard + TF-IDF cosine (+optional embeddings)    │
│  ├─ routing         category→dept map, jurisdiction, confidence, load balance │
│  ├─ state_machine   validated status transitions per role                     │
│  ├─ sla             due dates, escalation levels, idempotent sweep            │
│  ├─ notifications   in-app always; SMTP optional & honestly reported          │
│  ├─ analytics       DB-derived metrics (summary/trends/workload/distribution) │
│  └─ audit           append-only record of significant actions                 │
│        │                                                                      │
│        ▼                                                                      │
│  SQLAlchemy 2 ORM (UTC-safe DateTime) ── Alembic migrations                   │
│                                                                               │
│  Background asyncio tasks (in-process, no dashboard needed):                  │
│   • SLA scheduler — sweep every 60 s (configurable), escalate, notify         │
│   • Feedback reminder — hourly scan of stale resolved cases                   │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │
                ▼
   ┌────────────────────────┐        ┌─────────────────────────────────┐
   │ SQLite (local default) │  or    │ PostgreSQL 16 (docker-compose,  │
   │ WAL mode, FKs enforced │        │ production)                     │
   └────────────────────────┘        └─────────────────────────────────┘

   File storage: backend/storage/uploads (randomized names, private
   authenticated downloads only — never publicly addressable)
```

## 2. Request lifecycle — grievance submission (the core flow)

```
POST /api/v1/grievances  (JWT citizen)
  1. Rate limit check (sliding window per IP)
  2. Pydantic validation (lengths, ranges) → 422 envelope on failure
  3. INSERT grievance + StatusHistory('submitted')        ← stored FIRST,
  4. AI analysis (wrapped):                                  never lost even
       classify → AIPrediction row (method, version,          if AI fails
                  confidence, top-3, urgency factors)
       urgency  → priority on grievance
       failure  → ai_analysis_status='failed', needs_triage=true
  5. Duplicate scan (advisory): DuplicateCandidate rows
       — never blocks, never rejects the submission
  6. Routing:
       effective category = citizen selection OR confident AI (≥0.55)
       mapped active department (+jurisdiction refinement)?
         yes → dept+load-balanced officer, Assignment rows,
               officer notified, due_at = SLA rule
         no  → needs_triage=true → admin triage queue + admin notified
  7. Notifications: submission confirmation to citizen
  8. Audit: grievance.created  → COMMIT (single transaction boundary)
  9. Response: full detail incl. tracking_id, AI prediction, candidates
```

## 3. Key design decisions

| Decision | Rationale |
|---|---|
| Store grievance before AI runs | A valid complaint is never lost to an AI outage; AI status degrades to `pending/failed/needs_review` |
| AI predictions in separate table | Recommendations ≠ decisions. Human category/priority live on the grievance; every prediction (with model version) is preserved for review & model monitoring |
| Confidence threshold → triage | Low-confidence/unmapped cases get human eyes instead of misrouting |
| Duplicates are candidates only | Auto-rejection on similarity would destroy legitimate repeat reports; a human confirms/dismisses, both records preserved |
| Escalation in background task | SLA enforcement must not depend on an open dashboard; interval configurable; manual admin trigger for tests/demos |
| Idempotent escalation levels | Unique (grievance, level) + "already ≥ level" check prevents notification spam |
| UTC calendar hours | One unambiguous timeline; documented to users; business-hours policy is a listed enhancement |
| Bearer JWT, not cookies | No CSRF surface for the API; CORS restricted to the frontend origin; tokens expire (12 h default) |
| PBKDF2 stdlib hashing | 240k iterations, per-user salt, constant-time compare; zero native-build friction on Windows vs bcrypt |
| SQLAlchemy `UTCDateTime` decorator | SQLite returns naive datetimes; the decorator guarantees tz-aware UTC everywhere, eliminating naive/aware comparison bugs |
| Randomized attachment names + magic-byte sniffing | Prevents URL guessing, executable uploads, and content/extension mismatch attacks |
| 404 (not 403) for other citizens' cases | Does not leak existence of private grievances |

## 4. Environment-based configuration

All settings via environment / `.env` (see `.env.example`): `ENVIRONMENT`
(development seeds demo data & first admin; production hides error internals and
never seeds), `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`, AI thresholds, SLA
interval, SMTP, rate limits, upload policy. Secrets are never committed;
`FIRST_ADMIN.txt` is gitignored.

## 5. Timezone handling

* All timestamps are stored and compared as **UTC-aware** datetimes.
* SLA deadlines are **calendar hours** from submission/assignment (not business hours).
* The frontend renders timestamps in the viewer's local timezone via `Intl`.
* The scheduler logs its timezone/interval at startup for auditability.

## 6. Deployment topology

* **Local (Windows):** two processes (uvicorn :8000, vite :5173 with /api proxy).
* **Docker compose:** nginx :8080 (SPA + /api proxy) → uvicorn :8000 → PostgreSQL :5432,
  healthchecks on all three, named volumes for DB + uploads, migrations run before API start.
* **Cloud:** any container host (Fly.io/Render/EC2/Cloud Run); see DEPLOYMENT.md.
