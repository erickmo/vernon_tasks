# Vernon Tasks — Actual Schema vs Plan References (2026-05-23)

Audit of every Frappe doctype JSON under `vernon_tasks/vernon_tasks/**/doctype/`
to provide an authoritative field/table mapping for the follow-up agent that
will rewrite `frappe.db.sql` calls in `vernon_tasks/api/*`.

Source of truth: the `*.json` files committed in the repo. Anything not listed
here does not exist as a doctype/field.

---

## Doctype name mapping

| Plan name              | Actual doctype name              | Path                                                                                          | istable |
|------------------------|----------------------------------|-----------------------------------------------------------------------------------------------|---------|
| VT Task                | `VT Task`                        | `vernon_tasks/task/doctype/vt_task/`                                                          | 0       |
| VT Project             | `VT Project`                     | `vernon_tasks/project/doctype/vt_project/`                                                    | 0       |
| VT Project Member      | `Project Team Member`            | `vernon_tasks/project/doctype/project_team_member/`                                            | 1       |
| Project Milestone      | `Project Milestone`              | `vernon_tasks/project/doctype/project_milestone/`                                              | 1       |
| Project Documentation  | `Project Documentation`          | `vernon_tasks/project/doctype/project_documentation/`                                          | 1       |
| VT Sprint              | `VT Sprint`                      | `vernon_tasks/project/doctype/vt_sprint/`                                                     | 0       |
| VT Sprint Task         | `Sprint Task`                    | `vernon_tasks/project/doctype/sprint_task/`                                                   | 1       |
| VT Objective           | `Objective`                      | `vernon_tasks/okr/doctype/objective/`                                                          | 0       |
| VT Key Result          | `Key Result`                     | `vernon_tasks/okr/doctype/key_result/`                                                         | 0       |
| VT KPI Definition      | `KPI Definition`                 | `vernon_tasks/okr/doctype/kpi_definition/`                                                     | 0       |
| VT KPI Entry           | `KPI Entry`                      | `vernon_tasks/okr/doctype/kpi_entry/`                                                          | 0       |
| VT Task Point Log      | `Task Point Log`                 | `vernon_tasks/task/doctype/task_point_log/`                                                    | 0       |
| VT Task Schedule Entry | `Task Schedule Entry`            | `vernon_tasks/task/doctype/task_schedule_entry/`                                               | 1       |
| VT Task Dependency     | `Task Dependency`                | `vernon_tasks/task/doctype/task_dependency/`                                                   | 1       |
| VT Recurring Rule      | `Recurring Rule`                 | `vernon_tasks/task/doctype/recurring_rule/`                                                    | 0       |
| VT Report Subscription | `VT Report Subscription`         | `vernon_tasks/task/doctype/vt_report_subscription/`                                            | 0       |
| —                      | `VT Report Subscription Recipient` | `vernon_tasks/task/doctype/vt_report_subscription_recipient/`                                | 1       |
| Work Profile           | `Work Profile`                   | `vernon_tasks/workforce/doctype/work_profile/`                                                 | 0       |
| Work Schedule Day      | `Work Schedule Day`              | `vernon_tasks/workforce/doctype/work_schedule_day/`                                            | 1       |
| Daily Summary          | `Daily Summary`                  | `vernon_tasks/workforce/doctype/daily_summary/`                                                | 0       |
| User Point Summary     | `User Point Summary`             | `vernon_tasks/workforce/doctype/user_point_summary/`                                           | 0       |
| VT Settings            | `VT Settings`                    | `vernon_tasks/vt_settings/doctype/vt_settings/`                                                | 0       |
| Vernon Push Subscription | `Vernon Push Subscription`     | `vernon_tasks/vt_settings/doctype/vernon_push_subscription/`                                   | 0       |
| Vernon Push Preference | `Vernon Push Preference`         | `vernon_tasks/vt_settings/doctype/vernon_push_preference/`                                     | 0       |
| Vernon Telemetry Event | `Vernon Telemetry Event`         | `vernon_tasks/vt_settings/doctype/vernon_telemetry_event/`                                     | 0       |
| VT Contact Request     | `VT Contact Request`             | `vernon_tasks/vt_settings/doctype/vt_contact_request/`                                         | 0       |

