# SmartPetition — Demo Script (10 minutes, project review)

**Pre-flight (before the reviewers arrive):** run `start_smartpetition.bat`, confirm
browser opens http://localhost:5173, log in once as each demo account so sessions are
warm, and keep http://localhost:8000/docs in a second tab.

---

### 1. Public landing (0:00–1:00) — as guest
* Show hero: problem → solution. Scroll: features, how-it-works, categories,
  transparency panel (audit excerpt), FAQ (click one open), footer.
* Point out the emergency disclaimer (system doesn't replace 112).
* **Say:** "No fake buttons — Submit/Track lead into the real application."

### 2. Citizen submits with live AI (1:00–3:30) — citizen@demo.smartpetition.dev
* Log in (show the demo-accounts hint box on the login card first).
* Dashboard: counts come from the DB (open DevTools network tab → `/analytics/my-stats`).
* **Submit grievance — the showpiece:** type slowly:
  *"A live electrical wire is hanging low over the street in Anna Nagar after the storm.
  A child could be electrocuted any time. The whole street is affected. Emergency needed today."*
  * Watch the AI panel update live: category **electricity**, confidence, priority
    **critical** with the exact fired factors listed, suggested department.
  * Duplicate panel: similar open complaints appear with scores + matched keywords.
* Add a photo attachment (show the allowed-types note). Submit.
* Confirmation screen: **tracking ID**, priority, routed department, AI summary with
  "advisory only" note. Copy the tracking ID.

### 3. Routing & triage transparency (3:30–4:30)
* Submit a deliberately vague second grievance: *"Something is wrong in our area,
  please do the needful."* → AI confidence low → confirmation shows **Triage queue**
  instead of a department.
* **Say:** "Uncertain cases never get misrouted silently — a human reviews them."

### 4. Officer acts (4:30–6:30) — officer@demo.smartpetition.dev
* Officer Queue: critical queue, overdue list, upcoming deadlines — all DB-driven,
  scoped to the Roads department by the backend.
* Open the live-wire case (Electricity dept? then log in as admin and show it — or use
  a roads case). Show: AI prediction card with model version + urgency factors,
  duplicate candidates with Confirm/Dismiss buttons.
* Post an **internal note** (badge: hidden from citizen) and a **citizen-visible update**.
* Transition: Start Review → In Progress → Resolve **with mandatory summary**
  (try resolving without one → show the 409 message).
* Override priority with a reason (show it's mandatory).

### 5. Citizen verifies & closes (6:30–7:30)
* Back to citizen: notification bell shows the resolution notice.
* Timeline shows every step with actors and timestamps. Internal note is NOT visible.
* Give 5-star feedback → Close case. Reopen rules explained (14 days, max 2×).

### 6. Admin control tower (7:30–9:30) — admin credentials from FIRST_ADMIN.txt
* Analytics: totals, overdue, critical, **avg/median resolution, SLA compliance %**,
  category pie, department workload bars, 12-month trend line. Change a filter → numbers move.
* **Triage queue:** assign the vague grievance (correct category → department).
* Departments page: category→department routing map + SLA hours (change one, save).
* SLA page: show rules; click **Run SLA sweep now** → escalations created live
  (this is how we test escalation without waiting for a real deadline). Show escalation
  events list + the OVERDUE notification the officer received.
* AI Performance: accuracy, macro-F1, per-class precision/recall, **confusion matrix**,
  duplicate-detection P/R — and the synthetic-data caveat, stated openly.
* Audit Logs: filter `grievance.status_changed` — every demo action is there with actor + IP.
* Users: create an officer, deactivate, show login blocked (403).

### 7. Engineering closer (9:30–10:00)
* Swagger `/docs` — versioned, documented contracts.
* Run `run_tests.bat` (or show CI green): 84 backend + 29 frontend tests.
* Show `docker compose up --build` config + GitHub Actions workflow file.
* Restart the backend live → data still there (persistence proof).

---

**If something breaks mid-demo:** health endpoint `/api/v1/health` diagnoses DB+AI in one
call; `stop_smartpetition.bat` → `start_smartpetition.bat` recovers a clean state in ~30 s;
demo data is re-seeded automatically and flagged with "Demo data" badges.
