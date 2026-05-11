# Vernon Tasks — API Reference

Version: 1.0  
App: `vernon_tasks`  
Framework: Frappe v15+

---

## Table of Contents

1. [Introduction](#introduction)
2. [Authentication](#authentication)
3. [Request & Response Format](#request--response-format)
4. [Error Reference](#error-reference)
5. [My Work Page APIs](#my-work-page-apis)
6. [My Dashboard Page APIs](#my-dashboard-page-apis)
7. [Leader Dashboard Page APIs](#leader-dashboard-page-apis)
8. [Leader Review Page APIs](#leader-review-page-apis)
9. [Point Calculator Service APIs](#point-calculator-service-apis)
10. [Scheduling Engine Service APIs](#scheduling-engine-service-apis)
11. [Data Models Reference](#data-models-reference)
12. [Standard Frappe REST API](#standard-frappe-rest-api)

---

## Introduction

Vernon Tasks is a Frappe custom app that implements a PDCA (Plan-Do-Check-Act) based task management system with point calculation, scheduling, and leader review workflows.

All custom API endpoints are Python functions decorated with `@frappe.whitelist()` and are invoked via Frappe's standard `POST /api/method/<dotted.python.path>` convention.

The PDCA phase lifecycle for a task is:

```
BACKLOG → PLAN → DO → CHECK → DONE
                  ↑       |
                  └── ACT ┘   (returned after leader rejection)
```

---

## Authentication

### Session Cookie (Browser)

When using Vernon Tasks through a browser, authentication is handled automatically via the Frappe session cookie set at login.

Include the CSRF token header on every mutating request:

```
X-Frappe-CSRF-Token: <token>
```

Retrieve the token from `frappe.csrf_token` in a browser JS context, or via:

```
GET /api/method/frappe.auth.get_logged_user
```

### API Key / Secret (Programmatic)

For server-to-server or CLI access, use HTTP Basic-style token authentication:

```
Authorization: token <api_key>:<api_secret>
```

Generate a key/secret pair from the Frappe User form: **Menu → API Access → Generate Keys**.

### Role Requirements

| Role | Description |
|------|-------------|
| Any authenticated user | Access to personal My Work and My Dashboard endpoints |
| `VT Leader` | Access to Leader Dashboard and Leader Review endpoints |
| `VT Manager` | All Leader permissions plus point/schedule override endpoints |

---

## Request & Response Format

### Request

All whitelisted endpoints accept `POST` requests with a JSON body:

```
POST /api/method/<dotted.python.path>
Content-Type: application/json
X-Frappe-CSRF-Token: <token>

{"param1": "value1", "param2": "value2"}
```

Parameters can alternatively be sent as `application/x-www-form-urlencoded` form data.

### Successful Response

Frappe wraps the Python return value in a `message` envelope:

```json
{
  "message": <return_value>
}
```

`<return_value>` may be an object, array, string, number, or `null` depending on the endpoint.

### Error Response

Errors return an appropriate HTTP 4xx or 5xx status code with a JSON body:

```json
{
  "exc_type": "ValidationError",
  "exception": "frappe.exceptions.ValidationError: Task is blocked",
  "_server_messages": "[{\"message\": \"Task is blocked by an incomplete dependency.\"}]"
}
```

The human-readable message is always in `_server_messages` (a JSON-encoded array of message objects).

---

## Error Reference

| HTTP Status | Frappe Exception | Meaning |
|-------------|-----------------|---------|
| `400` | `BadRequest` | Malformed request or missing required parameters |
| `403` | `PermissionError` | Caller is not authorized to perform this action |
| `404` | `DoesNotExistError` | The requested resource does not exist |
| `417` | `ValidationError` | Business rule violation (invalid state, blocked task, etc.) |
| `500` | `Exception` | Unexpected server error |

### PDCA Transition Error Example

```json
{
  "_server_messages": "[{\"message\": \"Invalid PDCA transition: DO → DONE. Allowed next phase: CHECK\"}]"
}
```

---

## My Work Page APIs

**Module path:** `vernon_tasks.task.page.my_work.my_work`

These endpoints serve the personal **My Work** page. All endpoints operate on the currently authenticated user (`frappe.session.user`) and require no special roles beyond being logged in.

---

### `get_my_day`

Returns today's scheduled tasks for the current user, ordered by priority then deadline.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.get_my_day
```

**Authentication:** Any authenticated user

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.get_my_day
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {
      "name": "VT-TASK-00042",
      "title": "Write unit tests for invoice module",
      "project": "VT-PROJ-00005",
      "priority": "High",
      "pdca_phase": "DO",
      "kanban_status": "In Progress",
      "allocated_hours": 2.5
    },
    {
      "name": "VT-TASK-00051",
      "title": "Code review: payment gateway PR",
      "project": "VT-PROJ-00005",
      "priority": "Medium",
      "pdca_phase": "PLAN",
      "kanban_status": "Open",
      "allocated_hours": 1.0
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Task ID (e.g., `VT-TASK-00042`) |
| `title` | string | Task title |
| `project` | string | Parent project ID |
| `priority` | string | `Critical` / `High` / `Medium` / `Low` |
| `pdca_phase` | string | Current PDCA phase |
| `kanban_status` | string | Kanban column label |
| `allocated_hours` | float | Hours scheduled for today from Task Schedule Entry |

**Notes**
- Tasks in `DONE` phase are excluded.
- Ordered by priority (`High` → `Medium` → `Low`), then by `deadline` ascending.

---

### `get_what_to_do_today`

Returns a prioritized list of unblocked tasks due within the next 3 days. Useful for "what should I work on now?" recommendations.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.get_what_to_do_today
```

**Authentication:** Any authenticated user

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.get_what_to_do_today
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {
      "name": "VT-TASK-00038",
      "title": "Deploy staging environment",
      "project": "VT-PROJ-00003",
      "priority": "High",
      "deadline": "2026-05-11",
      "pdca_phase": "PLAN",
      "kanban_status": "Open"
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Task ID |
| `title` | string | Task title |
| `project` | string | Parent project ID |
| `priority` | string | `Critical` / `High` / `Medium` / `Low` |
| `deadline` | string | Date in `YYYY-MM-DD` format |
| `pdca_phase` | string | Current PDCA phase |
| `kanban_status` | string | Kanban column label |

**Notes**
- Excludes tasks in `DONE` and `ACT` phases.
- Excludes tasks blocked by incomplete dependencies.
- Only includes tasks with `deadline` within the next 3 calendar days (inclusive of today).

---

### `get_my_blocked_tasks`

Returns all tasks assigned to the current user that are blocked by incomplete dependencies.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.get_my_blocked_tasks
```

**Authentication:** Any authenticated user

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.get_my_blocked_tasks
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {
      "name": "VT-TASK-00055",
      "title": "Migrate production database",
      "project": "VT-PROJ-00007",
      "priority": "Critical",
      "deadline": "2026-05-15",
      "pdca_phase": "PLAN",
      "kanban_status": "Open",
      "blocker_name": "VT-TASK-00049",
      "blocker_title": "Backup production database",
      "blocker_assignee": "dba@example.com",
      "days_blocked": 3
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Blocked task ID |
| `title` | string | Blocked task title |
| `project` | string | Parent project ID |
| `priority` | string | Task priority |
| `deadline` | string | Task deadline (`YYYY-MM-DD`) |
| `pdca_phase` | string | Current PDCA phase |
| `kanban_status` | string | Kanban column label |
| `blocker_name` | string | ID of the blocking task |
| `blocker_title` | string | Title of the blocking task |
| `blocker_assignee` | string | User assigned to the blocking task |
| `days_blocked` | int | Number of days the task has been blocked |

**Notes**
- Ordered by `days_blocked` descending (longest-blocked tasks first).

---

### `start_task`

Transitions a task from `BACKLOG` or `PLAN` phase into the `DO` phase (kanban: "In Progress").

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.start_task
```

**Authentication:** Must be the assigned user of the task

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | Yes | Task ID (e.g., `VT-TASK-00001`) |

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.start_task
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{
  "task": "VT-TASK-00042"
}
```

**Response**

```json
{
  "message": {
    "status": "ok"
  }
}
```

**Error Cases**

| HTTP Status | Condition |
|-------------|-----------|
| `404` | Task does not exist |
| `403` | Caller is not the assigned user of the task |
| `417` | Task is not in `BACKLOG` or `PLAN` phase |
| `417` | Task is still blocked by an incomplete dependency |

---

### `submit_for_review`

Transitions a task from `DO` phase into the `CHECK` phase (kanban: "In Review"), signaling the leader to review it.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.submit_for_review
```

**Authentication:** Must be the assigned user of the task

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task` | string | Yes | Task ID |

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_work.my_work.submit_for_review
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{
  "task": "VT-TASK-00042"
}
```

**Response**

```json
{
  "message": {
    "status": "ok"
  }
}
```

**Error Cases**

| HTTP Status | Condition |
|-------------|-----------|
| `404` | Task does not exist |
| `403` | Caller is not the assigned user of the task |
| `417` | Task is not in `DO` phase |

---

## My Dashboard Page APIs

**Module path:** `vernon_tasks.task.page.my_dashboard.my_dashboard`

These endpoints power the personal **My Dashboard** page. All endpoints operate on the currently authenticated user and require no special roles.

---

### `get_employee_stats`

Returns high-level productivity statistics for the current user.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_employee_stats
```

**Authentication:** Any authenticated user

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_employee_stats
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": {
    "done_today": 2,
    "done_week": 8,
    "points_month": 342.5,
    "blocked": 1
  }
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `done_today` | int | Number of tasks completed (moved to `DONE`) today |
| `done_week` | int | Number of tasks completed this ISO calendar week |
| `points_month` | float | Sum of `earned_points` for tasks completed in the current calendar month |
| `blocked` | int | Count of tasks currently blocked by dependencies |

---

### `get_daily_completions`

Returns daily task completion counts for the last 7 days (for rendering a completion trend chart).

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_daily_completions
```

**Authentication:** Any authenticated user

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_daily_completions
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {"date": "2026-05-03", "count": 1},
    {"date": "2026-05-04", "count": 0},
    {"date": "2026-05-05", "count": 3},
    {"date": "2026-05-06", "count": 2},
    {"date": "2026-05-07", "count": 0},
    {"date": "2026-05-08", "count": 1},
    {"date": "2026-05-09", "count": 4}
  ]
}
```

**Response Fields**

Always returns exactly 7 items (one per day), oldest first. Days with no completions return `count: 0`.

| Field | Type | Description |
|-------|------|-------------|
| `date` | string | Date in `YYYY-MM-DD` format |
| `count` | int | Number of tasks completed on that date |

---

### `get_hours_summary`

Returns the total estimated vs. actual hours for the current user's active tasks.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_hours_summary
```

**Authentication:** Any authenticated user

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.my_dashboard.my_dashboard.get_hours_summary
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": {
    "actual_hours": 12.5,
    "estimated_hours": 18.0
  }
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `actual_hours` | float | Sum of `actual_hours` across active tasks |
| `estimated_hours` | float | Sum of `estimated_hours` across active tasks |

**Notes**
- "Active" means not in `DONE` or `ACT` phase.

---

## Leader Dashboard Page APIs

**Module path:** `vernon_tasks.task.page.leader_dashboard.leader_dashboard`

These endpoints power the **Leader Dashboard** page. All endpoints require the caller to have the `VT Leader` or `VT Manager` role.

---

### `get_leader_stats`

Returns high-level team performance statistics.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_leader_stats
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_leader_stats
Content-Type: application/json
Authorization: token api_key:api_secret

{}
```

**Response**

```json
{
  "message": {
    "pending_review": 3,
    "approval_rate": 87.5,
    "team_points_month": 1240.0
  }
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `pending_review` | int | Count of tasks in `CHECK` phase with kanban status "In Review" |
| `approval_rate` | float | Percentage of this month's `DONE` tasks that had zero revisions (`revision_count = 0`) |
| `team_points_month` | float | Sum of `earned_points` for all `DONE` tasks completed in the current calendar month |

**Error Cases**

| HTTP Status | Condition |
|-------------|-----------|
| `403` | Caller does not have `VT Leader` or `VT Manager` role |

---

### `get_phase_distribution`

Returns the count of tasks in each PDCA phase for the leader's team.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_phase_distribution
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_phase_distribution
Content-Type: application/json
Authorization: token api_key:api_secret

{}
```

**Response**

```json
{
  "message": [
    {"phase": "BACKLOG", "count": 14},
    {"phase": "PLAN",    "count": 5},
    {"phase": "DO",      "count": 9},
    {"phase": "CHECK",   "count": 3},
    {"phase": "ACT",     "count": 1},
    {"phase": "DONE",    "count": 42}
  ]
}
```

**Notes**
- Always returns all 6 phases in PDCA sequence order, even if count is 0.

---

### `get_team_leaderboard`

Returns the top 10 team members ranked by points earned in the current month.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_team_leaderboard
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_team_leaderboard
Content-Type: application/json
Authorization: token api_key:api_secret

{}
```

**Response**

```json
{
  "message": [
    {"member": "alice@example.com", "points": 312.5},
    {"member": "bob@example.com",   "points": 278.0},
    {"member": "carol@example.com", "points": 251.0}
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `member` | string | User email address |
| `points` | float | Total earned points for the current month |

**Notes**
- Returns at most 10 entries, ordered by `points` descending.

---

### `get_overdue_tasks`

Returns all overdue tasks (deadline passed, not yet complete) across the leader's team.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_overdue_tasks
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_dashboard.leader_dashboard.get_overdue_tasks
Content-Type: application/json
Authorization: token api_key:api_secret

{}
```

**Response**

```json
{
  "message": [
    {
      "task_name": "VT-TASK-00029",
      "task_title": "Complete security audit report",
      "member": "dave@example.com",
      "deadline": "2026-05-05",
      "phase": "DO",
      "days_overdue": 4
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `task_name` | string | Task ID |
| `task_title` | string | Task title |
| `member` | string | Assigned user email |
| `deadline` | string | Original deadline (`YYYY-MM-DD`) |
| `phase` | string | Current PDCA phase |
| `days_overdue` | int | Number of calendar days past deadline |

**Notes**
- Excludes tasks in `DONE` and `ACT` phases.
- Ordered by `days_overdue` descending (most overdue first).

---

## Leader Review Page APIs

**Module path:** `vernon_tasks.task.page.leader_review.leader_review`

These endpoints power the **Leader Review** page. Endpoints are scoped to projects where the caller is the project leader (either via the `project_leader` field on VT Project or a Project Team Member record with `role = 'Leader'`).

---

### `get_review_queue`

Returns all tasks awaiting review (in `CHECK` phase) across the leader's projects.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.get_review_queue
```

**Authentication:** Must be project leader of at least one project

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.get_review_queue
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {
      "name": "VT-TASK-00060",
      "title": "Implement OAuth2 login flow",
      "project": "VT-PROJ-00003",
      "priority": "High",
      "deadline": "2026-05-10",
      "assigned_to": "alice@example.com",
      "pdca_phase": "CHECK",
      "kanban_status": "In Review",
      "estimated_hours": 8.0,
      "review_scheduled_date": "2026-05-09"
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Task ID |
| `title` | string | Task title |
| `project` | string | Parent project ID |
| `priority` | string | `Critical` / `High` / `Medium` / `Low` |
| `deadline` | string | Task deadline (`YYYY-MM-DD`) |
| `assigned_to` | string | Assignee email |
| `pdca_phase` | string | Always `CHECK` for this queue |
| `kanban_status` | string | Kanban column label |
| `estimated_hours` | float | Originally estimated hours |
| `review_scheduled_date` | string | Scheduled review date (`YYYY-MM-DD`), or `null` |

**Notes**
- Ordered by priority (`Critical` → `High` → `Medium` → `Low`), then `deadline` ascending.

---

### `get_team_workload`

Returns current active task hour load per team member, with capacity indicators.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.get_team_workload
```

**Authentication:** Must be project leader of at least one project

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.get_team_workload
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {
      "assigned_to": "alice@example.com",
      "total_hours": 22.5,
      "capacity": 20.0,
      "overloaded": true
    },
    {
      "assigned_to": "bob@example.com",
      "total_hours": 14.0,
      "capacity": 20.0,
      "overloaded": false
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `assigned_to` | string | User email |
| `total_hours` | float | Sum of `estimated_hours` for all active tasks |
| `capacity` | float | Max weekly hours from VT Settings |
| `overloaded` | bool | `true` if `total_hours > capacity` |

**Notes**
- "Active" means not in `DONE` or `BACKLOG` phase.
- `capacity` is sourced from the global VT Settings doctype.

---

### `get_team_blocked_tasks`

Returns all blocked tasks across the leader's projects.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.get_team_blocked_tasks
```

**Authentication:** Must be project leader of at least one project

**Request Parameters:** None

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.get_team_blocked_tasks
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{}
```

**Response**

```json
{
  "message": [
    {
      "name": "VT-TASK-00055",
      "title": "Migrate production database",
      "project": "VT-PROJ-00007",
      "priority": "Critical",
      "deadline": "2026-05-15",
      "assigned_to": "dave@example.com",
      "pdca_phase": "PLAN",
      "kanban_status": "Open",
      "blocker_name": "VT-TASK-00049",
      "blocker_title": "Backup production database",
      "blocker_assignee": "dba@example.com",
      "days_blocked": 3
    }
  ]
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Blocked task ID |
| `title` | string | Blocked task title |
| `project` | string | Parent project ID |
| `priority` | string | Task priority |
| `deadline` | string | Task deadline (`YYYY-MM-DD`) |
| `assigned_to` | string | Assigned user email |
| `pdca_phase` | string | Current PDCA phase |
| `kanban_status` | string | Kanban column label |
| `blocker_name` | string | ID of the blocking task |
| `blocker_title` | string | Title of the blocking task |
| `blocker_assignee` | string | User assigned to the blocking task |
| `days_blocked` | int | Days the task has been blocked |

---

### `approve_task`

Approves a task in `CHECK` phase, transitioning it to `DONE` and triggering point calculation.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.approve_task
```

**Authentication:** Must be the project leader of the task's project

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Task ID (e.g., `VT-TASK-00001`) |

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.approve_task
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{
  "task_name": "VT-TASK-00060"
}
```

**Response**

```json
{
  "message": {
    "status": "ok"
  }
}
```

**Notes**
- Transitions the task `CHECK → DONE`.
- Submits the Frappe document, which triggers the `on_submit` hook for point calculation.
- Uses a row-level database lock (`SELECT ... FOR UPDATE`) to prevent duplicate concurrent approvals.
- Sets `completion_date` to today's date.

**Error Cases**

| HTTP Status | Condition |
|-------------|-----------|
| `404` | Task does not exist |
| `403` | Caller is not the project leader for this task's project |
| `417` | Task is not in `CHECK` phase |

---

### `reject_task`

Rejects a task in `CHECK` phase, sending it back to `DO` with a revision note.

**Endpoint**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.reject_task
```

**Authentication:** Must be the project leader of the task's project

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Task ID |
| `reason` | string | Yes | Rejection reason to communicate to the assignee |

**Request Example**

```
POST /api/method/vernon_tasks.task.page.leader_review.leader_review.reject_task
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{
  "task_name": "VT-TASK-00060",
  "reason": "Please add integration tests and update the README with setup instructions."
}
```

**Response**

```json
{
  "message": {
    "status": "ok"
  }
}
```

**Notes**
- Transitions the task `CHECK → DO` (kanban: "In Progress").
- Increments `revision_count` by 1.
- Saves the `reason` to the `rejection_note` field on the task.

**Error Cases**

| HTTP Status | Condition |
|-------------|-----------|
| `403` | Caller is not the project leader for this task's project |
| `417` | `reason` is empty or blank |
| `417` | Task is not in `CHECK` phase |

---

## Point Calculator Service APIs

**Module path:** `vernon_tasks.task.services.point_calculator`

These are internal service functions that are also exposed as callable API endpoints. Callers must be `VT Leader` or `VT Manager`.

---

### `apply_revision_deduction`

Applies a point deduction for a task revision. Increments the revision count, transitions the task to `ACT` phase, deducts points, and notifies the assignee.

**Endpoint**

```
POST /api/method/vernon_tasks.task.services.point_calculator.apply_revision_deduction
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Task ID |

**Request Example**

```
POST /api/method/vernon_tasks.task.services.point_calculator.apply_revision_deduction
Content-Type: application/json
Authorization: token api_key:api_secret

{
  "task_name": "VT-TASK-00060"
}
```

**Response**

```json
{
  "message": null
}
```

**Notes**
- Deduction formula: `deduction = revision_deduct_rate × base_points` (rates configured in VT Settings).
- Sends an email notification to the task assignee.
- Does not return a value; use document events or re-fetch the task to observe the change.

---

### `override_points`

Manually overrides the earned points on a completed task. Logs the delta and notifies the assignee.

**Endpoint**

```
POST /api/method/vernon_tasks.task.services.point_calculator.override_points
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Task ID |
| `new_points` | float | Yes | The new point value to assign |
| `reason` | string | Yes | Justification for the override |
| `overridden_by` | string | Yes | Email of the leader performing the override |

**Request Example**

```
POST /api/method/vernon_tasks.task.services.point_calculator.override_points
Content-Type: application/json
Authorization: token api_key:api_secret

{
  "task_name": "VT-TASK-00060",
  "new_points": 95.0,
  "reason": "Exceptional quality — delivered ahead of schedule with full documentation.",
  "overridden_by": "leader@example.com"
}
```

**Response**

```json
{
  "message": null
}
```

**Notes**
- Sets `leader_override_points` on the task.
- Appends a record to the Task Point Log with the delta (`new_points - earned_points`).
- Updates the User Point Summary for the assignee's current period.
- Sends an email notification to the assignee.

---

## Scheduling Engine Service APIs

**Module path:** `vernon_tasks.task.services.scheduling_engine`

---

### `distribute_task_schedule`

Distributes a task's estimated hours evenly across working days between `start_date` and `deadline`, creating Task Schedule Entry rows for each day.

**Endpoint**

```
POST /api/method/vernon_tasks.task.services.scheduling_engine.distribute_task_schedule
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Task ID |

**Request Example**

```
POST /api/method/vernon_tasks.task.services.scheduling_engine.distribute_task_schedule
Content-Type: application/json
Authorization: token api_key:api_secret

{
  "task_name": "VT-TASK-00042"
}
```

**Prerequisites**

The task must have all of these fields set before calling:
- `start_date`
- `deadline`
- `assigned_to`
- `estimated_hours`

**Response**

```json
{
  "message": {
    "conflicts": ["2026-05-12"],
    "days_scheduled": 5,
    "hours_per_day": 1.6
  }
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `conflicts` | array of string | Dates (`YYYY-MM-DD`) where adding the scheduled hours exceeds the user's daily capacity from VT Settings |
| `days_scheduled` | int | Number of working days the task was distributed across |
| `hours_per_day` | float | Hours assigned to each non-conflicting working day |

**Error Cases**

| HTTP Status | Condition |
|-------------|-----------|
| `417` | Any of the required fields (`start_date`, `deadline`, `assigned_to`, `estimated_hours`) is missing |
| `417` | There are no working days in the date range (e.g., a weekend-only range) |

---

### `override_schedule_entry`

Overrides the scheduled hours for a specific day on a task, then rebalances the remaining hours across all non-overridden days.

**Endpoint**

```
POST /api/method/vernon_tasks.task.services.scheduling_engine.override_schedule_entry
```

**Authentication:** `VT Leader` or `VT Manager`

**Request Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_name` | string | Yes | Task ID |
| `day` | string | Yes | The specific day to override (`YYYY-MM-DD`) |
| `new_hours` | float | Yes | The new hour allocation for that day |

**Request Example**

```
POST /api/method/vernon_tasks.task.services.scheduling_engine.override_schedule_entry
Content-Type: application/json
Authorization: token api_key:api_secret

{
  "task_name": "VT-TASK-00042",
  "day": "2026-05-12",
  "new_hours": 3.0
}
```

**Response**

```json
{
  "message": null
}
```

**Notes**
- The specified day is marked as manually overridden and will not be adjusted in future rebalance operations.
- The remaining hours (`estimated_hours - sum of overridden days`) are redistributed evenly across all non-overridden scheduled days.

---

## Data Models Reference

### VT Task

| Field | Type | Description |
|-------|------|-------------|
| `name` | Data | Auto-generated ID (e.g., `VT-TASK-00001`) |
| `title` | Data | Task title |
| `project` | Link(VT Project) | Parent project |
| `assigned_to` | Link(User) | Assignee |
| `pdca_phase` | Select | `BACKLOG` / `PLAN` / `DO` / `CHECK` / `ACT` / `DONE` |
| `kanban_status` | Select | Synced from `pdca_phase`; displayed in Kanban view |
| `priority` | Select | `Critical` / `High` / `Medium` / `Low` |
| `weight` | Float | Task weight multiplier for point calculation |
| `start_date` | Date | Scheduled start date |
| `deadline` | Date | Due date |
| `completion_date` | Date | Set automatically when task moves to `DONE` |
| `estimated_hours` | Float | Originally estimated effort in hours |
| `actual_hours` | Float | Actual hours logged against the task |
| `base_points` | Float | Calculated base points (set on document submit) |
| `earned_points` | Float | Net points after bonuses and penalties |
| `leader_override_points` | Float | Manual point override set by a leader |
| `revision_count` | Int | Number of times the task was rejected and returned to `DO` |
| `is_recurring` | Check | Whether this task recurs on a schedule |
| `recurring_rule` | Link(Recurring Rule) | Recurrence rule document |
| `next_occurrence` | Date | Date when the next recurring instance will be created |
| `parent_task` | Link(VT Task) | Reference to the parent task for recurring children |
| `review_scheduled_date` | Date | Date when the leader has scheduled the review |
| `rejection_note` | Text | Reason provided by the leader when rejecting a task |

**PDCA Phase → Kanban Status Mapping**

| PDCA Phase | Kanban Status |
|------------|---------------|
| `BACKLOG` | `Open` |
| `PLAN` | `Open` |
| `DO` | `In Progress` |
| `CHECK` | `In Review` |
| `ACT` | `In Progress` |
| `DONE` | `Completed` |

---

### VT Project

| Field | Type | Description |
|-------|------|-------------|
| `name` | Data | Auto-generated project ID |
| `project_name` | Data | Human-readable display name |
| `project_owner` | Link(User) | Project owner (typically a manager) |
| `project_leader` | Link(User) | Primary leader responsible for reviews |
| `pdca_phase` | Select | `PLAN` / `DO` / `CHECK` / `ACT` / `CLOSED` |
| `start_date` | Date | Project start date |
| `end_date` | Date | Project target end date |
| `linked_objective` | Link(Objective) | Optional OKR objective link |

---

### User Point Summary

Aggregates a user's point totals per calendar month period.

| Field | Type | Description |
|-------|------|-------------|
| `user` | Link(User) | The user this summary belongs to |
| `period` | Data | Calendar month in `YYYY-MM` format (e.g., `2026-05`) |
| `total_earned` | Float | Sum of base points for completed tasks |
| `total_bonus` | Float | Total bonus points (e.g., early completion) |
| `total_penalty` | Float | Total penalty points (e.g., late submission) |
| `total_override_delta` | Float | Net change from all leader point overrides |
| `net_points` | Float | `total_earned + total_bonus - total_penalty + total_override_delta` |

---

## Standard Frappe REST API

Vernon Tasks inherits the full Frappe Resource API for all its doctypes. These endpoints are available without any custom code and support standard CRUD operations.

### Base URL Pattern

```
/api/resource/<DocType Name>
```

### Supported Operations

| Method | URL | Description |
|--------|-----|-------------|
| `GET` | `/api/resource/VT Task` | List tasks (paginated) |
| `GET` | `/api/resource/VT Task/<name>` | Get a single task by name |
| `POST` | `/api/resource/VT Task` | Create a new task |
| `PUT` | `/api/resource/VT Task/<name>` | Update an existing task |
| `DELETE` | `/api/resource/VT Task/<name>` | Delete a task |

The same pattern applies to all Vernon Tasks doctypes:
- `VT Task`
- `VT Project`
- `Objective`
- `Key Result`
- `Work Profile`

### Filtering

Use the `filters` query parameter with a JSON-encoded array of filter triples `[field, operator, value]`:

```
GET /api/resource/VT Task?filters=[["pdca_phase","=","DO"],["assigned_to","=","alice@example.com"]]&fields=["name","title","priority","deadline"]
```

**Supported operators:** `=`, `!=`, `<`, `>`, `<=`, `>=`, `like`, `not like`, `in`, `not in`, `is`, `is not`

### Pagination

```
GET /api/resource/VT Task?limit_start=0&limit_page_length=20
```

### Create Example

```
POST /api/resource/VT Task
Content-Type: application/json
X-Frappe-CSRF-Token: abc123

{
  "title": "Set up CI/CD pipeline",
  "project": "VT-PROJ-00003",
  "assigned_to": "alice@example.com",
  "priority": "High",
  "start_date": "2026-05-10",
  "deadline": "2026-05-17",
  "estimated_hours": 6.0,
  "pdca_phase": "BACKLOG"
}
```

**Response**

```json
{
  "data": {
    "name": "VT-TASK-00099",
    "title": "Set up CI/CD pipeline",
    "project": "VT-PROJ-00003",
    "assigned_to": "alice@example.com",
    "priority": "High",
    "pdca_phase": "BACKLOG",
    "kanban_status": "Open",
    "start_date": "2026-05-10",
    "deadline": "2026-05-17",
    "estimated_hours": 6.0,
    "doctype": "VT Task"
  }
}
```

> **Note:** The standard Resource API uses a `data` envelope (not `message`) and respects the document's permission rules. PDCA phase transitions made through this API bypass the business logic guards in the custom endpoints — always prefer the whitelisted endpoints for phase transitions.

---

## Leader Analytics Endpoints (Sub-A)

All endpoints in `vernon_tasks.task.api.analytics`. All `@frappe.whitelist()` and require role `VT Leader` or `VT Manager`. Non-authorized callers get `frappe.PermissionError`. Velocity and forecast results are cached for 1 hour, keyed by project; cache is invalidated on any `VT Sprint` or `VT Task` update.

### `get_burndown(sprint)`

Daily remaining-hours timeline for one sprint plus ideal linear line.

**Request:**
```
POST /api/method/vernon_tasks.task.api.analytics.get_burndown
{"sprint": "<sprint name>"}
```

**Response:**
```json
{
  "message": {
    "labels": ["2026-05-07", "2026-05-08", ...],
    "ideal": [30.0, 22.5, 15.0, 7.5, 0.0],
    "remaining": [30.0, 30.0, 20.0, 20.0, 10.0],
    "unestimated_count": 1
  }
}
```

- `ideal[i]` is linear from total estimated hours at start to 0 at end.
- `remaining[i]` sums `estimated_hours` of tasks where `completion_date` is null or later than that day.
- Tasks with `estimated_hours == 0` are excluded from `ideal`/`remaining`; their count is surfaced as `unestimated_count`.

### `get_velocity_trend(project, n=6)`

Last N closed sprints' velocity (sum of `actual_hours` of DONE tasks) in ascending order.

**Response:**
```json
{
  "message": {
    "sprints": ["SPR-001", "SPR-002", "SPR-003"],
    "velocity": [15.0, 8.0, 12.0],
    "avg": 11.666,
    "trend_pct": -20.0
  }
}
```

- `trend_pct = (last - first) / first * 100`, returns `0.0` if fewer than 2 sprints or first velocity is 0.

### `get_forecast(project)`

Predicted project end date based on linear projection from velocity trend with a confidence band.

**Response (sufficient data, ≥3 closed sprints):**
```json
{
  "message": {
    "insufficient_data": false,
    "predicted_end": "2026-08-15",
    "p_min": "2026-09-12",
    "p_max": "2026-07-25",
    "confidence": 0.83,
    "remaining_hours": 120.0,
    "avg_velocity": 12.0,
    "sprints_used": 10
  }
}
```

**Response (insufficient data):**
```json
{
  "message": {
    "insufficient_data": true,
    "sprints_needed": 2
  }
}
```

- `p_min` uses the mean of the worst third of historical velocities (later date).
- `p_max` uses the mean of the best third (earlier date).
- `confidence = 1 - (pstdev / avg)`, clamped to `[0, 1]`.
- Sprint length used for date math is the median length of past closed sprints (default 14 days).

### `get_risks(project)`

Returns active risks for the project; empty list when none. Each risk is one dict.

**Response:**
```json
{
  "message": [
    {"type": "blocked",  "severity": "med",  "target": "VT-TASK-00042", "detail": "Setup CI blocked 5d (assignee: alice@example.com)", "days": 5},
    {"type": "slip",     "severity": "low",  "target": "VT-PROJ-00003", "detail": "Predicted end 2026-08-15 slips 9d past planned 2026-08-06 (22.5%)", "days": 9},
    {"type": "overcap",  "severity": "high", "target": "bob@example.com", "detail": "bob@example.com has 280h of 80h available (350%)", "days": 0}
  ]
}
```

- `type ∈ {"blocked", "slip", "overcap"}`.
- `severity` derived from how far the measured value exceeds threshold: `< 1×` = low, `1×–2×` = med, `≥ 2×` = high.
- Thresholds resolved per-project: `VT Project.<key>_threshold` override → `VT Settings.default_<key>_threshold` → hardcoded fallback (blocked_days=3, slip_pct=20, capacity_pct=120).

### Cache invalidation hook

`vernon_tasks.task.api.analytics.invalidate_project_cache(doc, method=None)` is wired to `doc_events.on_update` for `VT Sprint` and `VT Task`. It clears `vt_velocity:<project>:<n>` and `vt_forecast:<project>` keys so the next read recomputes.