Note: **no doctype is prefixed `VT` for Objective / Key Result / Task Point Log
/ Task Schedule Entry / Project Team Member / Sprint Task / KPI*.** Tables are
`tabObjective`, `tabKey Result`, `tabTask Point Log`, etc.

---

## VT Task fields  (table: `tabVT Task`)

| Plan field        | Actual field                | Notes                                                                 |
|-------------------|-----------------------------|------------------------------------------------------------------------|
| `assignee`        | `assigned_to`               | Link → User                                                            |
| `subject` / `name`| `title`                     | Data; doc `name` is autoname                                           |
| `due_date`        | `deadline`                  | Date                                                                   |
| `completed_on`    | `completion_date`           | Date                                                                   |
| `plan_started_on` | `start_date`                | Date                                                                   |
| `points`          | `earned_points`             | also `base_points`, `leader_override_points`, `weight`                |
| `status`          | `kanban_status`             | enum: Backlog/Scheduled/In Progress/In Review/Revision/Done/Blocked    |
| `phase`           | `pdca_phase`                | enum: BACKLOG/PLAN/DO/CHECK/ACT/DONE                                   |
| `linked_kr`       | (missing)                   | no FK to Key Result on VT Task                                         |
| `risk_flag`       | (missing)                   | no risk flag stored; derive from blocked_days_threshold logic         |
| `priority`        | `priority`                  | Low/Medium/High/Critical                                               |
| `project`         | `project`                   | Link → VT Project                                                      |
| `sprint`          | `sprint`                    | Link → VT Sprint                                                       |
| `kanban_rank`     | `kanban_rank`               | Float                                                                  |
| `estimated_hours` | `estimated_hours`           | Float                                                                  |
| `actual_hours`    | `actual_hours`              | Float                                                                  |
| review fields     | `review_estimated_hours`, `review_scheduled_date` |                                              |
| override          | `override_reason`, `rejection_note`, `revision_count` |                                       |
| recurring         | `is_recurring`, `recurring_rule`, `next_occurrence`, `parent_task` |                                  |
| child tables      | `dependencies` (Task Dependency), `schedule_entries` (Task Schedule Entry) |                              |

---

## VT Project fields  (`tabVT Project`)

| Plan field     | Actual field      | Notes |
|----------------|-------------------|-------|
| `name_`        | `title`           | doc name = autoname |
| `owner_user`   | `project_owner`   | Link → User |
| `leader`       | `project_leader`  | Link → User |
| `start_date`   | `start_date`      | |
| `end_date`     | `end_date`        | |
| `status`       | `status`          | Open/On Track/At Risk/Closed |
| `phase`        | `pdca_phase`      | PLAN/DO/CHECK/ACT/CLOSED |
| `objective`    | `objective`       | Link → Objective |
| members        | `team_members` (child: `Project Team Member`) | |
| milestones     | `milestones` (child: `Project Milestone`) | |
| docs           | `documentation` (child: `Project Documentation`) | |
| thresholds     | `blocked_days_threshold`, `slip_pct_threshold`, `capacity_pct_threshold` | |

### Project Team Member (`tabProject Team Member`, child)
- `user` (Link User), `role` (Owner/Leader/Member), `is_also_leader` (Check)
- Parent linkage via standard child columns: `parent`, `parenttype`, `parentfield`.

---

## VT Sprint fields  (`tabVT Sprint`)

| Plan field    | Actual field   | Notes |
|---------------|----------------|-------|
| `title`       | `sprint_title` | Data |
| `project`     | `project`      | Link → VT Project |
| `start_date`  | `start_date`   | |
| `end_date`    | `end_date`     | |
| `status`      | `status`       | Planning/Active/Review/Closed |
| `goal`        | `goal`         | Small Text |
| `tasks`       | `tasks` (child: `Sprint Task`) | child table has only `task` (Link → VT Task) |

