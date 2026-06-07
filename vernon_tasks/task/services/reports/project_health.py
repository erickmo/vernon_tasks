import frappe

from vernon_tasks.task.services import vt_item_tree as tree

SLUG = "project-health"
TITLE = "Project Health Heatmap"
AUDIENCE = ("Vernon Leader", "Vernon Exec")
COLUMNS = [
	{"key": "project_name", "label": "Project", "type": "string"},
	{"key": "trend",        "label": "Trend",   "type": "string"},
	*[{"key": f"w{n}", "label": f"W-{n}", "type": "number"} for n in range(8, 0, -1)],
]

# Fallback weight when no history present yet.
_STATUS_SCORE = {
	"On Track": 100.0,
	"Open": 75.0,
	"At Risk": 40.0,
	"Closed": 0.0,
}
_HISTORY_WEEKS = 8


def _trend_arrow(history: list[float]) -> str:
	if len(history) < 2:
		return "->"
	last, prev = float(history[-1] or 0), float(history[-2] or 0)
	if last > prev + 1:
		return "up"
	if last < prev - 1:
		return "down"
	return "->"


def _fetch_projects() -> list[dict]:
	# All non-Closed Project nodes; legacy `status` is now `health_status`.
	try:
		return tree.nodes(
			"Project",
			filters={"health_status": ["!=", "Closed"]},
			fields=["name", "title", "health_status", "health_score",
				"health_history_json"],
		)
	except Exception:
		return []


def _parse_history(raw) -> list[float]:
	if not raw:
		return []
	try:
		parsed = frappe.parse_json(raw) or []
	except (ValueError, TypeError):
		return []
	if not isinstance(parsed, list):
		return []
	return [float(x or 0) for x in parsed][-_HISTORY_WEEKS:]


def _heatmap_row(r: dict, history: list[float]) -> dict:
	# Right-align history: most recent → w1, oldest → w8
	row = {"project_id": r.name, "project_name": r.title}
	padded = ([0.0] * (_HISTORY_WEEKS - len(history))) + history
	for idx, n in enumerate(range(_HISTORY_WEEKS, 0, -1)):
		row[f"w{n}"] = round(float(padded[idx] or 0), 2)
	row["trend"] = _trend_arrow(history)
	return row


def run(filters: dict) -> dict:
	rows = _fetch_projects()

	out = []
	empty_history_count = 0
	for r in rows:
		history = _parse_history(r.get("health_history_json"))
		if not history:
			empty_history_count += 1
			current = (
				float(r.health_score)
				if r.get("health_score") is not None
				else _STATUS_SCORE.get(r.get("health_status"), 50.0)
			)
			history = [current]
		out.append(_heatmap_row(r, history))

	narrative = []
	if empty_history_count:
		narrative.append(
			f"{empty_history_count} project(s) lack health history; showing current snapshot."
		)
	return {
		"viz": {"type": "heatmap", "x_keys": [f"w{n}" for n in range(8, 0, -1)]},
		"rows": out,
		"narrative": narrative,
	}
