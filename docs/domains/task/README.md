# Domain: Task

PDCA-driven work unit. Core of Vernon Tasks.

## Modules

- `vernon_tasks/task/doctype/` — `vt_task`, `task_dependency`, `task_schedule_entry`, `task_point_log`, `recurring_rule`
- `vernon_tasks/task/api/` — whitelisted endpoints (see PRD §6)
- `vernon_tasks/task/services/` — point_calculator, scheduling_engine, burndown_service, forecast_service, risk_evaluator, velocity_service, push_sender
- `vernon_tasks/task/page/` — Desk pages (my_work, my_dashboard, my_analytics, leader_dashboard, leader_review, leader_analytics, exec_analytics)

## Fields & Rules

Source: `docs/PRD.md` §4.2 (Doctypes), §4.3 (PDCA), §4.4 (Points), §4.5 (Scheduling).

## State Machine

`BACKLOG → PLAN → DO → CHECK → DONE/ACT`. See PRD §4.3.

## Cross-Domain Events

### Triggers (I fire)
| Event | Payload | Listeners |
|-------|---------|-----------|
| task.submitted | {task_id, owner, points} | workforce (point summary) |
| task.completed | {task_id, owner, sprint_id} | project (sprint progress), okr (key result) |
| task.review.requested | {task_id, leader} | notifications (push), workforce (leader queue) |

### Listens (I react)
| Event | Source | Action |
|-------|--------|--------|
| sprint.started | project | distribute task schedule |
| recurring.due | scheduler | spawn new task instance |

## Tests

- `vernon_tasks/task/api/test_*.py` (10 files)
- `vernon_tasks/task/services/test_*.py` (6 files)

## ADRs

ADR-007 (doctype model), ADR-008 (points), ADR-009 (scheduling). See `docs/adr/data.html`, `docs/adr/operations.html`.
