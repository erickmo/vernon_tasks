import frappe
from frappe.utils import add_days, getdate

from vernon_tasks.task.services import vt_item_tree as tree


def get_burndown(sprint: str) -> dict:
	"""Burndown series for a Sprint node (labels/ideal/remaining + unestimated).

	Replaces the legacy `VT Sprint`/`VT Task WHERE sprint=…` scans: the Sprint
	is a VT Item node (start_date/end_date preserved) and its Tasks are VT Item
	children (the old VT Task.sprint Link is now the parent relation;
	estimated_minutes/completion_date keep their names). Return shape unchanged.
	"""
	sprint_doc = frappe.get_doc("VT Item", sprint)
	start = getdate(sprint_doc.start_date)
	end = getdate(sprint_doc.end_date)
	days = (end - start).days + 1
	if days <= 0:
		return {"labels": [], "ideal": [], "remaining": [], "unestimated_count": 0}

	tasks = tree.children(
		sprint,
		"Task",
		filters={"estimated_minutes": [">", 0]},
		fields=["estimated_minutes", "completion_date"],
	)

	total = sum(float(t["estimated_minutes"]) for t in tasks)

	labels, ideal, remaining = [], [], []
	for i in range(days):
		d = add_days(start, i)
		d_date = getdate(d)
		labels.append(str(d_date))
		ideal.append(round(total * (1 - i / (days - 1)) if days > 1 else 0.0, 2))
		rem = sum(
			float(t["estimated_minutes"])
			for t in tasks
			if t["completion_date"] is None or getdate(t["completion_date"]) > d_date
		)
		remaining.append(float(rem))

	unestimated = tree.children(
		sprint,
		"Task",
		filters={"estimated_minutes": 0},
		fields=["name"],
	)

	return {
		"labels": labels,
		"ideal": ideal,
		"remaining": remaining,
		"unestimated_count": len(unestimated),
	}
