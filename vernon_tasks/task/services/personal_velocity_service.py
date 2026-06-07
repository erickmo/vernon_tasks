import frappe

from vernon_tasks.task.services import vt_item_tree as tree

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item).
_DONE_PHASE = "CLOSED"
_CLOSED_STATUS = "Closed"


def _hours_in_sprint(sprint: str, user: str | None) -> float:
	"""Sum actual_minutes of a Sprint's CLOSED Task nodes, optionally a user's.

	Replaces the legacy `VT Task WHERE sprint=… AND pdca_phase='DONE'
	[AND assigned_to=…]` scan: Tasks are VT Item children of the Sprint node
	(the old VT Task.sprint Link is now the parent relation; the per-task
	assignee Link assigned_to→owner_user; the done phase 'DONE' is now
	'CLOSED'). actual_minutes keeps its name.
	"""
	filters = {"pdca_phase": _DONE_PHASE}
	if user:
		filters["owner_user"] = user
	tasks = tree.children(sprint, "Task", filters=filters, fields=["actual_minutes"])
	return float(sum(t.actual_minutes or 0 for t in tasks))


def _distinct_assignees(sprint: str) -> int:
	"""Count unique assignees on a Sprint's CLOSED Task nodes.

	Replaces the legacy `COUNT(DISTINCT assigned_to) … WHERE sprint=…
	AND pdca_phase='DONE' AND assigned_to IS NOT NULL AND assigned_to != ''`:
	Tasks are VT Item children of the Sprint node; the per-task assignee Link
	assigned_to→owner_user.
	"""
	tasks = tree.children(
		sprint,
		"Task",
		filters={"pdca_phase": _DONE_PHASE, "owner_user": ["!=", ""]},
		fields=["owner_user"],
	)
	return len({t.owner_user for t in tasks if t.owner_user})


def get_personal_velocity(user: str, project: str, n: int = 6) -> dict:
	"""Personal vs team-average velocity over a Project's last `n` closed Sprints.

	Replaces the legacy `VT Sprint WHERE project=… AND status='Closed'` scan:
	Sprints are VT Item children of the Project node (the old VT Sprint.project
	Link is now the parent relation; status→sprint_state). Return shape is
	unchanged for downstream consumers.
	"""
	sprints = tree.children(
		project,
		"Sprint",
		filters={"sprint_state": _CLOSED_STATUS},
		fields=["name"],
		order_by="end_date desc",
		limit=n,
	)

	sprint_names = [s["name"] for s in reversed(sprints)]
	personal = [_hours_in_sprint(name, user) for name in sprint_names]
	team_avg = []
	for name in sprint_names:
		total = _hours_in_sprint(name, None)
		assignees = _distinct_assignees(name)
		team_avg.append(round(total / assignees, 2) if assignees else 0.0)

	avg = sum(personal) / len(personal) if personal else 0.0
	team_avg_total = sum(team_avg) / len(team_avg) if team_avg else 0.0

	return {
		"sprints": sprint_names,
		"personal": personal,
		"team_avg": team_avg,
		"avg": float(avg),
		"team_avg_total": float(team_avg_total),
	}
