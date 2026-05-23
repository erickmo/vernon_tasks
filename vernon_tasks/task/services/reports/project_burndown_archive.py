import frappe

SLUG = "project-burndown-archive"
TITLE = "Sprint Burndown Archive"
AUDIENCE = ("Vernon PM",)
COLUMNS = [
    {"key": "sprint",   "label": "Sprint",   "type": "string"},
    {"key": "project",  "label": "Project",  "type": "string"},
    {"key": "outcome",  "label": "Outcome",  "type": "string"},
    {"key": "velocity", "label": "Velocity", "type": "number"},
]

# VT Sprint has no `outcome`, `actual_velocity`, or `burndown_actual_json`
# columns yet. Fall back to status as a stand-in for outcome and aggregate
# completed task points for velocity via the VT Task.sprint Link.


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql(
            """
            SELECT s.name AS sprint,
                   p.title AS project,
                   s.status AS outcome,
                   COALESCE((
                       SELECT SUM(COALESCE(t.leader_override_points,
                                           t.earned_points,
                                           t.base_points, 0))
                         FROM `tabVT Task` t
                        WHERE t.sprint = s.name
                          AND t.kanban_status = 'Done'
                   ), 0) AS velocity
              FROM `tabVT Sprint` s
              JOIN `tabVT Project` p ON p.name = s.project
             WHERE s.status = 'Closed'
             ORDER BY s.end_date DESC
             LIMIT 50
            """,
            as_dict=True,
        )
    except frappe.db.SQLError:
        rows = []
    return {
        "viz": {"type": "small-multiples", "x": "sprint"},
        "rows": [
            {"sprint": r.sprint, "project": r.project, "outcome": r.outcome,
             "velocity": int(r.velocity or 0)}
            for r in rows
        ],
        "narrative": [f"{len(rows)} completed sprints in archive."],
    }
