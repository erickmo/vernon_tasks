# Domain: Project

Container for Sprints, Milestones, Team. Owns velocity/burndown analytics.

## Modules

- `vernon_tasks/project/doctype/` — `vt_project`, `vt_sprint`, `sprint_task`, `project_team_member`, `project_milestone`, `project_documentation`
- Reports: `sprint_velocity`, `project_progress_vs_okr`

## Cross-Domain Events

### Triggers
| Event | Payload | Listeners |
|-------|---------|-----------|
| sprint.started | {sprint_id, project_id, tasks} | task (schedule), workforce (capacity) |
| sprint.closed | {sprint_id, velocity} | okr (key result roll-up) |

### Listens
| Event | Source | Action |
|-------|--------|--------|
| task.completed | task | recompute burndown, invalidate cache |

## Tests

- `vernon_tasks/task/services/test_burndown_service.py`
- `vernon_tasks/task/services/test_personal_velocity_service.py`

## ADRs

ADR-007 (doctype model). See `docs/adr/data.html`.
