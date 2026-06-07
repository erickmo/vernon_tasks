import frappe

from vernon_tasks.task.services import vt_item_tree as tree

_CLOSED_STATUS = "Closed"


def get_okr_rollup(period: str | None = None) -> list[dict]:
	"""Roll up OKR progress from each OKR node's Key Result child rows.

	Replaces the legacy Objective⨝Key Result SQL join: OKRs are VT Item nodes
	(node_type='OKR', status→health_status, objective_owner→owner_user); Key
	Results are child rows (`key_results`). Progress is the mean of child
	`progress_percent`. Output shape is unchanged for downstream consumers.
	"""
	filters = {"health_status": ["!=", _CLOSED_STATUS]}
	if period:
		filters["period"] = period
	okrs = tree.nodes(
		"OKR",
		filters=filters,
		fields=["name", "title", "owner_user", "health_status"],
	)

	result = []
	for okr in okrs:
		krs = tree.child_table_rows(okr.name, "key_results")
		progresses = [float(r.get("progress_percent") or 0) for r in krs]
		progress = round(sum(progresses) / len(progresses), 2) if progresses else 0.0
		result.append({
			"objective": okr.name,
			"title": okr.title,
			"owner": okr.owner_user,
			"status": okr.health_status,
			"progress": progress,
			"kr_count": len(krs),
		})
	# Mirror legacy ORDER BY progress DESC, title ASC.
	result.sort(key=lambda r: (-r["progress"], r["title"]))
	return result
