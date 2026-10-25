# SmartPetition — Final Project Report Outline

Use this outline to structure the academic/final report. Section hints reference the
delivered artifacts so every claim can be backed with real code, tests or screenshots.

## 1. Introduction
* 1.1 Problem statement: civic grievance misrouting, duplication, opacity, SLA misses.
* 1.2 Objectives (map to the 10 vision pillars in README §2).
* 1.3 Scope & stakeholders: citizens, department officers, administrators.
* 1.4 Report organization.

## 2. Literature / Background Survey
* 2.1 Existing grievance systems (CPGRAMS, municipal portals) & gaps.
* 2.2 Text classification for short civic texts (TF-IDF vs embeddings vs LLMs).
* 2.3 Duplicate detection techniques (keyword, semantic similarity).
* 2.4 SLA/escalation patterns in ticketing systems (ITIL influence).
* 2.5 DevOps for civic tech: CI/CD, containers, observability.

## 3. Requirements & System Design
* 3.1 Functional requirements per role (README §2 tables → requirements IDs).
* 3.2 Non-functional: security, performance, availability, transparency, testability.
* 3.3 Architecture diagram (docs/ARCHITECTURE.md §1) + component responsibilities.
* 3.4 Database design: ER diagram (docs/ER_DIAGRAM.md), normalization notes, indexes.
* 3.5 State machine design (docs/WORKFLOWS.md §1) + authorization matrix.
* 3.6 UI/UX: design system (palette table), accessibility decisions, responsive strategy.
* 3.7 API design: versioning, error envelope, auth scheme (docs/API.md).

## 4. AI/ML Methodology
* 4.1 Dataset: synthetic generator design, provenance & limitations statement
  (backend/app/ai/data/generate_dataset.py header).
* 4.2 Preprocessing pipeline: word+char n-gram TF-IDF, sublinear TF, stop words.
* 4.3 Model: Logistic Regression (class-weight balanced), hyperparameters, persistence
  (joblib bundle: pipeline + version + metrics + provenance).
* 4.4 Evaluation: accuracy, macro-F1, per-class P/R, confusion matrix
  (python -m app.ai.evaluate_model; Admin → AI Performance screenshots).
* 4.5 Urgency engine: rule catalog, weights, explainability output samples.
* 4.6 Duplicate detection: hybrid scoring formula (0.6·semantic + 0.4·keyword + context
  boosts), labeled-set P/R results, human-in-the-loop review policy.
* 4.7 Fallback strategy & honest labeling (ml_model vs fallback_rules).
* 4.8 Optional LLM integration & prompt-injection considerations (docs/SECURITY.md §4).

## 5. Implementation
* 5.1 Backend: FastAPI layering (routers → services → models), key code walkthroughs
  (submission pipeline, state machine, SLA sweep).
* 5.2 Frontend: component tree, state management (AuthContext), form validation
  (RHF+Zod), live AI UX, dashboards & charts.
* 5.3 Database & migrations: Alembic workflow, SQLite/PostgreSQL dual mode.
* 5.4 Background jobs: asyncio scheduler design, idempotent escalation levels.
* 5.5 Security implementation summary (docs/SECURITY.md §2, with code references).

## 6. DevOps & Quality Assurance
* 6.1 Repository layout, .gitignore/.env hygiene.
* 6.2 Windows automation: start/stop/test scripts (flowchart of start_smartpetition.bat).
* 6.3 Docker: images, compose topology, healthchecks, build-time model training.
* 6.4 CI/CD: GitHub Actions stages (lint→train→evaluate→test→build→compose smoke),
  branch policy, "deploy only when green".
* 6.5 Testing strategy & results: 84 backend + 29 frontend tests, categories table,
  coverage of acceptance criteria; isolated test DB approach.
* 6.6 Monitoring: structured logs, health endpoints, AI drift signal (override audit).

## 7. Results & Verification
* 7.1 Acceptance criteria matrix (spec §26) — each row: PASS + evidence
  (test name, screenshot, or command output).
* 7.2 Model performance tables (with the synthetic-data caveat, explicitly).
* 7.3 Duplicate detection P/R + confusion matrix.
* 7.4 SLA/escalation demonstration (manual sweep before/after screenshots).
* 7.5 Performance observations (local run): request latency, sweep duration.

## 8. Discussion
* 8.1 What worked: human-in-the-loop AI, honest fallbacks, transaction-safe submission.
* 8.2 Trade-offs: in-memory rate limiting, TF-IDF dedup vs embeddings, calendar vs
  business hours, single-process scheduler.
* 8.3 Ethics: synthetic data disclosure, no auto-rejection, emergency disclaimer,
  algorithmic transparency (factors shown to users).

## 9. Conclusion & Future Work
* Summarize delivered system vs objectives; pointer to docs/LIMITATIONS.md roadmap
  (real-data training, embeddings dedup, business-hours SLA, email verification flow,
  Redis rate limiting, multi-tenant jurisdictions, mobile app, LLM summaries).

## Appendices
* A. Installation & demo instructions (README §1, docs/DEMO_SCRIPT.md).
* B. Full API reference (docs/API.md).
* C. Test inventory (pytest/vitest output).
* D. Source tree listing; E. Sample audit-log export; F. CI run screenshots.
