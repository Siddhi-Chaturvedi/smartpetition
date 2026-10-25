# SmartPetition — User Workflow Diagrams

## 1. Grievance status state machine (backend-enforced)

```mermaid
stateDiagram-v2
    [*] --> submitted : Citizen submits
    submitted --> under_review : Officer/Admin
    submitted --> in_progress : Officer/Admin
    submitted --> rejected : Officer/Admin (reason required)
    under_review --> in_progress : Officer/Admin
    under_review --> escalated : Officer/Admin or SLA job
    under_review --> rejected : Officer/Admin (reason required)
    in_progress --> escalated : Officer/Admin or SLA job (auto)
    in_progress --> resolved : Officer/Admin (summary required)
    escalated --> in_progress : Officer/Admin
    escalated --> resolved : Officer/Admin (summary required)
    resolved --> closed : Citizen/Admin
    resolved --> reopened : Citizen (≤14 days, max 2×) / Admin
    closed --> reopened : Citizen (≤14 days, max 2×) / Admin
    rejected --> reopened : Citizen appeal / Admin
    reopened --> under_review : Officer/Admin
    reopened --> in_progress : Officer/Admin
    closed --> [*]
```

* Every edge above is defined once in `backend/app/services/state_machine.py` with the
  authorized roles; any other transition returns **409** with a precise reason.
* The SLA background job performs `open → escalated` automatically at level thresholds.
* `rejected` and `resolved` require documented reasons/summaries (enforced server-side).

## 2. Citizen workflow

```mermaid
flowchart TD
    A[Visit landing page] --> B{Has account?}
    B -- no --> C[Register: email, name, password rules]
    B -- yes --> D[Login JWT]
    C --> D
    D --> E[Citizen Dashboard: real counts, recent cases, notifications]
    E --> F[Submit Grievance form]
    F --> G[Live AI panel: category + confidence + priority factors]
    F --> H[Duplicate preview: similar open complaints + scores]
    H --> I{Still submit?}
    I -- yes --> J[POST grievance + attachments]
    I -- no --> K[Follow existing tracking ID instead]
    J --> L[Confirmation: tracking ID, priority, department or triage]
    L --> M[Track: timeline, officer updates, SLA deadline]
    M --> N{Resolved?}
    N -- yes --> O[Give feedback 1-5 stars]
    O --> P[Close case]
    N -- not really --> Q[Reopen within 14 days with note]
    Q --> M
    M --> R[Add information / photos anytime while open]
    R --> M
```

## 3. Officer workflow

```mermaid
flowchart TD
    A[Login] --> B[Officer Queue: open, critical, overdue, upcoming deadlines]
    B --> C[Open case]
    C --> D[Review AI prediction + urgency factors + duplicate candidates]
    D --> E{Duplicates?}
    E -- confirmed --> F[Mark confirmed duplicate — both records preserved]
    E -- dismissed --> G[Dismiss candidate]
    C --> H[Accept: submitted -> under_review -> in_progress]
    H --> I[Internal investigation notes - hidden from citizen]
    H --> J[Citizen-visible progress updates - citizen notified]
    I --> K{Work done?}
    J --> K
    K -- yes --> L[Resolve with mandatory resolution summary]
    K -- blocked/overdue --> M[Escalate manually or SLA job escalates]
    L --> N[Citizen feedback arrives]
    C --> O[Override priority with mandatory reason - audited]
    C --> P[Reassign within department - load balanced, history kept]
```

## 4. Administrator workflow

```mermaid
flowchart TD
    A[Login as admin] --> B[Analytics: totals, SLA compliance, trends, workload]
    A --> C[Triage queue: low-confidence / unmapped / AI-failed cases]
    C --> D[Correct category + assign department/officer]
    A --> E[Users: create officers/admins, roles, deactivate]
    A --> F[Departments + category routing map + jurisdictions]
    A --> G[SLA rules by scope: global/priority/category/department]
    G --> H[Run SLA sweep now - testable escalation without waiting]
    A --> I[AI performance: accuracy, macro-F1, per-class P/R, confusion matrix, dedup P/R]
    I --> J[Re-run analysis on a grievance after retraining]
    A --> K[Audit logs: filter by action/entity/actor]
    A --> L[CSV exports of authorized data]
```

## 5. Automated SLA & escalation sequence

```mermaid
sequenceDiagram
    participant Job as SLA scheduler (60s)
    participant DB as Database
    participant O as Assigned officer
    participant A as Administrators
    Job->>DB: SELECT open grievances WHERE due_at < now(UTC)
    loop each overdue grievance
        Job->>DB: compute level 1/2/3 from hours overdue vs escalation_hours
        alt level not yet recorded
            Job->>DB: INSERT escalation_event (unique per level)
            Job->>DB: status := escalated + StatusHistory(system)
            Job->>O: notify "OVERDUE (level n)"
            opt level >= 2
                Job->>A: notify "Escalation level n"
            end
        else already escalated at >= level
            Job-->>Job: skip (no duplicate notifications)
        end
    end
```
