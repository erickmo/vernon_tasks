import frappe  # noqa: F401  (kept for parity with other report modules)

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
    # No `VT Risk Event` doctype exists yet; return empty payload with a
    # narrative explaining the gap rather than fabricating data.
    return {
        "viz": {"type": "table-only"},
        "rows": [],
        "narrative": ["Risk event log not yet wired up."],
    }
