"""My Work endpoints — the current user's task views.

VT Item tree model (unified hierarchy):
- A task is a VT Item node with node_type="Task".
- Legacy `VT Task.assigned_to` is now `owner_user`.
- Legacy terminal phase `pdca_phase="DONE"` is now `pdca_phase="CLOSED"`.
- `kanban_status` is DERIVED from `pdca_phase` by the controller
  (PDCA_KANBAN_MAP); only "Blocked" is ever set directly.
- Legacy `VT Task.project` / `VT Task.sprint` Link fields are gone: a task's
  containing project is its nearest Project ancestor (tree.project_of), and its
  sprint is its direct parent when that parent is a Sprint node.
- `Task Dependency` (dependencies) and `Task Schedule Entry` (schedule_entries)
  remain child tables, now hung on the VT Item Task node.

Source of truth:
docs/superpowers/specs/2026-06-07-vt-item-unified-hierarchy-design.html
"""
import frappe
from frappe.utils import today, add_days, getdate
from vernon_tasks.task.api.security import require_login, max_str
from vernon_tasks.task.services import vt_item_tree as tree

TASK_DOCTYPE = "VT Item"
TASK_NODE_TYPE = "Task"
DONE_PHASE = "CLOSED"


def _project_of(task_name: str):
	"""Nearest Project ancestor of a Task node (was VT Task.project)."""
	return tree.project_of(task_name)


def _sprint_of(task_name: str):
	"""Direct parent of a Task node when it is a Sprint (was VT Task.sprint)."""
	parent = frappe.db.get_value(TASK_DOCTYPE, task_name, "parent_vt_item")
	if not parent:
		return None
	if frappe.db.get_value(TASK_DOCTYPE, parent, "node_type") == "Sprint":
		return parent
	return None


def _serialize(row: dict) -> dict:
	name = row["name"]
	return {
		"id": name,
		"title": row.get("title"),
		"status": row.get("kanban_status"),
		"priority": row.get("priority"),
		"due_date": row.get("deadline"),
		"project": _project_of(name),
		"sprint": _sprint_of(name),
		"points": row.get("base_points") or 0,
	}


@frappe.whitelist()
def list() -> dict:
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Login required", frappe.PermissionError)

	rows = tree.nodes(
		TASK_NODE_TYPE,
		filters={"owner_user": user, "kanban_status": ["!=", "Cancelled"]},
		fields=["name", "title", "kanban_status", "priority", "deadline", "base_points"],
		order_by="deadline asc",
		limit=500,
	)

	today_d = getdate(today())
	upcoming_cap = add_days(today_d, 7)
	overdue, today_list, upcoming = [], [], []
	for r in rows:
		d = getdate(r["deadline"]) if r["deadline"] else None
		item = _serialize(r)
		if d is None or d > getdate(upcoming_cap):
			continue
		if d < today_d:
			overdue.append(item)
		elif d == today_d:
			today_list.append(item)
		else:
			upcoming.append(item)
	return {"overdue": overdue, "today": today_list, "upcoming": upcoming}


@frappe.whitelist()
def search(
	query: str = "",
	priority: str = "",
	project: str = "",
	due_range: str = "all",
) -> dict:
	user = frappe.session.user
	if user == "Guest":
		frappe.throw("Login required", frappe.PermissionError)
	query = max_str(query, 200)

	filters: dict = {
		"owner_user": user,
		"kanban_status": ["!=", "Cancelled"],
	}
	if query:
		filters["title"] = ["like", f"%{query}%"]
	if priority:
		choices = [p.strip() for p in priority.split(",") if p.strip()]
		if choices:
			filters["priority"] = ["in", choices]
	if due_range:
		today_d = getdate(today())
		if due_range == "today":
			filters["deadline"] = ["=", today_d]
		elif due_range == "week":
			filters["deadline"] = ["between", [today_d, add_days(today_d, 7)]]
		elif due_range == "overdue":
			filters["deadline"] = ["<", today_d]

	rows = tree.nodes(
		TASK_NODE_TYPE,
		filters=filters,
		fields=["name", "title", "kanban_status", "priority", "deadline", "base_points"],
		order_by="deadline asc",
		limit=200,
	)
	results = [_serialize(r) for r in rows]
	# Legacy VT Task.project Link filter — now resolved via tree ancestry.
	if project:
		results = [r for r in results if r["project"] == project]
	return {"results": results, "total": len(results)}


