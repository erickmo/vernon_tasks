# Leader Review Page — Design Spec

**Date:** 2026-05-08  
**Status:** Approved  
**Scope:** Single Frappe page for project leaders to review submitted tasks, monitor team workload, and track blocked tasks.

---

## 1. Context

My Work page (member view) is complete. Leaders currently have no dedicated work page. This page closes that gap.

**Who uses this:** Users who are `project_leader` on a VT Project, or who have `role = Leader` in a project's `team_members` child table.

---

## 2. File Structure

```
vernon_tasks/task/page/leader_review/
├── leader_review.json      ← Frappe page config, role restricted to "VT Leader"
├── leader_review.py        ← 5 whitelisted API functions
├── leader_review.js        ← 3-tab UI + action handlers
├── test_leader_review.py   ← unit tests per API
└── __init__.py
```

Follows the exact same pattern as `task/page/my_work/`.

---

## 3. "Leader's Team" Definition

A user belongs to a leader's team if they are in `team_members` of any VT Project where the current user is either:
- `project_leader` (top-level field on VT Project), OR
- has `role = Leader` in the `team_members` child table

SQL subquery pattern:
```sql
project IN (
    SELECT p.name FROM `tabVT Project` p
    WHERE p.project_leader = %(user)s
    UNION
    SELECT ptm.parent FROM `tabProject Team Member` ptm
    WHERE ptm.user = %(user)s AND ptm.role = 'Leader'
)
```

---

## 4. API Design (`leader_review.py`)

### 4.1 `get_review_queue() -> list`
Returns tasks with `pdca_phase = CHECK` assigned to members of the leader's team.

Fields returned: `name, title, project, priority, deadline, assigned_to, pdca_phase, kanban_status, estimated_hours, review_scheduled_date`

Ordered by: `priority (High→Low)`, then `deadline ASC`.

Returns `[]` if user leads no projects.

### 4.2 `get_team_workload() -> list`
Returns estimated hour load per team member for active tasks (`pdca_phase NOT IN ('DONE', 'BACKLOG')`).

Fields returned: `assigned_to, sum(estimated_hours) as total_hours`

Capacity threshold read from `VT Settings.default_daily_target_hours` (default 8).

Overloaded = `total_hours > daily_target_hours`.

### 4.3 `get_team_blocked_tasks() -> list`
Returns tasks assigned to team members that are blocked by unfinished dependencies.

Fields returned: `name, title, project, priority, deadline, assigned_to, pdca_phase, blocker_name, blocker_title, blocker_assignee, days_blocked`

### 4.4 `approve_task(task_name: str) -> dict`
Sets `pdca_phase = DONE`, `kanban_status = Done`, triggers point calculation.

Guards:
- Task must have `pdca_phase = CHECK`
- Current user must be leader of the task's project
- Raises `frappe.PermissionError` if not authorized
- Raises `frappe.ValidationError` if wrong phase

### 4.5 `reject_task(task_name: str, reason: str) -> dict`
Sets `pdca_phase = DO`, `kanban_status = Revision`, saves `reason` to `rejection_note` field.

Guards:
- Task must have `pdca_phase = CHECK`
- Current user must be leader of the task's project
- `reason` must not be empty
- Raises `frappe.ValidationError` if reason empty
- Raises `frappe.PermissionError` if not authorized

---

## 5. Schema Change

**VT Task (`vt_task.json`)** — add field:
```json
{
  "fieldname": "rejection_note",
  "fieldtype": "Small Text",
  "label": "Rejection Note",
  "read_only": 1
}
```
Set by API only (not editable from standard form).

---

## 6. UI Layout

Single Frappe page with 3 tabs rendered in JavaScript.

### Tab 1: Review Queue
```
┌─────────────────────────────────────────────────────┐
│ [Task Title]    [Project]   [Priority]  [Deadline]  │
│ Assignee: xxx   Est: x.xh                           │
│                              [Approve]  [Reject]    │
└─────────────────────────────────────────────────────┘
```
- Reject opens modal with textarea for reason → confirm → API call
- Empty state: "No tasks pending review"

### Tab 2: Team Workload
```
┌──────────────────────────────────────────────────┐
│ Member   │ Est. Hours │ Capacity │ Load bar       │
│ Alice    │   5.5h     │   8h     │ ████░░░░       │
│ Bob      │  11.0h     │   8h     │ ████████⚠      │
└──────────────────────────────────────────────────┘
```
- ⚠ shown when `total_hours > daily_target_hours`
- Capacity from `VT Settings.default_daily_target_hours`

### Tab 3: Blocked Tasks
```
┌─────────────────────────────────────────────────────┐
│ [Task] blocked by [Blocker Task] (owner: xxx)       │
│ Member: yyy   Blocked: X days        [Escalate]     │
└─────────────────────────────────────────────────────┘
```
- Escalate = open Frappe notification/comment (TBD in implementation)
- Empty state: "No blocked tasks"

---

## 7. Testing (`test_leader_review.py`)

| Test | Scenario |
|---|---|
| `test_get_review_queue_returns_check_tasks` | CHECK task in leader's project → appears |
| `test_get_review_queue_excludes_other_projects` | CHECK task in unrelated project → excluded |
| `test_approve_task_sets_done` | `pdca_phase = DONE` after approve |
| `test_approve_task_wrong_phase_raises` | Task not in CHECK → ValidationError |
| `test_approve_task_unauthorized_raises` | User not leader → PermissionError |
| `test_reject_task_sets_do_and_saves_note` | `pdca_phase = DO`, `rejection_note` saved |
| `test_reject_task_empty_reason_raises` | Empty reason → ValidationError |
| `test_get_team_workload_sums_hours` | `sum(estimated_hours)` correct per member |
| `test_get_team_blocked_tasks_only_team` | Only team members' blocked tasks returned |

---

## 8. Out of Scope

- Push notifications (separate feature)
- Bulk approve/reject
- Manager-level aggregation
- Mobile layout optimization
