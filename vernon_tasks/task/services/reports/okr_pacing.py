import frappe
from frappe.utils import getdate

from vernon_tasks.task.services import vt_item_tree as tree

SLUG = "okr-pacing"
TITLE = "OKR Progress vs Time-Elapsed"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
	{"key": "objective", "label": "Objective", "type": "string"},
	{"key": "kr",        "label": "Key Result", "type": "string"},
	{"key": "progress",  "label": "Progress %",  "type": "number"},
	{"key": "pace",      "label": "Pace %",       "type": "number"},
	{"key": "gap",       "label": "Gap (pp)",    "type": "number"},
]


def run(filters: dict) -> dict:
	rows = _kr_rows()
	from datetime import date
	today = date.today()
	out = []
	for r in rows:
		progress = (float(r["current_value"] or 0) / float(r["target_value"])) if r["target_value"] else 0
		if r["period_start"] and r["period_end"] and r["period_end"] != r["period_start"]:
			start, end = getdate(r["period_start"]), getdate(r["period_end"])
			elapsed = (today - start).days / (end - start).days
			pace = max(0.0, min(1.0, elapsed))
		else:
			pace = 0.0
		gap = progress - pace
		out.append({
			"objective_id": r["objective_id"], "objective": r["objective"],
			"kr_id": r["kr_id"], "kr": r["kr"],
			"progress": round(progress * 100, 1),
			"pace":     round(pace * 100, 1),
			"gap":      round(gap * 100, 1),
		})
	out.sort(key=lambda x: x["gap"])
	return {
		"viz": {"type": "bar", "x": "kr", "y": "gap", "color_negative": True},
		"rows": out,
		"narrative": [
			f"{out[0]['kr']} is {abs(out[0]['gap']):.1f}pp behind pace"
			if out and out[0]["gap"] < 0 else "All KRs are on or ahead of pace.",
		],
	}


def _kr_rows():
	"""Flatten Key Results across every OKR node into legacy join rows.

	Replaces the tabObjective ⋈ tabKey Result join: OKR nodes are VT Item rows
	with node_type='OKR', and Key Results are now child-table rows
	('key_results', VT Item Key Result) on each OKR node — so the join becomes a
	direct per-node traversal. Field names are preserved 1:1."""
	try:
		objectives = tree.nodes(
			"OKR",
			fields=["name", "title", "period_start", "period_end"],
		)
	except frappe.db.SQLError:
		return []
	rows = []
	for obj in objectives:
		for kr in tree.child_table_rows(obj["name"], "key_results"):
			rows.append({
				"objective_id": obj["name"], "objective": obj["title"],
				"kr_id": kr.get("name"), "kr": kr.get("metric"),
				"target_value": kr.get("target_value"),
				"current_value": kr.get("current_value"),
				"period_start": obj["period_start"],
				"period_end": obj["period_end"],
			})
	return rows
