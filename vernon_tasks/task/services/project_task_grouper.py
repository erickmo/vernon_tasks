"""Pre-group a Project's Task nodes by KR / PDCA / Sprint / Assignee / Due-date.

VT Item tree notes:
- A Project's Tasks are its VT Item subtree: `tree.descendants(project, "Task")`
  spans tasks sitting directly under the Project as well as those nested under
  a Sprint (the old VT Task.project Link is now nested-set ancestry).
- Field renames on VT Item Task nodes: the per-task assignee Link
  assigned_to→owner_user; the old VT Task.sprint Link is now the parent
  relation, so a task's Sprint is its nearest Sprint ancestor
  (`tree.ancestor_of_type(task, "Sprint")`). Everything else keeps its name
  (pdca_phase, deadline, kanban_status, base/earned/leader_override_points,
  risk_flag).
- KRs reachable from a Project: the legacy Project.objective→Key Result chain is
  now Project node → nearest OKR ancestor → its `key_results` child table
  (VT Item Key Result rows: metric, target_value, current_value,
  progress_percent preserved). Because the task→KR link was removed (KRs link at
  the OKR level only), the "kr" grouping places every task in a single
  "Unlinked" bucket.
- Output aliases (unchanged for downstream consumers): assignee, due_date,
  status, subject; points coalesces leader override, earned, base.
"""
from __future__ import annotations

from typing import Literal

import frappe

from vernon_tasks.task.services import vt_item_tree as tree

GroupBy = Literal["kr", "pdca", "sprint", "assignee", "due"]
ALLOWED = ("kr", "pdca", "sprint", "assignee", "due")

_TASK_FIELDS = [
	"name",
	"title",
	"pdca_phase",
	"owner_user",
	"deadline",
	"kanban_status",
	"base_points",
	"earned_points",
	"leader_override_points",
	"risk_flag",
]


def group_tasks(project_id: str, group_by: GroupBy) -> list[dict]:
	if group_by not in ALLOWED:
		raise ValueError(f"group_by must be one of {ALLOWED}")
	tasks = _load_tasks(project_id)
	fn = {
		"kr":       _group_by_kr,
		"pdca":     _group_by_pdca,
		"sprint":   _group_by_sprint,
		"assignee": _group_by_assignee,
		"due":      _group_by_due,
	}[group_by]
	return fn(project_id, tasks)


def _load_tasks(project_id: str) -> list[dict]:
	"""Load a Project's Task nodes from its VT Item subtree, with legacy aliases.

	Replaces the legacy `tabVT Task WHERE project=…` scan: Tasks are the
	Project's nested-set descendants of node_type "Task". Field renames applied:
	assigned_to→owner_user (aliased back to `assignee`), the Sprint Link is the
	nearest Sprint ancestor; deadline/kanban_status/points keep their names.
	"""
	rows = tree.descendants(project_id, "Task", fields=_TASK_FIELDS)
	tasks = []
	for r in rows:
		tasks.append({
			"name": r.name,
			"title": r.title,
			"pdca_phase": r.pdca_phase,
			"assignee": r.owner_user,
			"due_date": r.deadline,
			"points": _coalesce_points(r),
			"status": r.kanban_status,
			"sprint": tree.ancestor_of_type(r.name, "Sprint"),
			"risk_flag": r.risk_flag,
		})
	return tasks


def _coalesce_points(row) -> int:
	"""Mirror COALESCE(leader_override, earned, base, 0) from the legacy query."""
	for field in ("leader_override_points", "earned_points", "base_points"):
		value = row.get(field)
		if value is not None:
			return int(value)
	return 0


def _task_row(t: dict) -> dict:
	return {
		"id": t["name"],
		"title": t["title"],
		"pdca": t["pdca_phase"],
		"assignee": t["assignee"],
		"due_date": str(t["due_date"]) if t["due_date"] else None,
		"points": int(t["points"] or 0),
		"status": t["status"],
		"sprint": t["sprint"],
		"risk_flag": t["risk_flag"],
	}


