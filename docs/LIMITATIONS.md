# SmartPetition — Known Limitations & Future Enhancements

Stated plainly, because an honest system document is part of the deliverable.

## AI/ML
| Limitation | Impact | Mitigation today | Future work |
|---|---|---|---|
| Training data is **synthetic** (template-generated, ~1,000 rows) | Near-perfect test metrics do **not** generalize; real-world accuracy unknown | Provenance documented in code + UI caveat + report requirement | Collect real labeled grievances (consent/anonymized), retrain, track drift via `ai.category_override` audit rate |
| TF-IDF bag-of-words core | Misses deep semantics/paraphrase beyond n-gram overlap | Confidence threshold routes uncertain cases to human triage | Fine-tuned transformer or embedding features; multilingual (Tamil/Hindi) support |
| English-only rules & training text | Non-English complaints → low confidence → triage | Triage catches them | Language detection + translation layer or multilingual model |
| Urgency is rule-based | Coverage limited to the keyword catalog | Fully transparent & configurable; officers can override | Learn weights from historical resolution data; keep explanations |
| Duplicate detection uses TF-IDF cosine by default | Semantic-only duplicates (no shared keywords) may score low | Keyword+context blending; labeled-set P/R published | Optional `sentence-transformers` path is already implemented behind a flag — install & enable `USE_SENTENCE_TRANSFORMERS=true` |
| No LLM by default | Summaries/suggested responses unavailable offline | Graceful: feature is optional, never required | Wire the configured `LLM_*` settings to a provider with the documented prompt-injection safeguards |

## Platform & operations
| Limitation | Impact | Mitigation | Future |
|---|---|---|---|
| Rate limiting is in-memory per process | Multi-instance deployments don't share counters | Single-instance local/compose default; documented | Redis-backed limiter |
| SLA deadlines are UTC **calendar** hours | No business-hour/holiday calendars | Documented everywhere; configurable rule scopes | Business-hours engine with holiday calendars per jurisdiction |
| Scheduler runs inside the API process | Restart pauses sweeps briefly; sweep on startup catches up | Idempotent levels prevent duplicate notifications | Separate worker (Celery/arq) + distributed lock for multi-replica |
| Email verification flow simplified | Dev mode marks emails verified; SMTP mode requires verification but no token UI yet | Documented in SECURITY.md | Token-based verification emails + resend flow |
| Single-jurisdiction demo data | Routing rules for jurisdiction conflicts are simple | Jurisdiction matching implemented & configurable | Multi-tenant jurisdictions, boundary GIS polygons on maps |
| SQLite default concurrency | Fine for local/demo; write contention under heavy load | WAL mode enabled; Postgres one env-var away | Postgres in every shared environment (compose already does this) |
| No map view for coordinates | lat/long stored but not visualized | Location text shown | Leaflet/Mapbox cluster map of grievances |
| Attachments on local disk | Not shared across API replicas | Volume-mounted in compose | S3-compatible object storage with signed URLs |
| Purge/retention job not automated | Data kept indefinitely | Retention guidance in SECURITY.md | Scheduled anonymization/purge per policy |
| Frontend bundle ~860 KB (charts+icons) | First load heavier than ideal | gzip/brotli in nginx; caching headers | Route-level code splitting, icon tree-shaking audit |

## Deliberate non-goals (v1)
* No public anonymous tracking without login (privacy of case details).
* No auto-rejection/auto-merging of duplicates — human review is the policy.
* No emergency dispatch integration — the UI explicitly directs life-threatening
  situations to 112; SmartPetition is a grievance system, not an emergency service.
* Kubernetes manifests are optional guidance only; compose is the supported baseline.
