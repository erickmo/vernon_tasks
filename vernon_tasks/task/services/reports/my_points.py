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
        rows = frappe.db.sql(
            """
            SELECT log_timestamp AS date, amount AS points, task
              FROM `tabTask Point Log`
             WHERE user = %(u)s
             ORDER BY log_timestamp DESC
             LIMIT 200
            """,
            {"u": user},
            as_dict=True,
        )
    except frappe.db.SQLError:
        rows = []
    return {
        "viz": {"type": "line", "x": "date", "series": ["points"]},
        "rows": [
            {"date": str(r.date), "points": int(r.points or 0), "task": r.task}
            for r in rows
        ],
        "narrative": [f"Total points (last 200 logs): {sum(int(r.points or 0) for r in rows)}"],
    }
