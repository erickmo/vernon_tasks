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


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql("""
            SELECT s.name AS sprint, p.title AS project,
                   s.outcome, s.actual_velocity AS velocity, s.burndown_actual_json
              FROM `tabVT Sprint` s JOIN `tabVT Project` p ON p.name = s.project
             WHERE s.status = 'Done' ORDER BY s.end_date DESC LIMIT 50
        """, as_dict=True)
    except Exception:
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
