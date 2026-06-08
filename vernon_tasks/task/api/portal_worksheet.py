"""Portal Worksheet API.

VT Item migration: Tasks are VT Item nodes (node_type='Task'); the legacy
assignee Link `assigned_to` → `owner_user` (renamed, value preserved). Schedule
entries stay as the `schedule_entries` child table on each Task node (child
doctype 'Task Schedule Entry', rows unchanged). All direct legacy reads of
'VT Task' / SQL joins over tabVT Task ⋈ tabTask Schedule Entry are replaced by
vt_item_tree helpers + Python aggregation. The worksheet_aggregator service
(already migrated) handles the main weekly aggregation.
"""
from __future__ import annotations

from datetime import date as Date, timedelta

import frappe
from frappe.utils import getdate

from vernon_tasks.task.api.security import max_str, require_login
from vernon_tasks.task.services import vt_item_tree as tree
from vernon_tasks.task.services.worksheet_aggregator import build_worksheet

_WEEK_START_MAX_LEN = 10
_DATE_MAX_LEN = 10
_DAYS_IN_WEEK = 7
_SCHEDULE_ENTRY_DOCTYPE = "Task Schedule Entry"
_TASK_DOCTYPE = "VT Item"
_TASK_NODE_TYPE = "Task"
_TASK_PARENTTYPE = "VT Item"
_USER_DOCTYPE = "User"
_LEADER_ROLES = ("Vernon Leader", "Vernon PM")
_DEFAULT_HOUR_START = 8
_DEFAULT_HOURS_PLANNED = 1.0
_DEFAULT_MINUTES_PLANNED = 60.0
_MIN_HOUR = 0
_MAX_HOUR = 23
_MAX_HOURS_PER_SLOT = 24.0
_OPEN_PHASES = ("PLAN", "DO", "CHECK", "BACKLOG")


@frappe.whitelist()
def get_worksheet(week_start: str) -> dict:
	require_login()
	return build_worksheet(
		user=frappe.session.user,
		week_start=max_str(week_start, _WEEK_START_MAX_LEN),
	)


@frappe.whitelist()
def schedule_task(
	task_id: str,
	date: str,
	hour_start: int = _DEFAULT_HOUR_START,
	hours: float = _DEFAULT_HOURS_PLANNED,
) -> dict:
	"""Append a Task Schedule Entry to a Task node for the current user."""
	require_login()
	user = frappe.session.user
	_validate_slot(hour_start, hours)
	parsed_date = Date.fromisoformat(max_str(date, _DATE_MAX_LEN))

	task = frappe.get_doc(_TASK_DOCTYPE, task_id)
	entry = task.append("schedule_entries", {
		"date": parsed_date,
		"allocated_minutes": float(hours),
		"minutes_planned": float(hours),
		"hour_start": int(hour_start),
		"owner_user": user,
		"is_override": 0,
	})
	task.save(ignore_permissions=False)
	return {"entry_id": entry.name, "task_id": task_id}


@frappe.whitelist()
def update_entry(
	entry_id: str,
	date: str | None = None,
	hour_start: int | None = None,
	hours: float | None = None,
) -> dict:
	"""Update an existing Task Schedule Entry row."""
	require_login()
	user = frappe.session.user
	parent_task = _load_entry_parent(entry_id, user)

	task = frappe.get_doc(_TASK_DOCTYPE, parent_task)
	target = next((e for e in task.schedule_entries if e.name == entry_id), None)
	if target is None:
		frappe.throw("Schedule entry not found on task")

	if date is not None:
		target.date = Date.fromisoformat(max_str(date, _DATE_MAX_LEN))
	if hour_start is not None:
		_validate_hour(int(hour_start))
		target.hour_start = int(hour_start)
	if hours is not None:
		_validate_hours(float(hours))
		target.minutes_planned = float(hours)
		target.allocated_minutes = float(hours)

	task.save(ignore_permissions=False)
	return {"entry_id": entry_id, "task_id": parent_task}


@frappe.whitelist()
def unschedule(entry_id: str) -> dict:
	"""Delete a Task Schedule Entry by removing it from its parent task."""
	require_login()
	user = frappe.session.user
	parent_task = _load_entry_parent(entry_id, user)

	task = frappe.get_doc(_TASK_DOCTYPE, parent_task)
	task.schedule_entries = [e for e in task.schedule_entries if e.name != entry_id]
	task.save(ignore_permissions=False)
	return {"entry_id": entry_id, "task_id": parent_task, "deleted": True}


@frappe.whitelist()
def bulk_carry_over(week_start: str) -> dict:
	"""Copy previous week's incomplete entries (open tasks) forward by 7 days."""
	require_login()
	user = frappe.session.user
	target_monday = Date.fromisoformat(max_str(week_start, _WEEK_START_MAX_LEN))
	if target_monday.weekday() != 0:
		frappe.throw("week_start must be a Monday")
	prev_start = target_monday - timedelta(days=_DAYS_IN_WEEK)
	prev_end = prev_start + timedelta(days=_DAYS_IN_WEEK - 1)

	carry = _collect_carry_rows(user, prev_start, prev_end)

	copied = 0
	for r in carry:
		try:
			task = frappe.get_doc(_TASK_DOCTYPE, r["task_id"])
			task.append("schedule_entries", {
				"date": r["date"] + timedelta(days=_DAYS_IN_WEEK),
				"allocated_minutes": float(r["minutes"]),
				"minutes_planned": float(r["minutes"]),
				"hour_start": int(r["hour_start"]),
				"owner_user": user,
				"is_override": 0,
			})
			task.save(ignore_permissions=False)
			copied += 1
		except frappe.exceptions.PermissionError:
			continue
	return {"copied": copied, "week_start": str(target_monday)}


