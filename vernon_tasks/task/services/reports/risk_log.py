import frappe
from frappe.utils import add_days, now_datetime

from vernon_tasks.task.services import vt_item_tree as tree

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
_ROW_LIMIT = 200


def _project_title_lookup() -> dict:
	# Project rows now live as VT Item nodes with node_type='Project'; the
	# `title` field is preserved. Pre-load all Project nodes into a name->title
	# dict for O(1) enrichment, replacing the legacy report-time JOIN.
	try:
		projects = tree.nodes("Project", fields=["name", "title"])
	except Exception:
		return {}
	return {p.name: p.title for p in projects}


def _fetch_risk_events() -> list:
	# Risk Event stays a standalone doctype (not part of the VT Item tree).
	cutoff = add_days(now_datetime(), -_ROLLING_DAYS)
	try:
		return frappe.get_all(
			"Risk Event",
			filters={"detected_at": [">=", cutoff]},
			fields=["detected_at", "project", "reason", "severity"],
			order_by="detected_at desc",
			limit=_ROW_LIMIT,
		)
	except Exception:
		return []


def run(filters: dict) -> dict:
	events = _fetch_risk_events()
	titles = _project_title_lookup()

	rows = [
		{
			"date": str(e.detected_at) if e.detected_at else None,
			"project": titles.get(e.project) or e.project,
			"reason": e.reason,
			"severity": e.severity,
		}
		for e in events
	]

	return {
		"viz": {"type": "table-only"},
		"rows": rows,
		"narrative": [f"{len(rows)} risk event(s) in last {_ROLLING_DAYS} days."],
	}
