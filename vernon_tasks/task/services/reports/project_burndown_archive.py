import frappe

from vernon_tasks.task.services import vt_item_tree as tree

SLUG = "project-burndown-archive"
TITLE = "Sprint Burndown Archive"
AUDIENCE = ("Vernon PM",)
COLUMNS = [
	{"key": "sprint",   "label": "Sprint",   "type": "string"},
	{"key": "project",  "label": "Project",  "type": "string"},
	{"key": "outcome",  "label": "Outcome",  "type": "string"},
	{"key": "velocity", "label": "Velocity", "type": "number"},
]

_VELOCITY_FIELDS = ("leader_override_points", "earned_points", "base_points")


def run(filters: dict) -> dict:
	rows = _closed_sprints()
	out = []
	for s in rows:
		project = tree.project_of(s["name"])
		if not project:
			# Matches the legacy INNER JOIN on VT Project: a sprint with no
			# parent Project node is dropped from the archive.
			continue
		out.append({
			"sprint": s["name"],
			"project": frappe.db.get_value(tree.DOCTYPE, project, "title"),
			"outcome": s["outcome"] or s["sprint_state"],
			"velocity": _velocity(s),
			"burndown": _parse_burndown(s.get("burndown_actual_json")),
		})
	return {
		"viz": {"type": "small-multiples", "x": "sprint"},
		"rows": out,
		"narrative": [f"{len(out)} completed sprints in archive."],
	}


def _closed_sprints():
	"""Closed Sprint nodes, newest first, capped at 50.

	Replaces `SELECT … FROM tabVT Sprint WHERE status='Closed'`: Sprints are now
	VT Item rows with node_type='Sprint' and the renamed sprint_state field. The
	JOIN on VT Project is deferred to a parent walk per row (tree.project_of)."""
	try:
		return tree.nodes(
			"Sprint",
			filters={"sprint_state": "Closed"},
			fields=["name", "outcome", "sprint_state", "actual_velocity",
				"burndown_actual_json"],
			order_by="end_date desc",
			limit=50,
		)
	except frappe.db.SQLError:
		return []


def _velocity(sprint):
	"""Sprint velocity: stored actual_velocity, else sum of Done task points.

	Preserves the legacy COALESCE(actual_velocity, SUM(...), 0): a stored value
	(including 0) wins; otherwise sum the descendant Done tasks' points via the
	leader_override → earned → base cascade. Task lookup flips from
	`WHERE sprint = s.name` to nested-set descendants of the Sprint node."""
	if sprint.get("actual_velocity") is not None:
		return int(sprint["actual_velocity"])
	tasks = tree.descendants(
		sprint["name"], "Task",
		filters={"kanban_status": "Done"},
		fields=list(_VELOCITY_FIELDS),
	)
	total = sum(_task_points(t) for t in tasks)
	return int(total)


def _task_points(task):
	"""COALESCE cascade for a single task's velocity contribution."""
	for field in _VELOCITY_FIELDS:
		value = task.get(field)
		if value is not None:
			return value
	return 0


def _parse_burndown(raw):
	if not raw:
		return []
	try:
		parsed = frappe.parse_json(raw) or []
		return parsed if isinstance(parsed, list) else []
	except (ValueError, TypeError):
		return []
