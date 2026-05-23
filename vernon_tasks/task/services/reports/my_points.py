import frappe

SLUG = "my-points"
TITLE = "My Points & Performance"
AUDIENCE = ()  # any logged-in user
COLUMNS = [
    {"key": "date",    "label": "Date",    "type": "date"},
    {"key": "points",  "label": "Points",  "type": "number"},
    {"key": "task",    "label": "Task",    "type": "string"},
]


def run(filters: dict) -> dict:
    user = frappe.session.user
    try:
        rows = frappe.db.sql("""
            SELECT logged_on AS date, points, task FROM `tabVT Task Point Log`
             WHERE recipient = %(u)s
             ORDER BY logged_on DESC LIMIT 200
        """, {"u": user}, as_dict=True)
    except Exception:
        rows = []
    return {
        "viz": {"type": "line", "x": "date", "series": ["points"]},
        "rows": [
            {"date": str(r.date), "points": int(r.points or 0), "task": r.task}
            for r in rows
        ],
        "narrative": [f"Total points (last 200 logs): {sum(int(r.points or 0) for r in rows)}"],
    }