def _collect_carry_rows(user: str, start: Date, end: Date) -> list[dict]:
	"""Open Task nodes owned by `user` and their schedule rows in [start, end].

	Mirrors the legacy clause `(se.owner_user = user OR (se.owner_user IS NULL
	AND t.assigned_to = user))`: tasks are filtered by owner_user=user (the
	former assignee), and a row counts when its own owner is `user` or unset."""
	tasks = tree.nodes(
		_TASK_NODE_TYPE,
		filters={"owner_user": user, "pdca_phase": ["in", list(_OPEN_PHASES)]},
		fields=["name"],
	)
	out: list[dict] = []
	for t in tasks:
		for row in tree.child_table_rows(t.name, "schedule_entries"):
			row_owner = row.get("owner_user")
			if row_owner and row_owner != user:
				continue
			d = getdate(row.get("date")) if row.get("date") else None
			if d is None or d < start or d > end:
				continue
			minutes = row.get("minutes_planned")
			if minutes is None:
				minutes = row.get("allocated_minutes")
			if minutes is None:
				minutes = _DEFAULT_MINUTES_PLANNED
			hour_start = row.get("hour_start")
			if hour_start is None:
				hour_start = _DEFAULT_HOUR_START
			out.append({
				"task_id": t.name,
				"date": d,
				"minutes": minutes,
				"hour_start": hour_start,
			})
	return out


def _validate_slot(hour_start: int, hours: float) -> None:
	_validate_hour(int(hour_start))
	_validate_hours(float(hours))


def _validate_hour(hour_start: int) -> None:
	if hour_start < _MIN_HOUR or hour_start > _MAX_HOUR:
		frappe.throw(f"hour_start must be between {_MIN_HOUR} and {_MAX_HOUR}")


def _validate_hours(hours: float) -> None:
	if hours <= 0 or hours > _MAX_HOURS_PER_SLOT:
		frappe.throw(f"hours must be > 0 and <= {_MAX_HOURS_PER_SLOT}")


def _load_entry_parent(entry_id: str, user: str) -> str:
	"""Find the Task node owning a schedule-entry row and authorise the user.

	The schedule row is a `schedule_entries` child of a VT Item Task node;
	`Task Schedule Entry` is the child doctype (not a legacy merge doctype), so
	its parent link is read directly. Owner falls back to the Task node's
	owner_user (former assigned_to) when the row owner is unset."""
	row = frappe.db.get_value(
		_SCHEDULE_ENTRY_DOCTYPE,
		{"name": entry_id, "parenttype": _TASK_PARENTTYPE},
		["parent", "owner_user"],
		as_dict=True,
	)
	if not row:
		frappe.throw("Schedule entry not found")
	task_id = row.get("parent")
	task_owner = frappe.db.get_value(_TASK_DOCTYPE, task_id, "owner_user")
	owner = row.get("owner_user") or task_owner
	if user != "Administrator" and owner and owner != user:
		roles = set(frappe.get_roles(user))
		if not roles.intersection(set(_LEADER_ROLES)):
			raise frappe.PermissionError("Cannot modify another user's schedule entry")
	return task_id


@frappe.whitelist()
def get_team_worksheet(week_start: str) -> list[dict]:
	require_login()
	user = frappe.session.user
	user_roles = set(frappe.get_roles(user))
	if user != "Administrator" and not user_roles.intersection(set(_LEADER_ROLES)):
		raise frappe.PermissionError("Team view requires Leader/PM role")

	start = Date.fromisoformat(max_str(week_start, _WEEK_START_MAX_LEN))
	end = start + timedelta(days=_DAYS_IN_WEEK - 1)

	by_user = _aggregate_team_days(start, end)
	_fill_full_names(by_user)
	return list(by_user.values())


def _aggregate_team_days(start: Date, end: Date) -> dict[str, dict]:
	"""Group schedule minutes/counts by (user, date) over all Task nodes.

	Replaces the legacy SQL GROUP BY on tabTask Schedule Entry ⋈ tabVT Task ⋈
	tabUser. The grouping key is the row's owner_user, falling back to the Task
	node's owner_user (former assigned_to) when the row owner is unset."""
	tasks = tree.nodes(_TASK_NODE_TYPE, fields=["name", "owner_user"])
	by_user: dict[str, dict] = {}
	for t in tasks:
		for row in tree.child_table_rows(t.name, "schedule_entries"):
			d = getdate(row.get("date")) if row.get("date") else None
			if d is None or d < start or d > end:
				continue
			key = row.get("owner_user") or t.owner_user
			if not key:
				continue
			bucket = _ensure_user_bucket(by_user, key, start)
			minutes = row.get("minutes_planned")
			if minutes is None:
				minutes = row.get("allocated_minutes")
			day = bucket["days"][str(d)]
			day["minutes"] += float(minutes or 0)
			day["task_count"] += 1
	return by_user


def _ensure_user_bucket(by_user: dict, key: str, start: Date) -> dict:
	if key not in by_user:
		by_user[key] = {
			"user": key,
			"full_name": None,
			"days": {
				str(start + timedelta(days=i)): {"minutes": 0, "task_count": 0}
				for i in range(_DAYS_IN_WEEK)
			},
		}
	return by_user[key]


def _fill_full_names(by_user: dict) -> None:
	for key, bucket in by_user.items():
		bucket["full_name"] = frappe.db.get_value(_USER_DOCTYPE, key, "full_name")