@frappe.whitelist()
def detail(task_id: str) -> dict:
	require_login()
	user = frappe.session.user
	if not frappe.db.exists(
		TASK_DOCTYPE, {"name": task_id, "node_type": TASK_NODE_TYPE}
	):
		frappe.throw("Not found", frappe.PermissionError)

	doc = frappe.get_doc(TASK_DOCTYPE, task_id)
	# Legacy VT Task granted VT Member read only `if_owner`; on VT Item plain
	# members have global read, so gate non-owners on `write` (managers/leads
	# have it, members do not) to preserve the owner-only-for-members posture.
	if doc.get("owner_user") != user and not frappe.has_permission(
		TASK_DOCTYPE, "write", doc=doc
	):
		frappe.throw("Forbidden", frappe.PermissionError)

	activity = frappe.get_all(
		"Comment",
		filters={"reference_doctype": TASK_DOCTYPE, "reference_name": task_id},
		fields=["content", "comment_type", "creation", "owner"],
		order_by="creation desc",
		limit_page_length=10,
	)
	return {
		**_serialize(doc.as_dict()),
		"description": None,
		"activity": activity,
	}


def _user_tasks(user: str, extra_filters: dict | None = None) -> list:
	"""All of the user's Task nodes (was `tabVT Task WHERE assigned_to=user`)."""
	filters = {"owner_user": user}
	filters.update(extra_filters or {})
	return tree.nodes(
		TASK_NODE_TYPE,
		filters=filters,
		fields=[
			"name", "title", "priority", "deadline", "start_date",
			"pdca_phase", "kanban_status",
		],
	)


def _has_open_blocker(task_name: str) -> bool:
	"""True if any dependency's blocker task is not yet CLOSED."""
	for dep in tree.child_table_rows(task_name, "dependencies"):
		blocker = dep.get("blocked_by")
		if not blocker:
			continue
		phase = frappe.db.get_value(TASK_DOCTYPE, blocker, "pdca_phase")
		if phase != DONE_PHASE:
			return True
	return False


def _sort_by_priority_deadline(rows: list) -> list:
	order = {"High": 0, "Medium": 1, "Low": 2}
	return sorted(
		rows,
		key=lambda r: (
			order.get(r.get("priority"), 99),
			getdate(r["deadline"]) if r.get("deadline") else getdate("2999-12-31"),
		),
	)


@frappe.whitelist()
def get_my_day() -> list:
	"""
	Retrieve today's scheduled tasks for the current user.

	Returns tasks assigned to the current user with schedule entries for today,
	excluding completed tasks (pdca_phase = 'CLOSED').

	Ordered by priority (High, Medium, Low) and deadline.
	Moved from the retired my-work desk Page (now the vt-home "Tugas Saya" tab).
	"""
	user = frappe.session.user
	today_d = getdate(today())
	out = []
	for t in _user_tasks(user):
		if t["pdca_phase"] == DONE_PHASE:
			continue
		alloc = None
		for se in tree.child_table_rows(t["name"], "schedule_entries"):
			if se.get("date") and getdate(se["date"]) == today_d:
				alloc = se.get("allocated_minutes")
				break
		if alloc is None:
			continue
		out.append({
			"name": t["name"],
			"title": t["title"],
			"project": _project_of(t["name"]),
			"priority": t["priority"],
			"pdca_phase": t["pdca_phase"],
			"kanban_status": t["kanban_status"],
			"allocated_minutes": alloc,
		})
	return _sort_by_priority_deadline(out)


@frappe.whitelist()
def get_what_to_do_today() -> list:
	"""
	Retrieve prioritized tasks for today based on PDCA phase and priority.

	Returns high-priority unfinished tasks that should be worked on today.
	Moved from the retired my-work desk Page.
	"""
	user = frappe.session.user
	cutoff = getdate(add_days(today(), 3))
	out = []
	for t in _user_tasks(user):
		if t["pdca_phase"] in (DONE_PHASE, "ACT"):
			continue
		if not t["deadline"] or getdate(t["deadline"]) > cutoff:
			continue
		if _has_open_blocker(t["name"]):
			continue
		out.append({
			"name": t["name"],
			"title": t["title"],
			"project": _project_of(t["name"]),
			"priority": t["priority"],
			"deadline": t["deadline"],
			"pdca_phase": t["pdca_phase"],
			"kanban_status": t["kanban_status"],
		})
	return _sort_by_priority_deadline(out)


