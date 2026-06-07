import frappe
from frappe.utils import add_days, getdate, today

from vernon_tasks.task.services import vt_item_tree as tree

SLUG = "team-throughput"
TITLE = "Team Throughput & Cycle Time"
AUDIENCE = ("Vernon Leader", "Vernon PM")
COLUMNS = [
	{"key": "week",         "label": "Week",         "type": "string"},
	{"key": "velocity",     "label": "Velocity (pt)", "type": "number"},
	{"key": "cycle_hours",  "label": "Cycle (h)",    "type": "number"},
]

# Points precedence chain: leader override wins, then earned, then base.
_POINT_FIELDS = ("leader_override_points", "earned_points", "base_points")
_WINDOW_WEEKS = 12
_HOURS_PER_DAY = 24


def run(filters: dict) -> dict:
	rows = _completed_tasks()
	out = _aggregate_by_week(rows)
	return {
		"viz": {"type": "line", "x": "week", "series": ["velocity", "cycle_hours"]},
		"rows": out,
		"narrative": _summarise(out),
	}


def _completed_tasks():
	"""Done Task nodes completed within the last 12 weeks, fields intact.

	Tasks are now VT Item rows with node_type='Task'; all referenced fields
	keep their names on the node, so no parent/ancestor walk is needed."""
	cutoff = add_days(today(), -_WINDOW_WEEKS * 7)
	return tree.nodes(
		"Task",
		filters={
			"kanban_status": "Done",
			"completion_date": [">=", cutoff],
		},
		fields=[
			"completion_date", "start_date",
			"leader_override_points", "earned_points", "base_points",
		],
		order_by="completion_date",
	)


def _aggregate_by_week(rows):
	"""Group Done tasks into ISO year-weeks: SUM(points), AVG(cycle hours)."""
	buckets = {}
	for r in rows:
		if not r.completion_date:
			continue
		week = _iso_week(r.completion_date)
		bucket = buckets.setdefault(week, {"points": 0, "cycle": [], "n": 0})
		bucket["points"] += _points_of(r)
		bucket["cycle"].append(_cycle_hours(r))
	out = []
	for week in sorted(buckets):
		b = buckets[week]
		avg_cycle = sum(b["cycle"]) / len(b["cycle"]) if b["cycle"] else 0
		out.append({
			"week": week,
			"velocity": int(b["points"] or 0),
			"cycle_hours": float(avg_cycle or 0),
		})
	return out


def _iso_week(completion_date) -> str:
	"""MySQL DATE_FORMAT(..., '%x-W%v') equivalent: ISO year + ISO week."""
	iso = getdate(completion_date).isocalendar()
	return f"{iso[0]}-W{iso[1]:02d}"


def _points_of(row) -> int:
	"""COALESCE precedence: first non-NULL of override/earned/base, else 0."""
	for field in _POINT_FIELDS:
		value = row.get(field)
		if value is not None:
			return int(value)
	return 0


def _cycle_hours(row) -> float:
	"""TIMESTAMPDIFF(HOUR, start_date, completion_date) on date fields."""
	if not row.start_date or not row.completion_date:
		return 0.0
	delta = getdate(row.completion_date) - getdate(row.start_date)
	return float(delta.days * _HOURS_PER_DAY)


def _summarise(rows):
	if not rows:
		return ["No completed tasks in last 12 weeks."]
	return [f"Latest velocity: {rows[-1]['velocity']}pt, cycle time {rows[-1]['cycle_hours']:.1f}h."]
