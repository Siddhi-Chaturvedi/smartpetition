# SmartPetition — Database ER Diagram

17 tables. Mermaid source below renders on GitHub / VS Code (Markdown Preview Mermaid Support).

```mermaid
erDiagram
    departments ||--o{ users : "employs (officers)"
    departments ||--o{ categories : "responsible for"
    departments ||--o{ grievances : "assigned"
    departments ||--o{ assignments : "targets"

    users ||--o{ grievances : "files (citizen_id)"
    users ||--o{ grievances : "handles (assignee_id)"
    users ||--o{ assignments : "assigned_by / officer"
    users ||--o{ comments : "authors"
    users ||--o{ attachments : "uploads"
    users ||--o{ notifications : "receives"
    users ||--o{ audit_logs : "acts"
    users ||--o{ status_history : "acts"
    users ||--o{ feedback : "rates"

    categories ||--o{ grievances : "final category_id"
    categories ||--o{ grievances : "selected_category_id"

    grievances ||--o{ assignments : "has"
    grievances ||--o{ comments : "has"
    grievances ||--o{ attachments : "has"
    grievances ||--o{ ai_predictions : "recommended for"
    grievances ||--o{ duplicate_candidates : "source"
    grievances ||--o{ duplicate_candidates : "candidate match"
    grievances ||--o{ status_history : "timeline"
    grievances ||--o{ escalation_events : "SLA breaches"
    grievances ||--o{ notifications : "references"
    grievances ||--o| feedback : "rated by citizen"

    sla_rules {
        int id PK
        string scope "global|priority|category|department"
        string scope_value
        int resolution_hours
        int escalation_hours
        bool is_active
    }

    users {
        int id PK
        string email UK "indexed"
        string full_name
        string hashed_password "PBKDF2, never exposed"
        enum role "citizen|officer|admin"
        int department_id FK "nullable"
        string phone
        bool is_active
        bool email_verified
        datetime created_at
        datetime updated_at
    }

    departments {
        int id PK
        string name UK
        string description
        string jurisdictions "csv"
        bool is_active
        datetime created_at
    }

    categories {
        int id PK
        string name UK
        int department_id FK "routing map"
        int sla_resolution_hours
        bool is_active
    }

    grievances {
        int id PK
        string tracking_id UK "SP-YYYYMMDD-HEX, indexed"
        int citizen_id FK
        string title
        text description
        int selected_category_id FK "citizen choice"
        int category_id FK "official decision"
        string location
        string jurisdiction "indexed"
        text address
        float latitude
        float longitude
        enum status "8 states, indexed"
        enum priority "low..critical, indexed"
        text priority_override_reason
        int department_id FK "indexed with status"
        int assignee_id FK
        enum ai_analysis_status "pending|completed|failed|needs_review"
        bool needs_triage "indexed"
        bool is_demo_data
        datetime submitted_at "indexed"
        datetime assigned_at
        datetime due_at "indexed"
        datetime resolved_at
        datetime closed_at
        text resolution_summary
        text rejection_reason
        int reopen_count
        datetime created_at
        datetime updated_at
    }

    assignments {
        int id PK
        int grievance_id FK
        int department_id FK
        int officer_id FK
        int assigned_by FK
        string reason "auto-routing|manual|load-balance"
        bool is_active
        datetime created_at
    }

    comments {
        int id PK
        int grievance_id FK
        int author_id FK
        text body
        bool is_internal "officer notes, hidden from citizens"
        datetime created_at
    }

    attachments {
        int id PK
        int grievance_id FK
        int uploader_id FK
        string original_filename
        string stored_name UK "random hex"
        string content_type
        int size_bytes
        datetime created_at
    }

    ai_predictions {
        int id PK
        int grievance_id FK
        string model_version
        string method "ml_model|fallback_rules"
        string predicted_category
        float confidence
        text top_categories_json
        float urgency_score
        string urgency_level
        text urgency_factors_json
        string recommended_department
        datetime created_at
    }

    duplicate_candidates {
        int id PK
        int grievance_id FK "unique pair (grievance, candidate)"
        int candidate_grievance_id FK
        float score
        string method "tfidf|keyword|embeddings"
        text matched_terms
        enum review_status "pending|confirmed_duplicate|dismissed"
        int reviewed_by FK
        datetime reviewed_at
        datetime created_at
    }

    status_history {
        int id PK
        int grievance_id FK
        string from_status
        string to_status
        int actor_id FK "null = system"
        text note
        datetime created_at
    }

    notifications {
        int id PK
        int user_id FK "indexed"
        string type
        string title
        text body
        int grievance_id FK
        bool is_read "indexed"
        string email_status "not_configured|delivered|failed:*"
        datetime created_at
    }

    audit_logs {
        int id PK
        int actor_id FK "indexed"
        string action "indexed"
        string entity_type
        int entity_id
        text detail "json"
        string ip_address
        datetime created_at "indexed"
    }

    feedback {
        int id PK
        int grievance_id FK UK "one per grievance"
        int citizen_id FK
        int rating "1..5 CHECK"
        text comments
        datetime created_at
    }

    escalation_events {
        int id PK
        int grievance_id FK "unique (grievance, level)"
        int level "1..3"
        string reason
        int notified_count
        datetime created_at
    }

    app_settings {
        string key PK
        text value
        datetime updated_at
    }
```

## Integrity notes

* **Foreign keys** enforced (SQLite `PRAGMA foreign_keys=ON`; PostgreSQL natively).
* **Indexes** on hot paths: `grievances(status,priority)`, `grievances(department_id,status)`,
  `tracking_id`, `submitted_at`, `due_at`, `needs_triage`, `notifications(user_id,is_read)`,
  `audit_logs(action,created_at)`, `users(email)`.
* **Unique constraints**: email, tracking_id, department/category names, duplicate pairs,
  (grievance, escalation level), one feedback per grievance, stored attachment names.
* **Cascades**: grievance children (comments, attachments, history, assignments,
  predictions, candidates, escalations) delete with the grievance; grievances never
  hard-delete in normal operation (rejected/closed retain full history).
* **Transactions**: submission (grievance + AI + duplicates + routing + notifications +
  audit) commits atomically; transitions likewise.
