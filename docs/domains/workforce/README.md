# Domain: Workforce

People-side: profiles, capacity, points roll-up, daily summary.

## Modules

- `vernon_tasks/workforce/doctype/` — `work_profile`, `work_schedule_day`, `user_point_summary`, `daily_summary`
- Reports: `my_points_progress`, `team_workload_overview`

## Cross-Domain Events

### Listens
| Event | Source | Action |
|-------|--------|--------|
| task.submitted | task | append to `task_point_log`, recompute `user_point_summary` |
| task.completed | task | bump streak, daily summary |

## Tests

- `vernon_tasks/workforce/doctype/work_profile/test_work_profile.py`
- `vernon_tasks/workforce/doctype/daily_summary/test_daily_summary.py`
- `vernon_tasks/workforce/doctype/user_point_summary/test_user_point_summary.py`

## ADRs

ADR-008 (point calculation). See `docs/adr/operations.html`.
