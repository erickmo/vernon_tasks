# Vernon Tasks — Developer Guide

**App name:** `vernon_tasks`  
**Framework:** Frappe v15+  
**Last updated:** 2026-05-09

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Modules](#modules)
4. [Roles & Permissions](#roles--permissions)
5. [Doctypes Reference](#doctypes-reference)
6. [PDCA State Machines](#pdca-state-machines)
7. [Point Calculation System](#point-calculation-system)
8. [Scheduling Engine](#scheduling-engine)
9. [Hooks & Events](#hooks--events)
10. [Pages](#pages)
11. [Reports](#reports)
12. [Frontend](#frontend)
13. [Development Setup](#development-setup)
14. [Coding Conventions](#coding-conventions)

---

## Overview

Vernon Tasks is a Frappe custom app for task and project management. It combines three methodologies:

- **PDCA** (Plan-Do-Check-Act) — lifecycle phases for tasks and projects
- **OKR** (Objectives and Key Results) — goal alignment and measurement
- **Agile Sprints** — iterative delivery with velocity tracking

The app is role-gated across three actor types (Manager, Leader, Member) and includes a gamified point system that rewards on-time delivery and penalizes late completion and revisions.

---

## Architecture

```
vernon_tasks/
├── task/                   # Core task management
│   ├── doctype/
│   │   ├── vt_task/
│   │   ├── task_dependency/
│   │   ├── task_schedule_entry/
│   │   ├── task_point_log/
│   │   └── recurring_rule/
│   ├── services/
│   │   ├── point_calculator.py
│   │   └── scheduling_engine.py
│   └── report/
│       ├── blocked_tasks_escalation/
│       ├── leader_review_schedule/
│       └── point_override_audit/
├── project/                # Project and sprint management
│   ├── doctype/
│   │   ├── vt_project/
│   │   ├── project_team_member/
│   │   ├── vt_sprint/
│   │   ├── sprint_task/
│   │   ├── project_milestone/
│   │   └── project_documentation/
│   └── report/
│       ├── project_progress_vs_okr/
│       └── sprint_velocity/
├── okr/                    # Objectives and Key Results
│   └── doctype/
│       ├── objective/
│       ├── key_result/
│       ├── kpi_definition/
│       └── kpi_entry/
├── workforce/              # Work profiles and summaries
│   ├── doctype/
│   │   ├── work_profile/
│   │   ├── work_schedule_day/
│   │   ├── user_point_summary/
│   │   └── daily_summary/
│   └── report/
│       ├── my_points_progress/
│       └── team_workload_overview/
├── vt_settings/            # App-wide configuration
│   └── doctype/
│       └── vt_settings/
├── public/
│   └── js/
│       └── page_nav.js
└── hooks.py
```

**Key design principle:** Business logic lives exclusively in `task/services/` and equivalent service modules — never in controller (`*.py`) files or page handlers.

---

## Modules

### task/

Core of the app. Handles the full lifecycle of a `VT Task` from backlog to done, including PDCA phase transitions, Kanban status sync, dependency blocking, scheduled hour distribution, point calculation, and recurring task generation.

### project/

Manages `VT Project` documents, team membership, and sprint planning. Projects have their own PDCA lifecycle. Sprints group tasks into time-boxed iterations.

### okr/

Stores OKR Objectives and measurable Key Results. Projects and tasks can be linked to Objectives for alignment tracking. KPI Definitions and KPI Entries support metric logging.

### workforce/

Tracks individual work profiles (working days, daily capacity), aggregates daily and monthly summaries, and maintains point totals per user per month in `User Point Summary`.

### vt_settings/

Single doctype. App-wide configuration for point multipliers, bonus/penalty rates, and default working hours. All services read settings from here rather than using hardcoded values.

---

## Roles & Permissions

| Role | Description |
|------|-------------|
| `VT Manager` | Full admin access — all doctypes, reports, pages |
| `VT Leader` | Leads projects, reviews tasks, can override points |
| `VT Member` | Regular team member — creates and works on assigned tasks |

All three roles are auto-created on app install via fixtures.

### Authorization Pattern

Whitelisted API functions must validate authorization explicitly:

```python
def get_my_tasks():
    if not frappe.has_role("VT Member"):
        frappe.throw("Not permitted", frappe.PermissionError)
    # ...
```

Do not rely on doctype-level permissions alone for page API endpoints.

---

## Doctypes Reference

### Task Module

| Doctype | Type | Description |
|---------|------|-------------|
| `VT Task` | Document | Main task. Holds PDCA phase, Kanban status, weight, deadlines, assigned user |
| `Task Dependency` | Child Table | Links blocking tasks to a `VT Task`. Parent: `VT Task` |
| `Task Schedule Entry` | Child Table | Scheduled hours per calendar day. Parent: `VT Task` |
| `Task Point Log` | Document | Immutable audit log of every point transaction |
| `Recurring Rule` | Document | Defines recurrence pattern (daily/weekly/monthly) for tasks |

### Project Module

| Doctype | Type | Description |
|---------|------|-------------|
| `VT Project` | Document | Project with PDCA phase, linked sprints, team, milestones |
| `Project Team Member` | Child Table | Team member + role within the project. Parent: `VT Project` |
| `VT Sprint` | Document | Sprint period with start/end dates |
| `Sprint Task` | Child Table | Task entries within a sprint. Parent: `VT Sprint` |
| `Project Milestone` | Document | Named milestone with target date |
| `Project Documentation` | Document | Documents attached to a project |

### OKR Module

| Doctype | Type | Description |
|---------|------|-------------|
| `Objective` | Document | OKR objective with PDCA phase and owner |
| `Key Result` | Document | Measurable result: target value, current value, unit |
| `KPI Definition` | Document | Defines a KPI metric |
| `KPI Entry` | Document | Single KPI data point (value + date) |

### Workforce Module

| Doctype | Type | Description |
|---------|------|-------------|
| `Work Profile` | Document | Per-user work schedule and daily target hours |
| `Work Schedule Day` | Child Table | Working day config (Mon–Sun flags). Parent: `Work Profile` |
| `User Point Summary` | Document | Monthly point totals per user |
| `Daily Summary` | Document | Daily activity summary (hours logged, tasks completed) |

### Settings

| Doctype | Type | Description |
|---------|------|-------------|
| `VT Settings` | Single | App config: multiplier, rates, default hours |

---

## PDCA State Machines

### VT Task

```
BACKLOG → PLAN → DO → CHECK → DONE
                        ↓
                       ACT → DO
```

**Valid transitions:**

| From | To (allowed) |
|------|-------------|
| `BACKLOG` | `PLAN` |
| `PLAN` | `DO` |
| `DO` | `CHECK` |
| `CHECK` | `ACT`, `DONE`, `DO` |
| `ACT` | `DO` |
| `DONE` | _(terminal)_ |

**Kanban status mapping:**

| PDCA Phase | Kanban Status |
|-----------|---------------|
| `BACKLOG` | Backlog |
| `PLAN` | Scheduled |
| `DO` | In Progress |
| `CHECK` | In Review |
| `ACT` | Revision |
| `DONE` | Done |

Kanban status is updated automatically when PDCA phase changes. To bypass PDCA validation during internal state changes (e.g., revision flow), use `db_set()`:

```python
task.db_set("pdca_phase", "ACT", update_modified=False)
```

The constant maps are defined in the controller — never hardcode status strings elsewhere:

```python
PDCA_KANBAN_MAP = {
    "BACKLOG": "Backlog",
    "PLAN": "Scheduled",
    "DO": "In Progress",
    "CHECK": "In Review",
    "ACT": "Revision",
    "DONE": "Done",
}

VALID_PDCA_TRANSITIONS = {
    "BACKLOG": ["PLAN"],
    "PLAN": ["DO"],
    "DO": ["CHECK"],
    "CHECK": ["ACT", "DONE", "DO"],
    "ACT": ["DO"],
    "DONE": [],
}
```

### VT Project

| From | To (allowed) |
|------|-------------|
| `PLAN` | `DO` |
| `DO` | `CHECK` |
| `CHECK` | `ACT`, `CLOSED` |
| `ACT` | `PLAN`, `DO` |
| `CLOSED` | _(terminal)_ |

---

## Point Calculation System

**Module:** `task/services/point_calculator.py`  
**Trigger:** `VT Task.on_submit`

### Formula

```
base               = weight × weight_multiplier
early_bonus        = base × early_bonus_rate × days_early       (if deadline not breached)
late_penalty       = base × late_penalty_rate × |days_late|     (if deadline breached)
revision_deduction = revision_deduct_rate × base × revision_count

earned = base + early_bonus − late_penalty − revision_deduction
```

### Default Rates (VT Settings)

| Setting | Default | Meaning |
|---------|---------|---------|
| `weight_multiplier` | 10 | Base points per weight unit |
| `early_bonus_rate` | 0.05 | 5% of base per day early |
| `late_penalty_rate` | 0.08 | 8% of base per day late |
| `revision_deduct_rate` | 0.10 | 10% of base per revision |

All rates are configurable in `VT Settings`. Services always read from settings — never hardcode rates.

### Transaction Types in Task Point Log

| Type | Description |
|------|-------------|
| `earned` | Base points on task completion |
| `early_bonus` | Bonus for completing before deadline |
| `late_penalty` | Penalty for completing after deadline |
| `revision_deduction` | Penalty per revision cycle |
| `leader_override` | Manual point adjustment by a Leader |

Monthly totals are aggregated in `User Point Summary` (one document per user per month). The calculator upserts this document after each point transaction.

### Leader Override

Leaders can manually adjust points via the `leader_override` transaction type. This creates a `Task Point Log` entry and re-aggregates the monthly summary. Override actions are surfaced in the `point_override_audit` report.

---

## Scheduling Engine

**Module:** `task/services/scheduling_engine.py`

### Functions

#### `distribute_task_schedule(task_name)`

Distributes a task's `estimated_hours` evenly across working days between `start_date` and `deadline`. Respects the assigned user's `Work Profile` (which days they work). Populates `Task Schedule Entry` child rows.

Call this when a task is saved with a new date range or when estimated hours change.

#### `override_schedule_entry(task_name, day, new_hours)`

Overrides a specific day's scheduled hours, then rebalances the remaining hours across other days in the schedule. Use when a member manually adjusts their daily plan.

#### `generate_recurring_tasks()`

Daily scheduler job. Reads all active `Recurring Rule` documents and creates new `VT Task` instances for rules that are due today. New tasks start in `BACKLOG` phase.

#### `check_deadline_notifications()`

Hourly scheduler job. Queries tasks due tomorrow and sends an email notification to the assigned user. Email sending is wrapped in `try/except` — if no outgoing mail server is configured, the error is silently swallowed.

#### `check_capacity_conflict(user, day, hours)`

Returns `True` if adding `hours` to `user`'s schedule on `day` would exceed their daily target from `Work Profile`. Call this before saving schedule overrides or assigning new tasks.

---

## Hooks & Events

### Doc Events (`hooks.py`)

| Doctype | Event | Handler |
|---------|-------|---------|
| `VT Task` | `on_submit` | `point_calculator.calculate_points` |
| `VT Task` | `on_update` | `scheduling_engine.on_task_update` |
| `VT Task` | `validate` | `vt_task.validate_permissions` |
| `VT Project` | `validate` | `vt_project.validate_team` |

### Scheduler Events

| Frequency | Handler |
|-----------|---------|
| Daily | `scheduling_engine.generate_recurring_tasks` |
| Daily | `task.services.overdue.check_overdue_tasks` |
| Daily | `daily_summary.generate_daily_summaries` |
| Hourly | `scheduling_engine.check_deadline_notifications` |

### App Includes

```python
app_include_js = ["assets/vernon_tasks/js/page_nav.js"]
```

Loaded on every Frappe page. The script self-identifies the current page and injects the nav bar only on member and leader pages.

---

## Pages

Four Frappe Pages with Python-backed whitelisted API methods:

### `my_work`

**Audience:** VT Member  
Member's daily work view. Shows today's scheduled tasks from `Task Schedule Entry`, hours planned vs. logged, and quick-action buttons for PDCA transitions.

### `my_dashboard`

**Audience:** VT Member  
Stats overview: cumulative points, task completion rate, current sprint progress. Includes charts rendered on the client side using data fetched from whitelisted methods.

### `leader_dashboard`

**Audience:** VT Leader, VT Manager  
Team-level view: sprint board, member workload, blocked tasks, and OKR alignment summary.

### `leader_review`

**Audience:** VT Leader, VT Manager  
Review queue for tasks in `CHECK` phase awaiting leader approval. Leader can approve (move to `DONE`), reject (move to `ACT`/Revision), or override points directly from this page.

---

## Reports

### Task Module

| Report | Description |
|--------|-------------|
| `blocked_tasks_escalation` | Lists tasks blocked by unresolved dependencies, grouped by assignee |
| `leader_review_schedule` | Tasks currently in `CHECK` phase with time-in-review metric |
| `point_override_audit` | Audit trail of all `leader_override` point transactions |

### Project Module

| Report | Description |
|--------|-------------|
| `project_progress_vs_okr` | Compares project completion percentage against linked OKR progress |
| `sprint_velocity` | Sprint-by-sprint velocity (story points completed per sprint) |

### Workforce Module

| Report | Description |
|--------|-------------|
| `my_points_progress` | Individual point history over time (chart-ready data) |
| `team_workload_overview` | Team capacity: scheduled vs. available hours per member |

### OKR Module

| Report | Description |
|--------|-------------|
| `kpi_achievement` | KPI target vs. actual for a given period |

---

## Frontend

### `public/js/page_nav.js`

Registered globally via `app_include_js`. Runs on every page load and injects a navigation bar at the top of the four Vernon Tasks pages.

**Member nav links:** My Work → My Dashboard  
**Leader nav links:** Leader Dashboard → Leader Review

The script detects the current page route and highlights the active link. All user-facing labels are HTML-escaped before insertion to prevent XSS:

```javascript
function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
    })[c]);
}
```

---

## Development Setup

### Prerequisites

- Python 3.11+
- Frappe Framework v15+
- MariaDB 10.6+ / MySQL 8+
- Node.js 18+ (for asset builds)

### Installation

```bash
cd frappe-bench

# Get the app
bench get-app vernon_tasks <repo-url>

# Install on a site
bench --site <site-name> install-app vernon_tasks

# Run migrations
bench --site <site-name> migrate
```

### Running Tests

```bash
bench --site <site-name> run-tests --app vernon_tasks
```

To run a specific module:

```bash
bench --site <site-name> run-tests --app vernon_tasks --module task
```

### Adding a New Doctype

```bash
# Scaffold
bench new-doctype --module <module> "<DocType Name>"

# Add to fixtures in hooks.py if it should be exported
# Then export fixtures
bench --site <site-name> export-fixtures --app vernon_tasks
```

### Asset Build

```bash
bench build --app vernon_tasks
```

For development with watch:

```bash
bench watch
```

### Fixtures

The app ships fixtures for:

- **Roles:** `VT Manager`, `VT Leader`, `VT Member`
- **Workspaces:** `My Tasks`, `My Projects`, `Overview`
- **VT Settings:** default configuration values

Fixtures are applied automatically on `bench migrate`. To re-export after changes:

```bash
bench --site <site-name> export-fixtures --app vernon_tasks
```

---

## Coding Conventions

### Layer Separation

| Layer | Responsibility | Where |
|-------|---------------|-------|
| Controller (`*.py`) | Frappe hooks, validation, `db_set` calls | `doctype/<name>/<name>.py` |
| Service | Business logic, calculations, algorithms | `task/services/*.py`, etc. |
| Page handler | Request parsing, auth check, response formatting | `page/<name>/<name>.py` |

**Never put business logic in controllers or page handlers.**

### Constants

Define named constants at module level. Never use magic strings or numbers inline:

```python
# Good
WEIGHT_MULTIPLIER_DEFAULT = 10
EARLY_BONUS_RATE_DEFAULT = 0.05

# Bad
base = weight * 10
```

The PDCA maps (`PDCA_KANBAN_MAP`, `VALID_PDCA_TRANSITIONS`) follow the same rule.

### PDCA Transitions

Use `db_set()` to bypass validation during internal state changes that skip the normal hook cycle:

```python
doc.db_set("pdca_phase", "ACT", update_modified=False)
```

Use this only in service functions, never in user-facing controllers.

### Permissions

- `ignore_permissions=True` is allowed **only** in internal service functions that run in a controlled server-side context (e.g., scheduled jobs, triggered hooks).
- Never use `ignore_permissions=True` in whitelisted API functions.
- Whitelisted functions must call `frappe.has_role()` or `frappe.only_for()` at the top.

### Email Notifications

Always wrap email sending in `try/except`:

```python
try:
    frappe.sendmail(recipients=[user_email], subject=subject, message=body)
except Exception:
    pass  # Silently skip if no outgoing mail server is configured
```

### Dependency Injection

Services must not instantiate their own dependencies. Accept configuration or settings objects as parameters:

```python
# Good
def calculate_points(task, settings):
    multiplier = settings.weight_multiplier
    ...

# Bad
def calculate_points(task):
    settings = frappe.get_single("VT Settings")  # hidden dep
    ...
```

### Function Length

No function longer than 40 lines. Extract helpers or split into sub-functions when a function grows beyond this limit.

### Do-Not-Use Patterns

| Pattern | Reason | Alternative |
|---------|--------|-------------|
| Business logic in controller | Tight coupling, untestable | Move to `services/` |
| Magic numbers/strings inline | Obscures intent | Named constants |
| `frappe.db.sql()` for simple queries | Bypasses ORM safety | Use `frappe.get_all()` / `frappe.get_doc()` |
| `ignore_permissions` in page APIs | Security bypass | Explicit role check |
| Bare `except:` | Swallows all errors | `except Exception:` with logging |

---

*Vernon Tasks Developer Guide — maintained by the Vernon Corp engineering team.*