> NOTE: most code joins tasks via `tabVT Task.sprint = sprint.name` (Link
> on the task), not via the `Sprint Task` child. Both representations exist.

### Sprint Task (`tabSprint Task`, child)
- `task` (Link → VT Task) + standard `parent`, `parenttype`, `parentfield`.

---

## Objective fields  (`tabObjective`)

| Plan field        | Actual field        |
|-------------------|---------------------|
| `title`           | `title`             |
| `period`          | `period`            |
| `period_start`    | `period_start`      |
| `period_end`      | `period_end`        |
| `owner`           | `objective_owner`   |
| `status`          | `status`            |
| `phase`           | `pdca_phase`        |
| `description`     | `description`       |

## Key Result fields  (`tabKey Result`)

| Plan field            | Actual field        |
|-----------------------|---------------------|
| `objective`           | `objective`         |
| `metric` / `name`     | `metric`            |
| `target`              | `target_value`      |
| `current`             | `current_value`     |
| `unit`                | `unit`              |
| `progress` / `pct`    | `progress_percent`  |

No `linked_kr` back-reference on VT Task — relationship is Objective → Key Result only.

---

## Task Point Log  (`tabTask Point Log`)

| Plan field | Actual field |
|-----------|--------------|
| `task` | `task` (Link → VT Task) |
| `user` | `user` |
| `type` | `transaction_type` (earned, early_bonus, late_penalty, revision_deduction, leader_override) |
| `amount` | `amount` |
| `original` | `original_amount` |
| `override_by` | `overridden_by` |
| `at` | `log_timestamp` (Datetime) |
| `note` | `note` |

---

## Task Schedule Entry  (`tabTask Schedule Entry`, child of VT Task)
- `date`, `allocated_hours`, `is_override` (+ parent/parenttype/parentfield).

## Task Dependency  (`tabTask Dependency`, child of VT Task)
- `blocked_by` (Link → VT Task), `dependency_type` (Finish-to-Start/Start-to-Start).

## Recurring Rule  (`tabRecurring Rule`)
- `rule_type` (Daily/Weekly/Monthly/Custom), `interval`, `days_of_week`, `day_of_month`, `end_date`, `max_occurrences`.

## VT Report Subscription  (`tabVT Report Subscription`)
- `slug`, `title`, `cron`, `format` (csv/pdf), `enabled`, `filters_json`,
  `recipients` (Table MultiSelect → `VT Report Subscription Recipient` with `user` Link),
  `last_run_at`, `last_status`.

---

## Missing doctypes (referenced in plan, do not exist yet)

These must be **stubbed out, NULL’d, or migrated** before the SQL can compile:

- **VT Employee Capacity / Employee Capacity** — no doctype. Closest substitute:
  `Work Profile` + `Work Schedule Day` (child) under `workforce/`.
- **VT Risk Event / Risk Event** — no doctype. No `risk_flag` column on VT Task either.
- **VT Task `linked_kr`** — no field. Tasks are linked to projects/sprints; KR
  attribution can only be inferred via `VT Project.objective` → Key Result.
- **VT Task `completed_on` / `plan_started_on`** — use `completion_date` /
  `start_date` instead.
- **VT Project `owner_user` / `leader`** — use `project_owner` / `project_leader`.
- **Sprint `title`** — use `sprint_title`.

---

## Existing tables that should be used (not the VT-prefixed versions)

| Wrong (in plan) | Correct |
|-----------------|---------|
| `tabVT Objective` | `tabObjective` |
| `tabVT Key Result` | `tabKey Result` |
| `tabVT Task Point Log` | `tabTask Point Log` |
| `tabVT Task Schedule Entry` | `tabTask Schedule Entry` |
| `tabVT Task Dependency` | `tabTask Dependency` |
| `tabVT Project Member` | `tabProject Team Member` |
| `tabVT Sprint Task` | `tabSprint Task` |
| `tabVT Recurring Rule` | `tabRecurring Rule` |
| `tabVT KPI Definition` | `tabKPI Definition` |
| `tabVT KPI Entry` | `tabKPI Entry` |

