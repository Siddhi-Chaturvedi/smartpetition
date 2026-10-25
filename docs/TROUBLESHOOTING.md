# SmartPetition — Installation & Troubleshooting Guide (Windows 10/11)

Every failure mode below was reproduced and the fix verified during development.

## Startup script issues

### "Python 3.11+ was not found"
* Install: `winget install Python.Python.3.12` or from python.org.
* **Must tick "Add python.exe to PATH"** in the installer.
* Already installed but still failing? Open a *new* terminal (PATH refresh) and check
  `python --version`. Microsoft Store alias interfering? Settings → Apps → Advanced app
  settings → App execution aliases → turn off `python.exe`/`python3.exe` aliases.

### "Port 8000 is already in use"
```bat
netstat -ano | findstr :8000          :: note the PID (last column)
taskkill /PID <pid> /F
```
Or SmartPetition is already running — use `stop_smartpetition.bat` first.

### Backend window flashes a traceback and the launcher reports "not healthy"
Read the `SmartPetitionBackend` window (it stays open — that is by design):
| Error | Fix |
|---|---|
| `ModuleNotFoundError: No module named 'fastapi'` | venv incomplete: delete `.venv` folder, re-run `start_smartpetition.bat` |
| `sqlalchemy.exc.OperationalError … locked` | Another backend instance holds the SQLite file → `stop_smartpetition.bat`, start again |
| `Address already in use` | Port conflict — see above |
| `PermissionError … uploads` | Run the script from a folder your user owns (not `C:\Program Files`) |

### "Node.js was NOT found"
The launcher says this explicitly and starts **only the backend** (it never pretends the
frontend is running). Install: `winget install OpenJS.NodeJS.LTS`, open a new terminal,
re-run the script.

### `npm install` / `npm ci` fails
* Corporate proxy: `npm config set proxy http://user:pass@proxy:port` (and `https-proxy`).
* Stale cache: `npm cache clean --force`, delete `frontend\node_modules`, retry.
* Execution policy error on `npm.ps1`: run `npm.cmd` instead, or
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell.

### Frontend window shows a different port (5174…)
5173 was occupied so Vite picked the next free port — use the URL printed in the
`SmartPetitionFrontend` window. The launcher only auto-opens 5173; to avoid this,
free port 5173 (`netstat -ano | findstr :5173` → `taskkill /PID <pid> /F`).

### Browser opens but shows "Cannot reach the SmartPetition server"
Backend died after startup — check the backend window for the traceback, fix, and
re-run. The frontend proxies `/api` to `127.0.0.1:8000`; if you changed the backend
port, set `VITE_API_PROXY_TARGET=http://127.0.0.1:<port>` before `npm run dev`.

## Database issues

### "I restarted and lost my data"
You won't — SQLite persists at `backend\smartpetition.db`. If data appears missing,
verify you didn't delete the file or run with a different `DATABASE_URL`. Check:
```bat
cd backend
..\.venv\Scripts\python -c "from app.database import SessionLocal; from app.models import Grievance; db=SessionLocal(); print('grievances:', db.query(Grievance).count())"
```

### Reset everything (fresh start)
```bat
stop_smartpetition.bat
del backend\smartpetition.db*
rmdir /s /q backend\storage\uploads    :: optional: delete attachments
start_smartpetition.bat                :: re-seeds, prints a NEW admin password
```

### Switching to PostgreSQL
1. Set `DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/smartpetition` in `.env`.
2. Python ≤3.12: `pip install psycopg2-binary` (already in requirements via marker).
   Python 3.13: use `psycopg[binary]` and URL scheme `postgresql+psycopg://…`.
3. `cd backend && python -m alembic upgrade head`
4. Start normally. Or simply use `docker compose up --build` (Postgres included).

## AI model issues

### UI shows "Rule Fallback" badge
No trained model file. Train it (~5 s):
```bat
cd backend
..\.venv\Scripts\python -m app.ai.data.generate_dataset
..\.venv\Scripts\python -m app.ai.train_model
```
Restart the backend. Health endpoint reports `ai_model: …(trained)`.

### Model predictions look wrong on unusual wording
Expected with synthetic training data — low-confidence cases are routed to **Triage**
by design. Admin → AI Performance shows real metrics; retrain with your own labeled
CSV (same `text,category` format) and hit *Re-run AI analysis* on affected cases.

## Email notifications

In-app notifications always work. Email requires SMTP in `.env`
(`EMAIL_ENABLED=true`, `SMTP_HOST`, …). Each notification stores an honest
`email_status`: `not_configured`, `delivered`, or `failed:<reason>` — check it in the
`notifications` table if mail doesn't arrive.

## Tests

```bat
run_tests.bat
```
* Backend tests create their own isolated temp SQLite DB — they never touch your dev data.
* If `pytest` reports `ImportError: app…`, run it from the `backend` directory
  (the .bat does this for you).
* Frontend tests: `cd frontend && npm test`.

## Getting help / reporting a bug
Include: the full text of the failing window, `python --version`, `node --version`,
your OS build (`winver`), and the last 30 lines of the backend log. Check
`/api/v1/health` output too — it reports DB and AI state in one place.
