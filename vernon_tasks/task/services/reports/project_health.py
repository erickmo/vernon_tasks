import frappe

SLUG = "project-health"
TITLE = "Project Health Heatmap"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "project_name", "label": "Project", "type": "string"},
    {"key": "trend",        "label": "Trend",   "type": "string"},
    *[{"key": f"w{n}", "label": f"W-{n}", "type": "number"} for n in range(8, 0, -1)],
]

# VT Project has no historical health columns; surface status only and
# fall back to a single current snapshot until a health-history table exists.
_STATUS_SCORE = {
    "On Track": 100.0,
    "Open": 75.0,
    "At Risk": 40.0,
    "Closed": 0.0,
}


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql(
            """
            SELECT p.name AS project_id, p.title AS project_name, p.status
              FROM `tabVT Project` p
             WHERE p.status != 'Closed'
            """,
            as_dict=True,
        )
    except frappe.db.SQLError:
        rows = []
    out = []
    for r in rows:
        current = _STATUS_SCORE.get(r.get("status"), 50.0)
        row = {"project_id": r.project_id, "project_name": r.project_name}
        for n in range(8, 0, -1):
            row[f"w{n}"] = current if n == 1 else 0.0
        row["trend"] = "->"
        out.append(row)
    return {
        "viz": {"type": "heatmap", "x_keys": [f"w{n}" for n in range(8, 0, -1)]},
        "rows": out,
        "narrative": [
            "Health history not yet wired up; showing current status snapshot only.",
        ],
    }
