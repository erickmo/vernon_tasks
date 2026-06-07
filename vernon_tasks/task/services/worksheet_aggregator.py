"""Compose user's weekly worksheet payload.

VT Item migration: the legacy SQL joins (Task Schedule Entry ⋈ VT Task ⋈
VT Project ⋈ Key Result) are gone. On the unified tree:
  • Tasks are VT Item nodes (node_type='Task'); the assignee Link
    `assigned_to` → `owner_user` (field renamed, value preserved).
  • Schedule entries stay as the `schedule_entries` child table on each Task
    node (doctype 'Task Schedule Entry'); rows keep their fields.
  • A Task's project is its nearest Project ancestor (tree.project_of); the
    Project's Key Results live as `key_results` child rows on that Project's
    nearest OKR ancestor (legacy Key Result.objective → OKR node).
Work Profile is NOT part of the merge and is queried unchanged.
"""
from __future__ import annotations

from datetime import date, timedelta

import frappe
from frappe.utils import getdate

from vernon_tasks.task.services import vt_item_tree as tree

_DEFAULT_CAPACITY_HOURS = 40
_WORKDAYS_PER_WEEK = 5
_DAYS_IN_WEEK = 7
_DEFAULT_HOUR_START = 8
_DEFAULT_MINUTES_PLANNED = 60
_MINUTES_PER_HOUR = 60
_WORK_PROFILE_DOCTYPE = "Work Profile"
_OPEN_PHASES = ("PLAN", "DO", "CHECK")


def build_worksheet(user: str, week_start: str) -> dict:
	start = _parse_monday(week_start)
	end = start + timedelta(days=_DAYS_IN_WEEK - 1)

	capacity = _get_capacity(user)
	entries = _load_entries(user, start, end)

	days = []
	for i in range(_DAYS_IN_WEEK):
		d = start + timedelta(days=i)
		day_entries = [_entry(e) for e in entries if e["date"] == d]
		# Entries carry minutes_planned; capacity_hours is weekly hours, so
		# convert the day's scheduled minutes to hours (÷60) to stay comparable.
		scheduled_minutes = sum(e["minutes_planned"] for e in day_entries)
		days.append({
			"date": str(d),
			"entries": sorted(day_entries, key=lambda e: e["hour_start"]),
			"scheduled_hours": round(scheduled_minutes / _MINUTES_PER_HOUR, 2),
		})

	scheduled_task_ids = {e["task_id"] for e in entries}
	unscheduled = _load_unscheduled(user, scheduled_task_ids)

	return {
		"week_start": str(start),
		"week_end": str(end),
		"capacity_hours": capacity,
		"days": days,
		"unscheduled": unscheduled,
	}


def _parse_monday(s: str) -> date:
	d = date.fromisoformat(s)
	if d.weekday() != 0:
		raise ValueError("week_start must be a Monday")
	return d


def _get_capacity(user: str) -> float:
	daily = frappe.db.get_value(_WORK_PROFILE_DOCTYPE, {"user": user}, "daily_target_hours")
	if not daily:
		return float(_DEFAULT_CAPACITY_HOURS)
	return float(daily) * _WORKDAYS_PER_WEEK


def _load_entries(user: str, start: date, end: date) -> list:
	"""Schedule entries within [start, end] that belong to `user`.

	Walks the user's Task nodes (owner_user=user, the legacy assignee) and
	reads each Task's `schedule_entries` child rows — mirroring the legacy
	clause `(se.owner_user=user OR (se.owner_user IS NULL AND assignee=user))`:
	a row counts when its own owner is `user` or unset (then it falls to the
	task assignee, which is `user` here). Project/KR are resolved via the tree."""
	tasks = tree.nodes("Task", filters={"owner_user": user},
		fields=["name", "title", "pdca_phase", "leader_override_points",
			"earned_points", "base_points"])
	out = []
	for t in tasks:
		linked_kr = _linked_kr(t.name)
		project = tree.project_of(t.name)
		for row in tree.child_table_rows(t.name, "schedule_entries"):
			if row.get("owner_user") and row.get("owner_user") != user:
				continue
			d = getdate(row.get("date")) if row.get("date") else None
			if d is None or d < start or d > end:
				continue
			out.append(_compose_entry(t, row, d, linked_kr, project))
	return out


def _compose_entry(task, row: dict, d: date, linked_kr, project) -> dict:
	"""Flatten a Task node + one schedule child row into a query-style dict,
	matching the columns the legacy SQL produced (name aliases preserved)."""
	minutes = row.get("minutes_planned")
	if minutes is None:
		minutes = row.get("allocated_minutes")
	return {
		"name": row.get("name"),
		"task_id": task.name,
		"date": d,
		"minutes_planned": minutes,
		"hour_start": row.get("hour_start"),
		"title": task.title,
		"pdca_phase": task.pdca_phase,
		"points": _points(task),
		"linked_kr": linked_kr,
		"project": project,
	}


def _load_unscheduled(user: str, scheduled_task_ids: set) -> list:
	"""Open Task nodes assigned to `user` not already scheduled this week.

	Replaces the legacy `VT Task WHERE assigned_to=user AND pdca_phase IN
	(PLAN,DO,CHECK)` scan; assignee assigned_to → owner_user, project & KR
	resolved via the tree (nearest Project ancestor → its OKR's key_results)."""
	rows = tree.nodes("Task",
		filters={"owner_user": user, "pdca_phase": ["in", list(_OPEN_PHASES)]},
		fields=["name", "title", "pdca_phase", "leader_override_points",
			"earned_points", "base_points", "deadline"])
	return [_unscheduled(r) for r in rows if r.name not in scheduled_task_ids]


def _linked_kr(task_name: str):
	"""First Key Result name reachable from a Task: nearest Project ancestor →
	its nearest OKR ancestor → `key_results` child rows. None when unlinked.
	(The legacy join fanned out one row per KR; the consumer only reads
	linked_kr as a presence flag, so a single representative name is kept.)"""
	project = tree.project_of(task_name)
	if not project:
		return None
	okr = tree.ancestor_of_type(project, "OKR")
	if not okr:
		return None
	krs = tree.child_table_rows(okr, "key_results")
	return krs[0].get("name") if krs else None


def _points(task) -> int:
	return int(task.leader_override_points or task.earned_points or task.base_points or 0)


def _entry(e: dict) -> dict:
	return {
		"id": e["name"],
		"task_id": e["task_id"],
		"title": e["title"],
		"pdca": e["pdca_phase"],
		"points": int(e["points"] or 0),
		"linked_kr": e["linked_kr"],
		"project": e["project"],
		"hour_start": int(e["hour_start"] if e["hour_start"] is not None else _DEFAULT_HOUR_START),
		"minutes_planned": float(e["minutes_planned"] or _DEFAULT_MINUTES_PLANNED),
	}


def _unscheduled(r: dict) -> dict:
	return {
		"task_id": r.name,
		"title": r.title,
		"pdca": r.pdca_phase,
		"points": _points(r),
		"linked_kr": _linked_kr(r.name),
		"project": tree.project_of(r.name),
		"due_date": str(r.deadline) if r.deadline else None,
	}
