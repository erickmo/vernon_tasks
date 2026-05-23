import frappe

SLUG = "team-throughput"
TITLE = "Team Throughput & Cycle Time"
AUDIENCE = ("Vernon Leader", "Vernon PM")
COLUMNS = [
    {"key": "week",         "label": "Week",         "type": "string"},
    {"key": "velocity",     "label": "Velocity (pt)", "type": "number"},
    {"key": "cycle_hours",  "label": "Cycle (h)",    "type": "number"},
]


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql("""
            SELECT DATE_FORMAT(t.completed_on, '%%x-W%%v') AS week,
                   SUM(t.points) AS velocity,
                   AVG(TIMESTAMPDIFF(HOUR, t.plan_started_on, t.completed_on)) AS cycle_hours
              FROM `tabVT Task` t
             WHERE t.status = 'DONE'
               AND t.completed_on >= DATE_SUB(CURDATE(), INTERVAL 12 WEEK)
             GROUP BY week
             ORDER BY week
        """, as_dict=True)
    except Exception:
        rows = []
    out = [
        {"week": r.week, "velocity": int(r.velocity or 0), "cycle_hours": float(r.cycle_hours or 0)}
        for r in rows
    ]
    return {
        "viz": {"type": "line", "x": "week", "series": ["velocity", "cycle_hours"]},
        "rows": out,
        "narrative": _summarise(out),
    }


def _summarise(rows):
    if not rows:
        return ["No completed tasks in last 12 weeks."]
    return [f"Latest velocity: {rows[-1]['velocity']}pt, cycle time {rows[-1]['cycle_hours']:.1f}h."]
