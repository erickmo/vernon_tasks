# Domain: OKR

Objectives, Key Results, KPI definitions and entries. Feeds Health Score.

## Modules

- `vernon_tasks/okr/doctype/` — `objective`, `key_result`, `kpi_definition`, `kpi_entry`
- Report: `kpi_achievement`

## Health Score

```
score = okr_pct × 0.40 + ontime_pct × 0.30 + velocity_health × 0.30
```

Service: `vernon_tasks/task/services/health_score_service.py` + `test_health_score_service.py`.

## Cross-Domain Events

### Triggers
| Event | Payload | Listeners |
|-------|---------|-----------|
| okr.kr.updated | {kr_id, progress_pct} | exec_analytics (Health Score recalc) |

### Listens
| Event | Source | Action |
|-------|--------|--------|
| task.completed | task | check linked KR, increment progress (manual link today; auto = PRD-F05 future) |
| sprint.closed | project | roll up sprint velocity to Health Score |

## ADRs

ADR-007 (doctype model). See `docs/adr/data.html`.