@frappe.whitelist()
def get_my_blocked_tasks() -> list:
	"""
	Retrieve tasks that are currently blocked due to dependencies.

	Returns tasks where blockers are not yet completed.
	Moved from the retired my-work desk Page.
	"""
	user = frappe.session.user
	today_d = getdate(today())
	out = []
	for t in _user_tasks(user):
		if t["pdca_phase"] == DONE_PHASE:
			continue
		for dep in tree.child_table_rows(t["name"], "dependencies"):
			blocker = dep.get("blocked_by")
			if not blocker:
				continue
			b = frappe.db.get_value(
				TASK_DOCTYPE, blocker,
				["title", "owner_user", "pdca_phase"],
				as_dict=True,
			)
			if not b or b.pdca_phase == DONE_PHASE:
				continue
			start = t.get("start_date")
			days_blocked = (today_d - getdate(start)).days if start else None
			out.append({
				"name": t["name"],
				"title": t["title"],
				"project": _project_of(t["name"]),
				"priority": t["priority"],
				"deadline": t["deadline"],
				"pdca_phase": t["pdca_phase"],
				"kanban_status": t["kanban_status"],
				"blocker_name": blocker,
				"blocker_title": b.title,
				"blocker_assignee": b.owner_user,
				"days_blocked": days_blocked,
			})
	out.sort(key=lambda r: r["days_blocked"] if r["days_blocked"] is not None else -1, reverse=True)
	return out


@frappe.whitelist()
def start_task(task: str) -> dict:
	"""
	Transition a task to 'In Progress' status.

	Args:
		task: Task name (ID)

	Returns:
		dict: {"status": "ok"} on success.
	Moved from the retired my-work desk Page.
	"""
	user = frappe.session.user
	doc = frappe.db.get_value(
		TASK_DOCTYPE, {"name": task, "node_type": TASK_NODE_TYPE},
		["name", "owner_user", "pdca_phase", "kanban_status", "title"],
		as_dict=True,
	)
	if not doc:
		frappe.throw(f"Task {task} not found", frappe.DoesNotExistError)
	if doc.owner_user != user:
		frappe.throw("Not authorized to act on this task", frappe.PermissionError)
	if doc.pdca_phase not in ("BACKLOG", "PLAN"):
		frappe.throw(
			f"Task must be Backlog or Scheduled to start (current: {doc.kanban_status})",
			frappe.ValidationError,
		)
	if _has_open_blocker(task):
		blocker_title = _first_open_blocker_title(task)
		frappe.throw(
			f"Task is blocked by: {blocker_title}",
			frappe.ValidationError,
		)
	# Controller derives kanban_status from pdca_phase (DO → "In Progress").
	node = frappe.get_doc(TASK_DOCTYPE, task)
	node.pdca_phase = "DO"
	node.save(ignore_permissions=True)
	return {"status": "ok"}


def _first_open_blocker_title(task_name: str):
	for dep in tree.child_table_rows(task_name, "dependencies"):
		blocker = dep.get("blocked_by")
		if not blocker:
			continue
		b = frappe.db.get_value(
			TASK_DOCTYPE, blocker, ["title", "pdca_phase"], as_dict=True
		)
		if b and b.pdca_phase != DONE_PHASE:
			return b.title
	return None


@frappe.whitelist()
def submit_for_review(task: str) -> dict:
	"""
	Submit a task for peer/manager review.

	Args:
		task: Task name (ID)

	Returns:
		dict: {"status": "ok"} on success.
	Moved from the retired my-work desk Page.
	"""
	user = frappe.session.user
	doc = frappe.db.get_value(
		TASK_DOCTYPE, {"name": task, "node_type": TASK_NODE_TYPE},
		["name", "owner_user", "pdca_phase", "kanban_status"],
		as_dict=True,
	)
	if not doc:
		frappe.throw(f"Task {task} not found", frappe.DoesNotExistError)
	if doc.owner_user != user:
		frappe.throw("Not authorized to act on this task", frappe.PermissionError)
	if doc.pdca_phase != "DO":
		frappe.throw(
			f"Task must be In Progress to submit for review (current: {doc.kanban_status})",
			frappe.ValidationError,
		)
	# Controller derives kanban_status from pdca_phase (CHECK → "In Review").
	node = frappe.get_doc(TASK_DOCTYPE, task)
	node.pdca_phase = "CHECK"
	node.save(ignore_permissions=True)
	return {"status": "ok"}