Correct tables that already match plan: `tabVT Task`, `tabVT Project`,
`tabVT Sprint`, `tabVT Report Subscription`, `tabVT Settings`,
`tabVernon Push Subscription`, `tabVernon Push Preference`,
`tabVernon Telemetry Event`, `tabVT Contact Request`.

---

## SQL alias recipe (for follow-up agent)

Apply these mechanical rewrites inside any `frappe.db.sql` string under
`vernon_tasks/api/*`:

### Table renames
```text
`tabVT Objective`         → `tabObjective`
`tabVT Key Result`        → `tabKey Result`
`tabVT Task Point Log`    → `tabTask Point Log`
`tabVT Task Schedule Entry` → `tabTask Schedule Entry`
`tabVT Task Dependency`   → `tabTask Dependency`
`tabVT Project Member`    → `tabProject Team Member`
`tabVT Sprint Task`       → `tabSprint Task`
`tabVT Recurring Rule`    → `tabRecurring Rule`
```

### VT Task column aliases (project the legacy names in SELECT)
```sql
SELECT
  t.assigned_to       AS assignee,
  t.title             AS subject,
  t.deadline          AS due_date,
  t.completion_date   AS completed_on,
  t.start_date        AS plan_started_on,
  t.earned_points     AS points,            -- or COALESCE(t.leader_override_points, t.earned_points, t.base_points)
  t.kanban_status     AS status,
  t.pdca_phase        AS phase,
  NULL                AS linked_kr,         -- column does not exist
  0                   AS risk_flag,         -- column does not exist
  t.project, t.sprint, t.priority,
  t.estimated_hours, t.actual_hours,
  t.kanban_rank
FROM `tabVT Task` t
```

### VT Project column aliases
```sql
SELECT
  p.title           AS name_,
  p.project_owner   AS owner_user,
  p.project_leader  AS leader,
  p.pdca_phase      AS phase,
  p.status, p.start_date, p.end_date, p.objective
FROM `tabVT Project` p
```

### VT Sprint column aliases
```sql
SELECT s.sprint_title AS title, s.project, s.start_date, s.end_date,
       s.status, s.goal
FROM `tabVT Sprint` s
```

### Objective / Key Result
```sql
SELECT o.title, o.period, o.period_start, o.period_end,
       o.objective_owner AS owner, o.status, o.pdca_phase AS phase
FROM `tabObjective` o
LEFT JOIN `tabKey Result` kr ON kr.objective = o.name
       -- kr.metric, kr.target_value, kr.current_value, kr.progress_percent
```

### Task Point Log
```sql
SELECT l.task, l.user, l.transaction_type AS type,
       l.amount, l.original_amount, l.overridden_by,
       l.log_timestamp AS at, l.note
FROM `tabTask Point Log` l
```

### Sprint membership via child OR via Task.sprint
- Existing code uses `tabVT Task.sprint = sprint.name` (preferred — fewer joins).
- The child table `tabSprint Task` (cols `task`, `parent`, `parenttype`, `parenttype='VT Sprint'`) exists but is redundant for tasks that already carry `sprint` FK.

### Drop / NULL out (no schema support)
- `linked_kr`, `risk_flag` → project `NULL` to keep callers compiling.
- Employee capacity / risk-event queries → return `[]` until those doctypes exist.

---

## Quick sanity grep targets (to verify after rewrite)

After the follow-up rewrite, none of these should appear in
`vernon_tasks/api/*.py` except inside comments:

```text
tabVT Objective | tabVT Key Result | tabVT Task Point Log
tabVT Project Member | tabVT Sprint Task | tabVT Recurring Rule
\.linked_kr | \.risk_flag | \.completed_on | \.plan_started_on
SELECT [^,]*\bassignee\b(?! AS) | SELECT [^,]*\bdue_date\b(?! AS)
```
