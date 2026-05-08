# Dashboard Design — Vernon Tasks

**Date:** 2026-05-08  
**Scope:** Two standalone Frappe pages — Employee Dashboard + Leader Dashboard  
**Chart library:** Frappe Charts (built-in)

---

## 1. Overview

Two new Frappe pages:
- `my_dashboard` — personal stats for the logged-in employee
- `leader_dashboard` — team overview for leaders/managers

Each page: isolated JS + Python, shortcut added to respective workspace.

---

## 2. Employee Dashboard (`my_dashboard`)

### Number Cards

| Card | Query | Field |
|---|---|---|
| Tasks Done Today | COUNT VT Task WHERE pdca_phase = 'DONE' AND completion_date = today() AND assigned_to = user | count |
| Tasks Done This Week | COUNT VT Task WHERE pdca_phase = 'DONE' AND WEEK(completion_date) = WEEK(today()) AND assigned_to = user | count |
| Points This Month | SUM earned_points WHERE pdca_phase = 'DONE' AND MONTH(completion_date) = MONTH(today()) AND assigned_to = user | sum |
| Blocked Tasks | COUNT VT Task via INNER JOIN Task Dependency WHERE blocker not DONE AND assigned_to = user | count |

### Charts

**Chart 1 — Tasks Completed (Last 7 Days)**
- Type: Bar
- X-axis: date label (Mon–Sun)
- Y-axis: count of DONE tasks per day
- Data from: `get_daily_completions(days=7)`

**Chart 2 — Hours: Logged vs Estimated**
- Type: Donut
- Slices: actual_hours (logged), max(0, estimated_hours - actual_hours) (remaining)
- Data from: `get_hours_summary()`
- Aggregated across all active (non-DONE) tasks assigned to user

### Python APIs (whitelist)

```
get_employee_stats()     → { done_today, done_week, points_month, blocked }
get_daily_completions()  → [{ date, count }, ...]  # last 7 days
get_hours_summary()      → { actual_hours, estimated_hours }
```

### Layout

```
[ Done Today ] [ Done Week ] [ Points Month ] [ Blocked ]
[     Bar: Tasks Completed 7d     ] [  Donut: Hours  ]
```

---

## 3. Leader Dashboard (`leader_dashboard`)

### Number Cards

| Card | Query |
|---|---|
| Pending Review | COUNT VT Task WHERE kanban_status = 'In Review' |
| Approval Rate | SUM(approved tasks) / SUM(approved + rejected) × 100, last 30 days |
| Team Points (Month) | SUM earned_points all team members, MONTH = current |

Approval rate uses revision_count proxy: task approved = pdca_phase DONE after CHECK with revision_count = 0 (no reject loop). Rejected = revision_count > 0.

> **Note:** Approval rate approximation — exact approve/reject event log not stored. Track via revision_count: 0 = approved first try, >0 = went through revision. This is a reasonable proxy until an event log is added.

### Charts

**Chart 1 — PDCA Phase Distribution**
- Type: Donut / Pie
- Slices: count per phase (BACKLOG, PLAN, DO, CHECK, DONE, ACT)
- Data from: `get_phase_distribution()`
- Scope: all VT Tasks (not filtered by user — team-wide)

**Chart 2 — Team Points Leaderboard**
- Type: Bar (horizontal preferred)
- X-axis: member name
- Y-axis: SUM earned_points this month
- Top 10 members
- Data from: `get_team_leaderboard()`

### Table — Overdue Tasks per Member

Columns: Member | Task Title | Deadline | Days Overdue | Phase  
Filter: deadline < today, pdca_phase NOT IN ('DONE', 'ACT')  
Sorted by: days overdue DESC

### Python APIs (whitelist)

```
get_leader_stats()        → { pending_review, approval_rate, team_points_month }
get_phase_distribution()  → [{ phase, count }, ...]
get_team_leaderboard()    → [{ member, points }, ...]  # top 10
get_overdue_tasks()       → [{ member, task, deadline, days_overdue, phase }, ...]
```

### Permission Guard

`leader_dashboard.py` checks: user must have role `VT Leader` or `System Manager`. Return 403 if not.

### Layout

```
[ Pending Review ] [ Approval Rate ] [ Team Points ]
[   Donut: PDCA Distribution   ] [  Bar: Leaderboard  ]
[          Table: Overdue Tasks                        ]
```

---

## 4. File Structure

```
vernon_tasks/task/page/
  my_dashboard/
    __init__.py
    my_dashboard.json
    my_dashboard.py
    my_dashboard.js
    test_my_dashboard.py
  leader_dashboard/
    __init__.py
    leader_dashboard.json
    leader_dashboard.py
    leader_dashboard.js
    test_leader_dashboard.py
```

---

## 5. Workspace Shortcuts

- `my_dashboard` shortcut → added to Employee workspace
- `leader_dashboard` shortcut → added to Leader workspace (existing)

---

## 6. Testing Strategy

Each `.py` file: unit tests with `frappe.tests.UnitTestCase`.  
Test scope: each API function returns correct shape and correct filtered data.  
Mock `frappe.session.user` and DB state.  
No JS tests (Frappe convention).

---

## 7. Out of Scope

- Real-time auto-refresh (polling)
- Date range filter picker in UI (phase 2)
- Export to CSV/PDF
- Event log for precise approval tracking (phase 2 — use revision_count proxy for now)
