# SmartPetition — Security Documentation

## 1. Threat model summary

| Asset | Threats considered |
|---|---|
| Citizen grievances & attachments (untrusted input) | Injection, XSS via stored text, malicious uploads, IDOR/enumeration |
| Credentials | Password cracking, hash leakage, credential stuffing, brute force |
| Sessions/tokens | Theft, replay, over-long lifetime |
| Internal data (officer notes, audit, AI internals) | Unauthorized disclosure across roles |
| Availability | Upload flooding, auth brute force, runaway queries |
| Operations integrity | Silent failures pretending success (email, AI), unaudited overrides |

## 2. Implemented controls

### Authentication & credentials
* **PBKDF2-HMAC-SHA256, 240,000 iterations**, per-user 16-byte random salt,
  `hmac.compare_digest` constant-time verification. Hashes use a versioned format
  (`pbkdf2_sha256$iterations$salt$dk`) so the algorithm can be upgraded later.
* Password policy: ≥8 chars, letters+numbers (server-enforced via Pydantic).
* Login errors are uniform ("Incorrect email or password") — no user enumeration.
* Deactivated accounts cannot log in (403), tokens of deactivated users fail on every
  request (user re-loaded from DB per request).
* **No shipped default admin password.** First admin comes from env vars or a
  one-time random password printed to console + gitignored `FIRST_ADMIN.txt`.

### Sessions/tokens
* JWT (HS256) bearer tokens, 12 h expiry, `sub`/`role`/`iat`/`exp` claims.
* `JWT_SECRET` env-driven; README/CI use throwaway values; production requires a long
  random secret (documented command to generate).
* Token stored in `localStorage` by the SPA; API auth is header-based, **not cookies**,
  which removes the CSRF surface for the API. (If cookie auth were added, CSRF tokens
  would be required — noted in limitations.)

### Authorization (backend-enforced; UI never trusted)
* RBAC dependency guards: `RequireAdmin`, `RequireOfficerOrAdmin`, per-route role sets.
* State-machine transitions carry the allowed role set per edge; violations → 409.
* **Ownership checks**: citizens see only their grievances; other citizens' IDs return
  **404** (no existence leak). Officers are constrained to their department
  (lists, analytics, actions). Admin endpoints 403 for everyone else.
* Internal comments are filtered at serialization for non-staff viewers; citizens'
  `is_internal=true` attempts are silently downgraded to public comments.
* Admins cannot deactivate or demote themselves (lockout prevention).
* Attachment downloads re-check grievance visibility per request.

### Injection & input handling
* All DB access via SQLAlchemy ORM (parameterized) — no string-built SQL anywhere.
* Pydantic validation on every body/query (length caps, ranges, enums, email format).
* React escapes output by default → stored grievance text cannot execute as HTML (XSS).
* Upload filenames sanitized; `..`/path separators rejected; downloads served with
  `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`.

### File upload hardening
* Extension whitelist (`jpg,jpeg,png,gif,webp,pdf,doc,docx,txt`), configurable.
* **All** filename extension segments checked — `evil.exe.jpg` rejected.
* Explicit denylist of executables/scripts (exe, bat, ps1, sh, js, php, py, dll…).
* Magic-byte verification for jpg/png/gif/pdf — content must match extension.
* 5 MB cap (configurable); stored under random 32-hex names; original names only in DB;
  storage directory outside the web root; downloads authenticated + authorized only.

### Availability & abuse
* Sliding-window rate limiting: auth 10/min/IP, grievance submission 20/min/IP (429 +
  Retry-After). Single-process in-memory by design for local runs; Redis variant
  documented for multi-instance production.
* Pagination caps (`page_size ≤ 100`, export ≤ 10,000 rows, duplicate scan window 500).
* CORS restricted to the configured frontend origins; credentials mode off.

### Secrets & configuration
* `.env` and `FIRST_ADMIN.txt` gitignored; `.env.example` ships safe placeholders only.
* Production mode (`ENVIRONMENT=production`): generic 500 responses (no exception text),
  demo seeding disabled, debug off.
* Password hashes, SMTP credentials and JWT secret never appear in any API response,
  log line, or audit detail.

### Auditability & data integrity
* Append-only `audit_logs` for: auth events (incl. failures, with IP), grievance
  lifecycle, assignments, overrides (priority/category with reasons), duplicate
  decisions, exports, user & config changes, SLA sweeps/escalations.
* AI predictions stored separately from human decisions with model version — overrides
  never mutate the AI record.
* Transactions: submission pipeline and transitions commit atomically.

### Honest failure reporting
* Email: `email_status ∈ {not_configured, delivered, failed:<ExceptionType>}` — the app
  never claims delivery without SMTP confirmation.
* AI: `method ∈ {ml_model, fallback_rules}` surfaced in API and UI badges; AI outage →
  grievance still stored with `ai_analysis_status=failed` and routed to triage.

## 3. Privacy & retention
* Only necessary PII collected (name, email, optional phone, complaint text/location).
* Citizens control their complaint text; attachments private to case participants.
* Retention guidance: grievances + audit are kept for the configured statutory period
  (default: indefinite for auditability); a purge job for closed cases older than N
  years is a documented enhancement (see LIMITATIONS.md).
* Demo/synthetic data is flagged (`is_demo_data`) and contains no real PII.

## 4. LLM integration safety (optional feature)
* Disabled unless `LLM_API_KEY` configured; core flows never depend on it.
* When enabled: grievance text is treated as **untrusted content inside a data block**
  (delimited, instruction-isolated prompt), outputs used only as draft summaries shown
  to staff — never auto-published, never fed back into routing decisions.
* Secrets stay server-side; no citizen PII beyond the complaint text itself is sent.

## 5. Production checklist
1. Strong `JWT_SECRET` (≥48 random bytes) + HTTPS-only termination (TLS at proxy).
2. `ENVIRONMENT=production`, `DEBUG=false`, real `CORS_ORIGINS`.
3. PostgreSQL with least-privilege DB user; migrations via Alembic only.
4. SMTP configured & verified (or explicitly left `EMAIL_ENABLED=false`).
5. Change first-admin password after first login; delete `FIRST_ADMIN.txt`.
6. Nightly `pg_dump` backups (see DEPLOYMENT.md) + tested restore.
7. Redis-backed rate limiting if running multiple API instances.
8. Log shipping/monitoring on the structured stdout logs; alert on 5xx spikes and
   `sla.escalation` volume.
