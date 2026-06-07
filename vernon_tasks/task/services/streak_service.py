import frappe

from vernon_tasks.task.services import vt_item_tree as tree

# On VT Item the legacy VT Task done phase ("DONE") is the unified completion
# phase "CLOSED" (the only "finished" pdca_phase option on VT Item).
_DONE_PHASE = "CLOSED"
_CLOSED_STATUS = "Closed"


def get_streak(user: str, project: str) -> dict:
	"""Count consecutive recent closed Sprints where `user` finished work.

	Walks a Project's closed Sprints newest→oldest; a Sprint counts toward the
	streak when the user has any CLOSED Task with actual_minutes logged, and the
	streak breaks at the first Sprint with none.

	Replaces the legacy flat scans (`VT Sprint WHERE project=… AND
	status='Closed'`, `VT Task WHERE sprint=… AND assigned_to=… AND
	pdca_phase='DONE'`): Sprints are VT Item children of the Project node and
	Tasks are VT Item children of the Sprint node (the old VT Sprint.project /
	VT Task.sprint Links are now the parent relation; status→sprint_state; the
	per-task assignee Link assigned_to→owner_user; the done phase 'DONE' is now
	'CLOSED'). actual_minutes/pdca_phase keep their names. Return shape is
	unchanged.
	"""
	sprints = tree.children(
		project,
		"Sprint",
		filters={"sprint_state": _CLOSED_STATUS},
		fields=["name"],
		order_by="end_date desc",
	)

	streak = 0
	for s in sprints:
		if _user_minutes_in_sprint(s["name"], user) > 0:
			streak += 1
		else:
			break

	return {"streak": int(streak), "sprints_checked": len(sprints)}


def _user_minutes_in_sprint(sprint: str, user: str) -> float:
	"""Sum actual_minutes of a user's CLOSED Task nodes in a Sprint."""
	tasks = tree.children(
		sprint,
		"Task",
		filters={"owner_user": user, "pdca_phase": _DONE_PHASE},
		fields=["actual_minutes"],
	)
	return float(sum(t.actual_minutes or 0 for t in tasks))
