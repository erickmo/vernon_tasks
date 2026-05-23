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

_ROLLING_DAYS = 30


def run(filters: dict) -> dict:
    try:
        rows = frappe.db.sql(
            """
            SELECT r.detected_at AS date,
                   COALESCE(p.title, r.project) AS project,
                   r.reason,
                   r.severity
              FROM `tabRisk Event` r
              LEFT JOIN `tabVT Project` p ON p.name = r.project
             WHERE r.detected_at >= DATE_SUB(NOW(), INTERVAL %(d)s DAY)
             ORDER BY r.detected_at DESC
             LIMIT 200
            """,
            {"d": _ROLLING_DAYS},
            as_dict=True,
        )
    except frappe.db.SQLError:
        rows = []

    return {
        "viz": {"type": "table-only"},
        "rows": [
            {
                "date": str(r.date) if r.date else None,
                "project": r.project,
                "reason": r.reason,
                "severity": r.severity,
            }
            for r in rows
        ],
        "narrative": [f"{len(rows)} risk event(s) in last {_ROLLING_DAYS} days."],
    }