def _group_by_kr(project_id: str, tasks: list[dict]) -> list[dict]:
	kr_meta = _kr_meta_for_project(project_id)
	buckets: dict[str, dict] = {}
	for t in tasks:
		# Task→KR link removed; KRs live at the OKR level, so every task is
		# unlinked at the task granularity.
		key = "__unlinked__"
		bucket = buckets.setdefault(key, {
			"key": key,
			"label": kr_meta.get(key, {}).get("label", "Unlinked"),
			"meta":  kr_meta.get(key, {}),
			"tasks": [],
		})
		bucket["tasks"].append(_task_row(t))
	# Stable order: linked first sorted by label, Unlinked last
	linked = sorted([b for k, b in buckets.items() if k != "__unlinked__"], key=lambda b: b["label"])
	unlinked = [b for k, b in buckets.items() if k == "__unlinked__"]
	return linked + unlinked


def _kr_meta_for_project(project_id: str) -> dict[str, dict]:
	"""Resolve KRs reachable from this Project via its nearest OKR ancestor.

	Replaces the legacy `Key Result JOIN VT Project ON p.objective=kr.objective`
	scan: the Project node's OKR ancestor carries the KRs as `key_results` child
	rows (metric→title; target_value/current_value/progress_percent preserved).
	"""
	okr = tree.ancestor_of_type(project_id, "OKR")
	if not okr:
		return {}
	out: dict[str, dict] = {}
	for r in tree.child_table_rows(okr, "key_results"):
		target = float(r.get("target_value") or 0)
		current = float(r.get("current_value") or 0)
		out[r["name"]] = {
			"label": r.get("metric"),
			"target": target,
			"current": current,
			"progress": round((current / target) if target else 0.0, 3),
		}
	return out


def _group_by_pdca(_p: str, tasks: list[dict]) -> list[dict]:
	order = ["BACKLOG", "PLAN", "DO", "CHECK", "ACT", "CLOSED"]
	bucket_map = {phase: [] for phase in order}
	for t in tasks:
		bucket_map.setdefault(t["pdca_phase"] or "BACKLOG", []).append(_task_row(t))
	return [{"key": p, "label": p, "meta": {}, "tasks": bucket_map[p]} for p in order if bucket_map[p]]


def _group_by_sprint(_p: str, tasks: list[dict]) -> list[dict]:
	buckets: dict[str, list] = {}
	for t in tasks:
		key = t["sprint"] or "__no_sprint__"
		buckets.setdefault(key, []).append(_task_row(t))
	return [
		{"key": k, "label": k if k != "__no_sprint__" else "No Sprint", "meta": {}, "tasks": v}
		for k, v in buckets.items()
	]


def _group_by_assignee(_p: str, tasks: list[dict]) -> list[dict]:
	buckets: dict[str, list] = {}
	for t in tasks:
		key = t["assignee"] or "__unassigned__"
		buckets.setdefault(key, []).append(_task_row(t))
	return [
		{"key": k, "label": k if k != "__unassigned__" else "Unassigned", "meta": {}, "tasks": v}
		for k, v in buckets.items()
	]


def _group_by_due(_p: str, tasks: list[dict]) -> list[dict]:
	from datetime import date, timedelta
	from frappe.utils import getdate
	today = date.today()
	week_end = today + timedelta(days=(6 - today.weekday()))
	buckets = {"overdue": [], "today": [], "this_week": [], "later": [], "no_date": []}
	for t in tasks:
		if not t["due_date"]:
			buckets["no_date"].append(_task_row(t))
			continue
		d = getdate(t["due_date"])
		if d < today:
			buckets["overdue"].append(_task_row(t))
		elif d == today:
			buckets["today"].append(_task_row(t))
		elif d <= week_end:
			buckets["this_week"].append(_task_row(t))
		else:
			buckets["later"].append(_task_row(t))
	labels = {
		"overdue": "Overdue", "today": "Today", "this_week": "This Week",
		"later": "Later", "no_date": "No date",
	}
	return [
		{"key": k, "label": labels[k], "meta": {}, "tasks": v}
		for k, v in buckets.items() if v
	]
