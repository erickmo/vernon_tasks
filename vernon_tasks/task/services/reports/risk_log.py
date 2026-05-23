import frappe

SLUG = "risk-log"
TITLE = "At-Risk Log (rolling 30d)"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
    {"key": "date",     "label": "Date",     "type": "datetime"},
    {"key": "project",  "label": "Project",  "type": "string"},
    {"key": "reason",   "label": "Reason",   "type": "string"},
    {"key": "severity", "label": "Severity", "type": "string"},
]


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql("""
            SELECT r.detected_at AS date, p.title AS project,
                   r.reason, r.severity
              FROM `tabVT Risk Event` r
              JOIN `tabVT Project` p ON p.name = r.project
             WHERE r.detected_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
             ORDER BY r.detected_at DESC
        """, as_dict=True)
    except Exception:
        rows = []
    return {
        "viz": {"type": "table-only"},
        "rows": [
            {"date": str(r.date), "project": r.project, "reason": r.reason, "severity": r.severity}
            for r in rows
        ],
        "narrative": [f"{len(rows)} risk events in the last 30 days."],
    }
