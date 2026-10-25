# SmartPetition — Deployment Guide (Cloud, Staging, Production)

## 1. Docker Compose (recommended baseline — works on any VM)

```bash
git clone <your-repo> smartpetition && cd smartpetition
cp .env.example .env
#  edit .env: JWT_SECRET (generate!), POSTGRES_PASSWORD, FIRST_ADMIN_*, CORS_ORIGINS
docker compose up -d --build
```

* Frontend: `http://<host>:8080` (nginx serves SPA + proxies `/api` → backend)
* Backend: `http://<host>:8000/docs`
* PostgreSQL data in the `pgdata` volume; uploads in the `uploads` volume.
* Startup order is health-gated: db healthy → alembic upgrade → uvicorn → nginx.
* The backend image trains the AI model at build time (dataset baked in), so the
  container ships with a working classifier; mount a volume over
  `/app/app/ai/model` to persist retrained models across rebuilds.

### Suggested VM sizing
| Tier | CPU | RAM | Notes |
|---|---|---|---|
| Demo/staging | 2 vCPU | 4 GB | compose as-is |
| Production (moderate) | 4 vCPU | 8 GB | separate managed Postgres recommended |

## 2. Managed platform recipes

### Fly.io
```toml
# fly.backend.toml (abridged)
app = "smartpetition-api"
[build] dockerfile = "backend/Dockerfile"
[env] ENVIRONMENT = "production"
[[services]] internal_port = 8000
# secrets: fly secrets set JWT_SECRET=... DATABASE_URL=...
# volume for /app/storage/uploads; use fly postgres for the DB
```
Frontend: deploy `frontend/` as a static site (Vercel/Netlify/Fly) with
`VITE_API_PROXY_TARGET` replaced by real API URL or platform rewrite rules
(`/api/* → https://smartpetition-api.fly.dev/api/*`), and set `CORS_ORIGINS`
to the frontend origin.

### Render / Railway / Heroku-style PaaS
* Backend service: Dockerfile `backend/Dockerfile`, health check path `/api/v1/health`,
  release command `python -m alembic upgrade head`.
* Frontend: static site from `frontend/` (build `npm run build`, publish `dist/`),
  SPA rewrite all routes → `index.html`, proxy `/api` to the backend service.
* Postgres: managed add-on; set `DATABASE_URL` (psycopg2 driver).

### AWS (EC2 or ECS)
* ECS Fargate: two services (api, web) behind one ALB — path rule `/api/*` → api
  target group, `/*` → web target group; RDS PostgreSQL; EFS for uploads;
  secrets in AWS Secrets Manager (`JWT_SECRET`, `SMTP_*`).
* EC2 quick path: install Docker, `docker compose up -d --build`, put Caddy/nginx in
  front with TLS (Caddy auto-HTTPS is the fastest safe option).

## 3. Staging vs production configuration

| Setting | Staging | Production |
|---|---|---|
| `ENVIRONMENT` | `staging` | `production` (hides error internals, disables demo seed) |
| `SEED_DEMO_DATA` | `true` (optional) | **`false`** |
| `JWT_SECRET` | staging-only secret | unique, ≥48 random bytes, rotated on incident |
| `CORS_ORIGINS` | staging URL | exact production origin(s) |
| `DATABASE_URL` | staging Postgres | managed Postgres w/ backups + least-priv user |
| `EMAIL_ENABLED` | true w/ test SMTP | true w/ real provider (SPF/DKIM configured) |
| TLS | platform | mandatory; HSTS at proxy |
| Rate limits | defaults | tune to traffic; move to Redis if >1 API instance |

## 4. Database migrations in deployment

```bash
# inside backend container / release phase — never create_all in production
python -m alembic upgrade head
# create a new migration after model changes:
python -m alembic revision --autogenerate -m "describe change"
```

## 5. Backups & restore

**PostgreSQL (compose example):**
```bash
# backup (cron nightly, keep 14 days)
docker compose exec -T db pg_dump -U smartpetition smartpetition | gzip > backups/sp-$(date +%F).sql.gz
# restore
gunzip -c backups/sp-YYYY-MM-DD.sql.gz | docker compose exec -T db psql -U smartpetition smartpetition
```
**SQLite local mode:** stop the app, copy `backend/smartpetition.db*` (incl. `-wal`).
**Uploads:** archive the `uploads` volume / `backend/storage/uploads` directory
alongside the DB dump so attachments and records stay consistent.
**Verify restores quarterly** — an untested backup is not a backup.

## 6. Rollback procedure

1. Images are tagged per release (`smartpetition-backend:<git-sha>`). Rollback =
   redeploy previous tag: `docker compose up -d --build` with the pinned tag or
   `fly deploy --image <prev>`.
2. Roll back migrations only with the matching `alembic downgrade -1` **if** the
   previous release's schema requires it; prefer forward-fix migrations for data safety.
3. Keep the DB snapshot from just before the failed release (take one pre-deploy).
4. Post-rollback: hit `/api/v1/health`, run the compose smoke test from CI manually,
   and check the audit log for anomalies.

## 7. Monitoring & logging

* Structured stdout logs (`time | level | logger | message`); the SLA scheduler logs
  every sweep — alert on `sla.escalation` bursts and on sweep failures.
* Health endpoints: `/api/v1/health` (status, DB, AI model) and `/health/ready`.
  Docker healthchecks + CI smoke test already use them; point your uptime monitor at
  the same URL.
* Suggested alerts: 5xx rate > 1% (5 min), health ≠ ok (2 consecutive), disk > 80%,
  DB connections > 80% pool, escalation events/hour spike.
* AI monitoring: Admin → AI Performance page (accuracy/macro-F1/confusion matrix from
  the last evaluation) + `ai.category_override` audit actions as a live drift signal —
  a rising override rate means retrain.

## 8. Kubernetes (optional, not required locally)

The compose topology maps 1:1 — api Deployment (readiness `/api/v1/health/ready`),
web Deployment (nginx), Postgres StatefulSet or managed DB, PVC for uploads,
Ingress with `/api` → api Service. Horizontal API scaling requires moving rate-limit
state to Redis (documented) — the SLA scheduler should run as a single leader
(CronJob or one-replica worker) to avoid concurrent sweeps; sweeps are idempotent per
level, so overlap is safe but wasteful.
