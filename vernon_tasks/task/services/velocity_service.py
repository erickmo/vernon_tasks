import frappe

from vernon_tasks.task.services import vt_item_tree as tree

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item).
_DONE_PHASE = "CLOSED"
_CLOSED_STATUS = "Closed"


def get_sprint_velocity(sprint: str) -> float:
	"""Sum actual_minutes of a Sprint's completed (CLOSED) Task nodes.

	Replaces the legacy `VT Task WHERE sprint=… AND pdca_phase='DONE'` scan:
	Tasks are VT Item children of the Sprint node (the old VT Task.sprint Link
	is now the parent relation; the done phase 'DONE' is now 'CLOSED').
	actual_minutes/pdca_phase keep their names.
	"""
	tasks = tree.children(
		sprint,
		"Task",
		filters={"pdca_phase": _DONE_PHASE},
		fields=["actual_minutes"],
	)
	return float(sum(t.actual_minutes or 0 for t in tasks))


def get_velocity_trend(project: str, n: int = 6) -> dict:
	"""Velocity series for a Project's last `n` closed Sprints (oldest→newest).

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
	velocities = [get_sprint_velocity(name) for name in sprint_names]

	avg = sum(velocities) / len(velocities) if velocities else 0.0
	if len(velocities) >= 2 and velocities[0] > 0:
		trend_pct = (velocities[-1] - velocities[0]) / velocities[0] * 100
	else:
		trend_pct = 0.0

	return {
		"sprints": sprint_names,
		"velocity": velocities,
		"avg": float(avg),
		"trend_pct": float(trend_pct),
	}
