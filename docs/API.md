# SmartPetition API Reference (`/api/v1`)

Live interactive docs: **http://localhost:8000/docs** (Swagger UI) and `/redoc`.
All request/response bodies are Pydantic-validated. Auth: `Authorization: Bearer <JWT>`.

## Error envelope (consistent everywhere)

```json
{ "detail": "human-readable message" }
{ "detail": "Validation failed", "errors": [{ "field": "title", "message": "…" }] }
```

Status codes: 200/201 success · 204 no content · 401 unauthenticated · 403 forbidden ·
404 not found **or not visible to you** (ownership hiding) · 409 conflict (invalid
transition, duplicate email, missing required reason) · 422 validation · 429 rate-limited
(with `Retry-After`).

## Health
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | none | status, version, DB check, AI model state (used by Docker/CI/startup script) |
| GET | `/health/ready` | none | readiness probe |

## Auth & profile
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | none (rate-limited) | citizen self-registration → JWT + user |
| POST | `/auth/login` | none (rate-limited) | email+password → JWT + user |
| GET | `/auth/me` | any | current profile (never includes hash) |
| PATCH | `/auth/me` | any | update name/phone |
| POST | `/auth/change-password` | any | requires current password + strength rules |

## Grievances
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/grievances` | citizen | submit → runs AI + duplicates + routing + SLA; returns full detail incl. `tracking_id` |
| POST | `/grievances/preview-duplicates` | any | pre-submission similarity check (candidates, scores, matched terms) |
| GET | `/grievances` | any (role-scoped) | paginated list; filters: `status`, `priority`, `category_id`, `department_id` (admin), `search`, `overdue`, `needs_triage`, `date_from/to`, `sort=newest|oldest|due|priority`, `page`, `page_size` |
| GET | `/grievances/export/csv` | officer/admin | CSV of authorized scope (audited) |
| GET | `/grievances/{id}` | owner/dept/admin | full detail: comments (internal hidden from citizens), history, assignments, AI predictions, duplicate candidates, feedback, `is_overdue` |
| GET | `/grievances/by-tracking/{tracking_id}` | as above | lookup by public tracking ID |
| GET | `/grievances/{id}/allowed-transitions` | as above | workflow edges available to *your role* |
| POST | `/grievances/{id}/transition` | role-checked | `{to_status, note, resolution_summary?, rejection_reason?}` — validated against the state machine; 409 on invalid |
| POST | `/grievances/{id}/priority-override` | officer/admin | `{priority, reason}` — reason mandatory, audited |
| POST | `/grievances/{id}/assign` | officer/admin | `{department_id?, officer_id?, reason}` — assignment history kept, officer notified |
| POST | `/grievances/{id}/category-correction` | officer/admin | human override of AI category; AI record preserved; audited |
| POST | `/grievances/{id}/comments` | owner/dept/admin | `{body, is_internal}` — citizens can never post internal; visible updates notify the other party |
| POST | `/grievances/{id}/attachments` | owner/dept/admin | multipart upload; extension whitelist + magic-byte sniffing + size cap; executables/double-extensions/traversal rejected (422) |
| GET | `/grievances/{id}/attachments/{attId}` | owner/dept/admin | private authenticated download (`nosniff`, `default-src 'none'`) |
| POST | `/grievances/{id}/feedback` | owner citizen | `{rating 1..5, comments}` — only after resolution, once per grievance |
| POST | `/grievances/duplicates/{candidateId}/review?decision=confirmed_duplicate|dismissed` | officer/admin | human duplicate review; both records always preserved |

## AI
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/ai/classify` | any | `{text}` → category, confidence, top-3, `method` (`ml_model`/`fallback_rules`), version, priority, urgency score + factors, recommended department |
| GET | `/ai/model-info` | any | honest model state + synthetic-data caveat |
| GET | `/ai/evaluation` | admin | accuracy, macro-F1, per-class P/R, confusion matrix, dedup P/R |
| POST | `/ai/grievances/{id}/reanalyze` | officer/admin | append a fresh prediction (e.g. after retraining) |

## Departments & categories
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/departments` | any | list (routing transparency) |
| POST/PATCH | `/departments`, `/departments/{id}` | admin | create/update, activate/deactivate |
| GET | `/departments/{id}/officers` | dept officer/admin | officers + open-case load |
| GET | `/categories` | any | list with dept mapping + SLA hours |
| POST/PATCH | `/categories`, `/categories/{id}` | admin | manage category→department routing map |

## Analytics (all numbers from live DB queries)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/analytics/summary` | officer/admin | totals by status, overdue, critical, reopened, triage, avg/median resolution hours, SLA %, feedback avg; filters: department/category/priority/status/dates; officers forced to own department |
| GET | `/analytics/categories` | officer/admin | category distribution |
| GET | `/analytics/departments` | officer/admin | workload: total/open/overdue per department |
| GET | `/analytics/trends?months=12` | officer/admin | monthly submitted vs resolved |
| GET | `/analytics/priorities` | officer/admin | priority distribution |
| GET | `/analytics/my-stats` | citizen | own counts for the citizen dashboard |

## Admin
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET/POST/PATCH | `/admin/users…` | admin | list/search, create officer/admin/citizen, change role/dept/active (self-demotion & self-deactivation blocked) |
| GET/POST/DELETE | `/admin/sla-rules…` | admin | SLA rules (scopes: global/priority/category/department; upsert semantics) |
| POST | `/admin/sla/run-sweep` | admin | manual escalation sweep → `{scanned, overdue, escalations_created, notifications}` (test escalations without waiting) |
| GET | `/admin/escalations` | admin | escalation event history |
| GET | `/admin/audit-logs` | admin | filter by action/entity/actor, paginated |
| GET/PUT | `/admin/settings…` | admin | app settings key/value |
| GET | `/admin/triage-queue` | admin | grievances needing human routing |

## Notifications
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/notifications?limit&unread_only` | any | own notifications + unread count |
| POST | `/notifications/{id}/read` · `/notifications/read-all` | any | mark read |

## Rate limits
`POST /auth/login|register`: 10/min/IP · `POST /grievances*`: 20/min/IP → 429 + `Retry-After`.
