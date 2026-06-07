from frappe.utils import getdate, today, add_days, get_first_day, get_last_day

from vernon_tasks.task.services import vt_item_tree as tree

_VALID_PERIODS = ("week", "month", "quarter")
# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item).
_DONE_PHASE = "CLOSED"


def period_window(period: str):
	if period not in _VALID_PERIODS:
		raise ValueError(f"Invalid period: {period}")
	t = getdate(today())
	if period == "week":
		start = add_days(t, -t.weekday())
		end = add_days(start, 6)
	elif period == "month":
		start = get_first_day(t)
		end = get_last_day(t)
	else:
		q = (t.month - 1) // 3
		start = getdate(f"{t.year}-{q*3+1:02d}-01")
		end = get_last_day(getdate(f"{t.year}-{q*3+3:02d}-01"))
	return start, end


def _done_tasks(start, end, project_filter: list | None):
	"""CLOSED Task nodes completed within [start, end] that have an assignee.

	Replaces the legacy `tabVT Task WHERE pdca_phase='DONE' AND completion_date
	BETWEEN … AND assigned_to IS NOT NULL AND assigned_to != '' [AND project IN …]`
	scan. On VT Item, Tasks are typed nodes (node_type='Task'); the done phase
	'DONE'→'CLOSED' and the assignee Link assigned_to→owner_user (both kept as
	fields). The denormalised `project` Link is now a TREE relation: a Task's
	project is its nearest Project ancestor, so a project filter selects the
	Task descendants of those Project nodes instead of an `IN` clause.
	"""
	filters = {
		"pdca_phase": _DONE_PHASE,
		"completion_date": ["between", [start, end]],
		"owner_user": ["!=", ""],
	}
	fields = ["owner_user", "earned_points"]
	if project_filter:
		rows = []
		for project in project_filter:
			rows.extend(tree.descendants(project, "Task", filters=filters, fields=fields))
		return rows
	return tree.nodes("Task", filters=filters, fields=fields)


def get_leaderboard(period: str, limit: int = 10, project_filter: list | None = None) -> list[dict]:
	start, end = period_window(period)
	tasks = _done_tasks(start, end, project_filter)

	totals: dict[str, dict] = {}
	for t in tasks:
		user = t.owner_user
		if not user:
			continue
		agg = totals.setdefault(user, {"points": 0.0, "task_count": 0})
		agg["points"] += t.earned_points or 0
		agg["task_count"] += 1

	ranked = sorted(
		totals.items(),
		key=lambda kv: (kv[1]["points"], kv[1]["task_count"]),
		reverse=True,
	)
	return [{
		"user": user,
		"points": float(agg["points"]),
		"task_count": int(agg["task_count"]),
	} for user, agg in ranked[:limit]]
